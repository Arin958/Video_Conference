import { useCallback, useEffect, useRef } from "react";
import { WebRTCManager } from "@/lib/webrtc";
import { socketService } from "@/lib/socket";
import { useStore } from "../store/useStore";



interface DebugInfo {
  hasLocalStream: boolean;
  localStreamTracks: number;
  hasUser: boolean;
  hasRoom: boolean;
  hasManager: boolean;
  participantsCount: number;
}

// Declare a global interface for debugging purposes
declare global {
  interface Window {
    webrtcManager?: WebRTCManager;
  }
}

  // Remove local WebRTCEvent interface and import from webrtc lib
  import type { WebRTCEvent } from "@/lib/webrtc";

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


useEffect(() => {
  console.log('🔄 WebRTC Init Check:', {
    hasLocalStream: !!localStream,
    localStreamTracks: localStream?.getTracks().length || 0,
    hasUser: !!currentUser,
    hasRoom: !!currentRoom,
    hasManager: !!webrtcManagerRef.current,
    participantsCount: currentRoom?.participants.size || 0
  } as DebugInfo);
  
  if (localStream && currentUser && currentRoom && !webrtcManagerRef.current) {
    console.log('🎥 Local stream ready, initializing WebRTC...');
    
    // Create WebRTC manager
    webrtcManagerRef.current = new WebRTCManager(currentUser.id, currentRoom.id);
    console.log('✅ WebRTC Manager created');
    
    // Set the local stream
    webrtcManagerRef.current.setLocalStream(localStream);
    console.log('✅ Local stream set in WebRTC manager');
    
    // For guests: Connect to existing participants
    if (!currentUser.isHost && currentRoom.participants.size > 0) {
      console.log('👤 Guest: Found', currentRoom.participants.size, 'participants to connect to');
      
      Array.from(currentRoom.participants.values()).forEach((participant, index) => {
        console.log(`👤 Participant ${index + 1}:`, {
          name: participant.userName,
          socketId: participant.socketId,
          id: participant.id
        });
        
        if (participant.socketId && participant.id !== currentUser.id) {
          console.log(`🔗 Creating peer connection with ${participant.userName}...`);
          webrtcManagerRef.current?.createPeer(participant.socketId, true);
        }
      });
    } else if (currentUser.isHost) {
      console.log('🏠 Host: Waiting for guests to connect to me...');
    }
    
    // For debugging in console - using type-safe window property
    window.webrtcManager = webrtcManagerRef.current;
    console.log('🔧 WebRTC manager exposed as window.webrtcManager');
  }
}, [localStream, currentUser, currentRoom]);

// Add this useEffect AFTER your existing useEffects
useEffect(() => {
    if (!webrtcManagerRef.current) return;
    
    console.log('🔗 Setting up WebRTC event handler...');
    
 
    const handleWebRTCEvent = (event: WebRTCEvent) => {
        console.log('📡 WebRTC Event:', event.type, 'peerId' in event ? event.peerId : undefined);
        
        if (event.type === 'stream') {
            if (event.stream) {
                console.log(`🎬 Stream received for peer: ${event.peerId}`, {
                    videoTracks: event.stream.getVideoTracks().length,
                    audioTracks: event.stream.getAudioTracks().length
                });
            } else {
                console.log(`❌ No stream received for peer: ${event.peerId}`);
            }
            
            // Find which participant has this socketId
            if (currentRoom?.participants) {
                let found = false;
                Array.from(currentRoom.participants.values()).forEach(participant => {
                    if (participant.socketId === event.peerId) {
                        console.log(`✅ Updating stream for ${participant.userName}`);
                        updateParticipant(participant.id, { 
                            stream: event.stream 
                        });
                        found = true;
                    }
                });
                
                if (!found) {
                    console.log(`❌ No participant found with socketId: ${event.peerId}`);
                    console.log('Available participants:', 
                        Array.from(currentRoom.participants.values()).map(p => ({
                            name: p.userName,
                            socketId: p.socketId
                        }))
                    );
                }
            }
        }
    };
    
    webrtcManagerRef.current.onEvent(handleWebRTCEvent);
    
    return () => {
        if (webrtcManagerRef.current) {
            webrtcManagerRef.current.offEvent(handleWebRTCEvent);
        }
    };
}, [currentRoom, updateParticipant]);

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

     

      /* ✅ ADD EXISTING PARTICIPANTS */
      res.participants.forEach((p) => {
        addParticipant(p.userId, {
          id: p.userId,
          userName: p.userName,
          isHost: false,
          isVideoOn: p.isVideoOn,
          isAudioOn: p.isAudioOn,
          isScreenSharing: p.isScreenSharing ?? false,
          socketId: p.socketId
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
