import { useCallback, useEffect, useRef } from "react";
import { WebRTCManager, WebRTCEvent } from "@/lib/webrtc";
import { socketService } from "@/lib/socket";
import { useStore } from "../store/useStore";

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
    console.log("👤 User joined:", user.userName);

    addParticipant(user.userId, {
      id: user.userId,
      userName: user.userName,
      isHost: false,
      isVideoOn: user.isVideoOn,
      isAudioOn: user.isAudioOn,
      isScreenSharing: false,
      socketId: user.socketId
    });

    const mySocketId = socketService.getSocketId();

    // ✅ IMPORTANT RULE:
    // Existing users (host) DO NOT create offers here
    // They only prepare peer to RECEIVE offer
    if (webrtcManagerRef.current && user.socketId !== mySocketId) {
      console.log("🧩 Preparing peer for incoming offer:", user.userName);
      webrtcManagerRef.current.createPeer(user.socketId, false); // ❗ NOT initiator
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
    console.log("📡 STREAM EVENT:", {
      peerSocketId: event.peerId,
      streamId: event.stream.id,
      tracks: event.stream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        id: t.id
      }))
    });

    // Debug: Log all participants to find matching socketId
    const allParticipants = Array.from(currentRoom.participants.values());
    console.log("🔍 Searching for participant with socketId:", event.peerId);
    console.log("Available participants:", allParticipants.map(p => ({
      name: p.userName,
      userId: p.id,
      socketId: p.socketId
    })));

    const participant = allParticipants.find(p => p.socketId === event.peerId);
    
    if (!participant) {
      console.error("❌ NO MATCHING PARTICIPANT FOUND!");
      return;
    }

    console.log("✅ Found participant:", participant.userName);
    
    // Check if stream is already the same
    if (participant.stream?.id === event.stream.id) {
      console.log("⏸️ Stream already set, skipping");
      return;
    }

    updateParticipant(participant.id, {
      stream: event.stream
    });
    
    console.log("✅ Participant updated with stream");
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

      setCurrentUser({
        id: res.userId,
        userName,
        isHost: true,
        socketId: socketService.getSocketId()!
      });

      setCurrentRoom({
        id: res.roomId,
        hostId: res.userId
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

      setCurrentUser({
        id: res.userId,
        userName,
        isHost: false,
        socketId: socketService.getSocketId()!
      });

      setCurrentRoom({
        id: res.roomId,
        hostId: res.hostId
      });

      res.participants.forEach((p) => {
        addParticipant(p.userId, {
          id: p.userId,
          socketId: p.socketId,
          userName: p.userName,
          isHost: false,
          isVideoOn: p.isVideoOn,
          isAudioOn: p.isAudioOn,
          isScreenSharing: false,
        
        });
      });

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
