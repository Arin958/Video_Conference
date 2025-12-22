import { useCallback, useEffect, useRef } from "react";
import { WebRTCManager, WebRTCEvent } from "@/lib/webrtc";
import { socketService } from "@/lib/socket";
import { User, useStore } from "../store/useStore";

declare global {
  interface Window {
    webrtcManager?: WebRTCManager;
  }
}

export const useRoom = () => {
  const webrtcManagerRef = useRef<WebRTCManager | null>(null);
  const {
    currentUser,
    currentRoom,
    localStream,
    isAudioOn,
    isVideoOn,
    isLoading,
    setLocalStream,
    setCurrentUser,
    setCurrentRoom,
    addParticipant,
    removeParticipant,
    updateParticipant,
    setLoading,
    error,
  
    setError,
    resetRoom
  } = useStore();

 ;

  /* -------------------------------------------------------------------------- */
  /*                               SOCKET SETUP                                 */
  /* -------------------------------------------------------------------------- */

  

 useEffect(() => {
  socketService.connect();

  socketService.onUserJoined((user) => {
      console.log("👤 HOST RECEIVED user-joined EVENT - DETAILED:", {
        userId: user.userId,
        userName: user.userName,
        socketId: user.socketId,
        fullEvent: user
    });

    // Check current store state BEFORE update
    const currentState = useStore.getState();
    console.log("📊 Store BEFORE update:", {
        totalParticipants: currentState.currentRoom?.participants?.size || 0,
        participants: Array.from(currentState.currentRoom?.participants?.values() || []).map(p => ({
            name: p.userName,
            socketId: p.socketId
        }))
    });

    // Create participant data
    const participantData = {
        id: user.userId,
        userName: user.userName,
        isHost: false,
        isVideoOn: user.isVideoOn !== undefined ? user.isVideoOn : true,
        isAudioOn: user.isAudioOn !== undefined ? user.isAudioOn : true,
        isScreenSharing: false,
        socketId: user.socketId  // ⚠️ CRITICAL
    };

    console.log("📝 Adding participant:", participantData);

    // Add to store
    addParticipant(user.userId, participantData);

    // Check store state AFTER update
    setTimeout(() => {
        const updatedState = useStore.getState();
        console.log("📊 Store AFTER update:", {
            totalParticipants: updatedState.currentRoom?.participants?.size || 0,
            participants: Array.from(updatedState.currentRoom?.participants?.values() || []).map(p => ({
                name: p.userName,
                socketId: p.socketId
            }))
        });
    }, 100);

    const mySocketId = socketService.getSocketId();
    
    if (webrtcManagerRef.current && user.socketId !== mySocketId) {
        console.log("🧩 Preparing peer for incoming offer:", user.userName);
        webrtcManagerRef.current.createPeer(user.socketId, false);
    }
  });

  socketService.onUserLeft(({ userId, socketId }) => {
    removeParticipant(userId);
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.removePeer(socketId);
    }
  });

  socketService.onMediaToggled("audio", ({ userId, state }) => {
    updateParticipant(userId, { isAudioOn: state });
  });

  socketService.onMediaToggled("video", ({ userId, state }) => {
    updateParticipant(userId, { isVideoOn: state });
  });

  return () => {
    // ✅ ONLY disconnect socket here
  };
}, []);


  /* -------------------------------------------------------------------------- */
  /*                        WEBRTC MANAGER INITIALIZATION                        */
  /* -------------------------------------------------------------------------- */

useEffect(() => {
  if (!currentUser || !currentRoom || !localStream) return;

  // If manager exists, just update the stream
  if (webrtcManagerRef.current) {
    webrtcManagerRef.current.setLocalStream(localStream);
    return;
  }

  console.log("🔥 Initializing WebRTCManager for", 
    currentUser.isHost ? "HOST" : "GUEST"
  );

  try {
    // 1. Get WebRTCManager instance
    webrtcManagerRef.current = WebRTCManager.getInstance(
      currentUser.socketId,
      currentRoom.id
    );

    // 2. Set local stream
    webrtcManagerRef.current.setLocalStream(localStream);

    // 3. Setup event handler
webrtcManagerRef.current.onEvent((event: WebRTCEvent) => {
    if (event.type === "stream" && event.stream) {
        console.log("📡 STREAM EVENT: Looking for participant with socketId:", event.peerId);
        
        // Log ALL participants for debugging
        const allParticipants = Array.from(currentRoom.participants.values());
        console.log("🔍 ALL PARTICIPANTS IN STORE:", 
            allParticipants.map(p => ({
                id: p.id,
                name: p.userName,
                storedSocketId: p.socketId,
                storedSocketIdType: typeof p.socketId,
                socketIdLength: p.socketId?.length,
                matches: p.socketId === event.peerId
            }))
        );

        // Try different ways to find the participant
        let participant = allParticipants.find(p => p.socketId === event.peerId);
        
        if (!participant) {
            console.log("⚠️ Exact socketId match failed, trying case-insensitive...");
            participant = allParticipants.find(p => 
                p.socketId?.toLowerCase() === event.peerId?.toLowerCase()
            );
        }
        
        if (!participant) {
            console.log("⚠️ Case-insensitive match failed, looking for any participant without stream...");
            participant = allParticipants.find(p => !p.stream);
        }
        
        if (!participant) {
            console.log("⚠️ No participant without stream, taking first non-local participant...");
            const mySocketId = socketService.getSocketId();
            participant = allParticipants.find(p => p.socketId !== mySocketId);
        }

        if (!participant) {
            console.error("❌ Could not find ANY matching participant!");
            
            // Create a temporary participant as fallback
            const tempId = `temp_${event.peerId}`;
            const tempParticipant = {
                id: tempId,
                userName: `User_${event.peerId.substring(0, 8)}`,
                isHost: false,
                isVideoOn: true,
                isAudioOn: true,
                isScreenSharing: false,
                socketId: event.peerId
            };
            
            console.log("🆕 Creating fallback participant:", tempParticipant.userName);
            addParticipant(tempId, tempParticipant);
            participant = tempParticipant;
        }

        console.log(`✅ Found participant: ${participant.userName} (socketId: ${participant.socketId})`);
        
        updateParticipant(participant.id, {
            stream: event.stream
        });
    }
});


      /* -------------------------------------------------------------------------- */
  /*                          GUEST → CREATE OFFERS                              */
  /* -------------------------------------------------------------------------- */

    // 4. GUEST-SPECIFIC: Create offers to existing participants
    if (!currentUser.isHost) {
      console.log("🎯 Guest: Creating WebRTC offers");
      const mySocketId = socketService.getSocketId();
      let offerCount = 0;
      
      currentRoom.participants.forEach((p) => {
        if (p.socketId && p.socketId !== mySocketId) {
          console.log(`📤 Offer ${++offerCount}: Creating to ${p.userName} (${p.socketId})`);
          webrtcManagerRef.current?.createPeer(p.socketId, true);
        }
      });
      
      if (offerCount === 0) {
        console.log("ℹ️ No existing participants to connect to");
      }
    } else {
      console.log("⏸️ Host: Waiting for incoming offers");
    }

    // Expose for debugging
    window.webrtcManager = webrtcManagerRef.current;
  } catch (error) {
    console.error("Failed to initialize WebRTCManager:", error);
  }
}, [currentUser?.socketId, currentRoom?.id, localStream]);
 




  /* -------------------------------------------------------------------------- */
  /*                              CREATE ROOM                                    */
  /* -------------------------------------------------------------------------- */

 const createRoom = useCallback(async (userName: string, roomId: string) => {
    setLoading(true);
    try {
        const res = await socketService.createRoom(userName, roomId);

        // Create participants Map with just the host
        const participantsMap = new Map<string, User>();
        participantsMap.set(res.userId, {
            id: res.userId,
            userName,
            isHost: true,
            isVideoOn: true,
            isAudioOn: true,
            isScreenSharing: false,
            socketId: socketService.getSocketId()!
        });

        setCurrentUser({
            id: res.userId,
            userName,
            isHost: true,
            socketId: socketService.getSocketId()!
        });

        // Pass participants Map
        setCurrentRoom({
            id: res.roomId,
            hostId: res.userId,
            participants: participantsMap
        });

        return res;
    } finally {
        setLoading(false);
    }
}, []);
  /* -------------------------------------------------------------------------- */
  /*                               JOIN ROOM                                     */
  /* -------------------------------------------------------------------------- */

const joinRoom = useCallback(async (roomId: string, userName: string, password?: string) => {
    setLoading(true);
    try {
        const res = await socketService.joinRoom(roomId, userName, password);

        // Create participants Map from server response
        const participantsMap = new Map<string, User>();
        
        res.participants.forEach((p) => {
            console.log("👥 Adding participant from server:", p.userName, "socketId:", p.socketId);
            
            participantsMap.set(p.userId, {
                id: p.userId,
                userName: p.userName,
                isHost: p.userId === res.hostId,
                isVideoOn: p.isVideoOn !== undefined ? p.isVideoOn : true,
                isAudioOn: p.isAudioOn !== undefined ? p.isAudioOn : true,
                isScreenSharing: false,
                socketId: p.socketId  // ⚠️ CRITICAL
            });
        });

        setCurrentUser({
            id: res.userId,
            userName,
            isHost: false,
            socketId: socketService.getSocketId()!
        });

        // ⚠️ CRITICAL FIX: Pass participants to setCurrentRoom
        setCurrentRoom({
            id: res.roomId,
            hostId: res.hostId,
            participants: participantsMap  // ⚠️ Pass the participants Map
        });

        console.log("✅ Joined room with participants:", Array.from(participantsMap.values()).map(p => p.userName));

        return res;
    } finally {
        setLoading(false);
    }
}, []);

  /* -------------------------------------------------------------------------- */
  /*                               MEDIA CONTROLS                                */
  /* -------------------------------------------------------------------------- */

  const toggleLocalVideo = useCallback(() => {
    if (!localStream || !currentUser || !currentRoom) return;

    const track = localStream.getVideoTracks()[0];
    if (!track) return;

    track.enabled = !isVideoOn;
    socketService.toggleVideo(currentRoom.id, currentUser.id, !isVideoOn);
  }, [localStream, isVideoOn, currentUser, currentRoom]);

  const toggleLocalAudio = useCallback(() => {
    if (!localStream || !currentUser || !currentRoom) return;

    const track = localStream.getAudioTracks()[0];
    if (!track) return;

    track.enabled = !isAudioOn;
    socketService.toggleAudio(currentRoom.id, currentUser.id, !isAudioOn);
  }, [localStream, isAudioOn, currentUser, currentRoom]);

  /* -------------------------------------------------------------------------- */
  /*                                LEAVE ROOM                                   */
  /* -------------------------------------------------------------------------- */

const leaveRoom = useCallback(() => {
  if (currentUser && currentRoom) {
    socketService.leaveRoom(currentRoom.id, currentUser.id);
  }

  webrtcManagerRef.current?.cleanup();
  webrtcManagerRef.current = null; // 🔥 RESET SINGLETON
  window.webrtcManager = undefined; // 🔥 RESET SINGLETON

  resetRoom();
}, [currentUser, currentRoom]);

  return {
    currentUser,
    currentRoom,
    localStream,
    isVideoOn,
    isAudioOn,
    isLoading,
    createRoom,
    joinRoom,
    leaveRoom,
    setLocalStream,
    error,
    setError,
    toggleLocalVideo,
    toggleLocalAudio
  };
};
