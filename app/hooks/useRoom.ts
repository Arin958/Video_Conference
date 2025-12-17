import { WebRTCManager } from "@/lib/webrtc"
import { useStore } from "../store/useStore"
import {  useCallback, useEffect, useRef } from "react";
import { socketService } from "@/lib/socket";


interface MediaToggleData {
  userId: string;
  state: boolean;
}


export const useRoom = () => {
    const { currentUser, currentRoom, localStream, screenStream, isAudioOn, isVideoOn, isScreenSharing, setCurrentUser, setCurrentRoom, setLocalStream, setScreenStream, addParticipant, removeParticipant, updateParticipant, setLoading, setError, resetRoom } = useStore()


    const webrtcManagerRef = useRef<WebRTCManager | null>(null);

  useEffect(() => {
        const initSocket = async () => {
            try {
                await socketService.connect();

                socketService.onUserJoined((user) => {
                    console.log("User joined:", user.userName);
                    addParticipant(user.userId, {
                        id: user.userId,
                        userName: user.userName,
                        isHost: false,
                        isVideoOn: user.isVideoOn,
                        isAudioOn: user.isAudioOn,
                        isScreenSharing: user.isScreenSharing || false
                    });

                    if (webrtcManagerRef.current && currentUser) {
                        webrtcManagerRef.current.createPeer(user.userId, false);
                    }
                })

                socketService.onUserLeft(({ userId }) => {
                    console.log("User left:", userId);
                    removeParticipant(userId);

                    if (webrtcManagerRef.current) {
                        webrtcManagerRef.current?.removePeer(userId);
                    }
                })

                // Handle audio toggle - TypeScript knows this will have 'state' property
                socketService.onMediaToggled("audio", (data) => {
                    // Check if it's the correct type for audio
                    if ('state' in data) {
                        updateParticipant(data.userId, { isAudioOn: data.state })
                    }
                })

                // Handle video toggle
                socketService.onMediaToggled("video", (data) => {
                    if ('state' in data) {
                        updateParticipant(data.userId, { isVideoOn: data.state })
                    }
                })

                // Handle screen share events if needed
                socketService.onMediaToggled("screen-share-start", (data) => {
                    console.log("Screen share started:", data);
                    // Handle screen share start
                    if ('userId' in data) {
                        updateParticipant(data.userId, { isScreenSharing: true })
                    }
                })

                socketService.onMediaToggled("screen-share-stop", (data) => {
                    console.log("Screen share stopped:", data);
                    // Handle screen share stop
                    if ('userId' in data) {
                        updateParticipant(data.userId, { isScreenSharing: false })
                    }
                })

            } catch (error) {
                console.log("Socket connection error:", error);
                setError("Failed to connect to the server.");
            }
        }
        initSocket();

        return () => {
            socketService.disconnect();
            webrtcManagerRef.current?.cleanup();
        }
    }, []);

    const createRoom = useCallback(async ( userName: string,roomId: string) => {
        setLoading(true);
        setError(null);


        try {
            const response = await socketService.createRoom(userName, roomId);
            setCurrentUser({
                id: response.userId,
                userName: userName,
                isHost: response.isHost
            })


            setCurrentRoom({
                id: response.roomId,
                hostId: response.userId,
            })


            webrtcManagerRef.current = new WebRTCManager(response.userId, response.roomId)

            return response;
        } catch (error) {
            console.log("Create room error:", error);
            setError("Failed to create room.");
            throw error;
        } finally {
            setLoading(false);
        }
    }, []);

    const joinRoom = useCallback(async (roomId: string, userName: string, password?: string) => {
        setLoading(true);
        setError(null);


        try {
            const response = await socketService.joinRoom(roomId, userName, password);

            setCurrentUser({
                id: response.userId,
                userName: userName,
                isHost: response.isHost
            })

            setCurrentRoom({
                id: response.roomId,
                hostId: response.participants[0]?.userId || response.userId
            })

            webrtcManagerRef.current = new WebRTCManager(response.userId, response.roomId)


            response.participants.forEach(participant => {
                addParticipant(participant.userId, {
                    id: participant.userId,
                    userName: participant.userName,
                    isHost: false,
                    isVideoOn: participant.isVideoOn,
                    isAudioOn: participant.isAudioOn,
                    isScreenSharing: participant.isScreenSharing || false
                })
            })


            return response
        } catch (error) {
             setError(error instanceof Error ? error.message : "Failed to join room.");
            throw error;
        } finally {
            setLoading(false);
        }
    }, [])


    const leaveRoom = useCallback(() => {
            if(currentUser && currentRoom) {
                socketService.leaveRoom(currentRoom.id, currentUser.id)
            }

            webrtcManagerRef.current?.cleanup();
            resetRoom();
    }, [currentRoom, currentUser])


    const toggleLocalVideo = useCallback(async() => {
        if(localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if(videoTrack) {
                videoTrack.enabled = !isVideoOn;

                useStore.getState().toggleVideo()

                if(currentUser && currentRoom) {
                   socketService.toggleVideo(currentRoom.id, currentUser.id, !isVideoOn);
                }
            }
        }
    }, [localStream, isVideoOn, currentUser, currentRoom])


    const toggleLocalAudio = useCallback(async() => {
        if(localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if(audioTrack) {
                audioTrack.enabled = !isAudioOn;

                useStore.getState().toggleAudio()

                if(currentUser && currentRoom) {
                     socketService.toggleAudio(currentRoom.id, currentUser.id, !isAudioOn);
                }
            }
        }
    }, [localStream, isAudioOn, currentUser, currentRoom])


    const startScreenShare = useCallback(async() => {
               if(webrtcManagerRef.current && !isScreenSharing) {
                const stream = await webrtcManagerRef.current.startScreenSharing();

                if(stream) {
                    setScreenStream(stream);
                    useStore.getState().toggleScreenShare();
                    socketService.startScreenShare(currentRoom!.id, currentUser!.id);
                }
               }
    }, [webrtcManagerRef, isScreenSharing, currentRoom, currentUser]);


    const stopScreenShare = useCallback(() => {
        if(webrtcManagerRef.current ) {
            webrtcManagerRef.current.stopScreenSharing();
            setScreenStream(null);
            useStore.getState().toggleScreenShare()

            if(currentUser && currentRoom) {
                socketService.stopScreenShare(currentRoom.id, currentUser.id);
            }
        }
    }, [webrtcManagerRef, currentRoom, currentUser]);


    return {
        currentUser,
        currentRoom,
        localStream,
        setScreenStream,
        isVideoOn,
        isAudioOn,
        isScreenSharing,
        isLoading: useStore(state => state.isLoading),
        error   : useStore(state => state.error),

        // Room actions
        createRoom,
        joinRoom,
        leaveRoom,


        // Media actions
        toggleLocalVideo,
        toggleLocalAudio,
        startScreenShare,
        stopScreenShare,


        // Utility
        setLocalStream,
        resetRoom: useStore((state) => state.resetRoom),
        setError: useStore((state) => state.setError)

    }
}