import { useCallback, useEffect, useRef } from "react";
import { WebRTCManager } from "@/lib/webrtc";
import { socketService } from "@/lib/socket";
import { useStore } from "../store/useStore";




export const useRoom = () => {
  const {
    currentUser,
    currentRoom,
    localStream,
    isAudioOn,
    isVideoOn,
    isScreenSharing,
    setCurrentUser,
    setCurrentRoom,
  
    addParticipant,
    removeParticipant,
    updateParticipant,
    setLoading,
    setError,
    resetRoom
  } = useStore();

  const webrtcManagerRef = useRef<WebRTCManager | null>(null);

  /* -------------------------------- SOCKET INIT -------------------------------- */

  useEffect(() => {
    const initSocket = async () => {
      try {
        await socketService.connect();

        /* 🔥 USER JOINED */
        socketService.onUserJoined((user) => {
          console.log("👤 User joined:", user.userName);

          addParticipant(user.userId, {
            id: user.userId,
            userName: user.userName,
            isHost: false,
            isVideoOn: user.isVideoOn,
            isAudioOn: user.isAudioOn,
            isScreenSharing: user.isScreenSharing ?? false
          });

          // ✅ HOST creates peer (NOT initiator)
          if (webrtcManagerRef.current) {
            webrtcManagerRef.current.createPeer(user.socketId, false);
          }
        });

        /* 🔥 USER LEFT */
        socketService.onUserLeft(({ userId, socketId }) => {
          removeParticipant(userId);
          webrtcManagerRef.current?.removePeer(socketId);
        });

        /* 🔊 AUDIO TOGGLE */
        socketService.onMediaToggled("audio", (data) => {
          updateParticipant(data.userId, { isAudioOn: data.state });
        });

        /* 🎥 VIDEO TOGGLE */
        socketService.onMediaToggled("video", (data) => {
          updateParticipant(data.userId, { isVideoOn: data.state });
        });

        // /* 🖥 SCREEN SHARE */
        // socketService.onMediaToggled("screen-share-start", ({ userId }) => {
        //   updateParticipant(userId, { isScreenSharing: true });
        // });

        // socketService.onMediaToggled("screen-share-stop", ({ userId }) => {
        //   updateParticipant(userId, { isScreenSharing: false });
        // });

      } catch (err) {
        console.error("Socket error:", err);
        setError("Failed to connect to server");
      }
    };

    initSocket();

    return () => {
      webrtcManagerRef.current?.cleanup();
    };
  }, []);

  /* -------------------------------- CREATE ROOM -------------------------------- */

  const createRoom = useCallback(async (userName: string, roomId: string) => {
    setLoading(true);
    try {
      const res = await socketService.createRoom(userName, roomId);

      setCurrentUser({
        id: res.userId,
        userName,
        isHost: true
      });

      setCurrentRoom({
        id: res.roomId,
        hostId: res.userId
      });

      webrtcManagerRef.current = new WebRTCManager(res.socketId, res.roomId);

      return res;
    } finally {
      setLoading(false);
    }
  }, []);

  /* -------------------------------- JOIN ROOM -------------------------------- */

  const joinRoom = useCallback(async (roomId: string, userName: string,password?: string) => {
    setLoading(true);
    try {
      const res = await socketService.joinRoom(roomId, userName, password);

      setCurrentUser({
        id: res.userId,
        userName,
        isHost: false
      });

      setCurrentRoom({
        id: res.roomId,
        hostId: res.hostId
      });

      webrtcManagerRef.current = new WebRTCManager(res.socketId, res.roomId);

      /* ✅ ADD EXISTING PARTICIPANTS */
      res.participants.forEach((p) => {
        addParticipant(p.userId, {
          id: p.userId,
          userName: p.userName,
          isHost: false,
          isVideoOn: p.isVideoOn,
          isAudioOn: p.isAudioOn,
          isScreenSharing: p.isScreenSharing ?? false
        });
      });

      /* ✅ GUEST CREATES PEERS (initiator = true) */
      res.participants.forEach((p) => {
        webrtcManagerRef.current?.createPeer(p.socketId, true);
      });

      return res;
    } finally {
      setLoading(false);
    }
  }, []);

  /* -------------------------------- MEDIA CONTROLS -------------------------------- */

  const toggleLocalVideo = useCallback(() => {
    if (!localStream || !currentUser || !currentRoom) return;

    const track = localStream.getVideoTracks()[0];
    if (!track) return;

    track.enabled = !isVideoOn;
    useStore.getState().toggleVideo();

    socketService.toggleVideo(currentRoom.id, currentUser.id, !isVideoOn);
  }, [localStream, isVideoOn, currentUser, currentRoom]);

  const toggleLocalAudio = useCallback(() => {
    if (!localStream || !currentUser || !currentRoom) return;

    const track = localStream.getAudioTracks()[0];
    if (!track) return;

    track.enabled = !isAudioOn;
    useStore.getState().toggleAudio();

    socketService.toggleAudio(currentRoom.id, currentUser.id, !isAudioOn);
  }, [localStream, isAudioOn, currentUser, currentRoom]);

  /* -------------------------------- LEAVE ROOM -------------------------------- */

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
    isVideoOn,
    isAudioOn,
    isScreenSharing,
     isLoading: useStore((state) => state.isLoading),
  error: useStore((state) => state.error),
  setError: useStore((state) => state.setError),
   localStream: useStore((state) => state.localStream),
   setLocalStream: useStore((state) => state.setLocalStream),
    createRoom,
    joinRoom,
    leaveRoom,

    toggleLocalVideo,
    toggleLocalAudio
  };
};
