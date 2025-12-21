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

  const webrtcManagerRef = useRef<WebRTCManager | null>(null);

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

      // 🔥 EXISTING USERS DO NOT CREATE OFFER
      webrtcManagerRef.current?.createPeer(user.socketId, false);
    });

    socketService.onUserLeft(({ userId, socketId }) => {
      removeParticipant(userId);
      webrtcManagerRef.current?.removePeer(socketId);
    });

    socketService.onMediaToggled("audio", ({ userId, state }) => {
      updateParticipant(userId, { isAudioOn: state });
    });

    socketService.onMediaToggled("video", ({ userId, state }) => {
      updateParticipant(userId, { isVideoOn: state });
    });

    return () => {
      webrtcManagerRef.current?.cleanup();
    };
  }, []);

  /* -------------------------------------------------------------------------- */
  /*                        WEBRTC MANAGER INITIALIZATION                        */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (webrtcManagerRef.current) return;
    if (!localStream || !currentUser || !currentRoom) return;

    console.log("🔥 Creating WebRTCManager");

    const manager = new WebRTCManager(
      currentUser.id,
      currentRoom.id
    );

    manager.setLocalStream(localStream);

    // 🔥 REGISTER EVENT LISTENER IMMEDIATELY
    manager.onEvent((event: WebRTCEvent) => {
      console.log("🎯 WebRTC Event:", event);

      if (event.type === "stream" && event.stream) {
        const peerSocketId = event.peerId;

        const participant = Array.from(
          currentRoom.participants.values()
        ).find(p => p.socketId === peerSocketId);

        if (!participant) {
          console.warn("❌ No participant for socket:", peerSocketId);
          return;
        }

        updateParticipant(participant.id, {
          stream: event.stream
        });
      }
    });

    webrtcManagerRef.current = manager;
    window.webrtcManager = manager;
  }, [
    !!localStream,
    currentUser?.id,
    currentRoom?.id
  ]);

  /* -------------------------------------------------------------------------- */
  /*                          GUEST → CREATE OFFERS                              */
  /* -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!webrtcManagerRef.current || !currentRoom) return;

    const mySocketId = socketService.getSocketId();

    currentRoom.participants.forEach((p) => {
      if (p.socketId && p.socketId !== mySocketId) {
        console.log("📤 Guest creating offer to:", p.userName);
        webrtcManagerRef.current!.createPeer(p.socketId, true);
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
