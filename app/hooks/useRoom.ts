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

  if (webrtcManagerRef.current) {
    // Update stream if camera was enabled later
    webrtcManagerRef.current.setLocalStream(localStream);
    return;
  }

  console.log("🔥 Getting WebRTCManager instance");
  
  // Use getInstance() instead of create()
  try {
    webrtcManagerRef.current = WebRTCManager.getInstance(
      currentUser.socketId,
      currentRoom.id
    );

    webrtcManagerRef.current.setLocalStream(localStream);

    webrtcManagerRef.current.onEvent((event: WebRTCEvent) => {
      if (event.type === "stream" && event.stream) {
        const participant = Array.from(
          currentRoom.participants.values()
        ).find(p => p.socketId === event.peerId);

        if (!participant) return;

        updateParticipant(participant.id, {
          stream: event.stream
        });
      }
    });

    window.webrtcManager = webrtcManagerRef.current;
  } catch (error) {
    console.error("Failed to get WebRTCManager instance:", error);
  }
}, [currentUser?.socketId, currentRoom?.id, localStream]);
 

  /* -------------------------------------------------------------------------- */
  /*                          GUEST → CREATE OFFERS                              */
  /* -------------------------------------------------------------------------- */

useEffect(() => {
  if (!webrtcManagerRef.current || !currentRoom) return;

  const mySocketId = socketService.getSocketId();

  currentRoom.participants.forEach((p) => {
    if (p.socketId && p.socketId !== mySocketId) {
      console.log("📤 Guest creating offer to:", p.userName);
      webrtcManagerRef.current?.createPeer(p.socketId, true);
    }
  });
}, [currentRoom?.id]);

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
