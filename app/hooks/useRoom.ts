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
    setIsVideoOn,
    setIsAudioOn,
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

    const exists = useStore
  .getState()
  .currentRoom
  ?.participants
  ?.has(user.userId);

if (exists) {
  console.log("⚠️ Participant already exists:", user.userName);
  return;
}

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
  const state = useStore.getState();
  const room = state.currentRoom;

  if (!room) {
    console.error("❌ No room in store");
    return;
  }

  const participant = Array.from(room.participants.values())
    .find(p => p.socketId === event.peerId);

  if (!participant) {
    console.warn(
      "⏳ Participant not yet in store, retrying...",
      event.peerId
    );

    // retry once after microtask
    setTimeout(() => {
      const retryState = useStore.getState();
      const retryParticipant = Array.from(
        retryState.currentRoom?.participants.values() || []
      ).find(p => p.socketId === event.peerId);

      if (retryParticipant) {
        updateParticipant(retryParticipant.id, {
          stream: event.stream
        });
      }
    }, 0);

    return;
  }

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

const toggleLocalVideo = useCallback(async () => {
  if (!currentUser || !currentRoom || !localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];

  try {
    /* =======================
       TURN CAMERA OFF
    ======================= */
    if (isVideoOn) {
      console.log("🔌 Turning camera off");
      if (videoTrack) {
        videoTrack.enabled = false;
        setIsVideoOn(false);
      }

      socketService.toggleVideo(
        currentRoom.id,
        currentUser.id,
        false
      );

      console.log("🔌 Camera turned off", isVideoOn, videoTrack);

      return;
    }

    /* =======================
       TURN CAMERA ON
    ======================= */
    // Case 1: Track exists and is live → just enable
    if (videoTrack && videoTrack.readyState === "live") {
      console.log("🔌 Turning camera on");
      videoTrack.enabled = true;
      setIsVideoOn(true);
    }
    // Case 2: Track missing or stopped → recreate
    else {
      console.log("🔌 Creating new camera track");
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: true
      });

      const newTrack = newStream.getVideoTracks()[0];

      // Remove old tracks (if any)
      localStream.getVideoTracks().forEach(t => {
        localStream.removeTrack(t);
        t.stop();
      });

      // Add new track to SAME stream
      localStream.addTrack(newTrack);

      // 🔥 THIS IS CRITICAL
      webrtcManagerRef.current?.replaceTrack("video", newTrack);
    }


    console.log("🔌 Camera turned on", isVideoOn, videoTrack);

    socketService.toggleVideo(
      currentRoom.id,
      currentUser.id,
      true
    );

  } catch (err) {
    console.error("toggleLocalVideo failed:", err);
    setError("Failed to toggle camera");
  }
}, [localStream, isVideoOn, currentUser, currentRoom]);




const toggleLocalAudio = useCallback(() => {
  if (!localStream || !currentUser || !currentRoom) return;

  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return;

  // 🔴 TURN MIC OFF
  if (isAudioOn) {
    audioTrack.enabled = false;
    setIsAudioOn(false); // ✅ CRITICAL

    socketService.toggleAudio(
      currentRoom.id,
      currentUser.id,
      false
    );
    return;
  }

  // 🟢 TURN MIC ON
  audioTrack.enabled = true;
  setIsAudioOn(true); // ✅ CRITICAL

  socketService.toggleAudio(
    currentRoom.id,
    currentUser.id,
    true
  );
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
