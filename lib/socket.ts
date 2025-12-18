// frontend/src/lib/socket.ts - ENHANCED VERSION
import { io, Socket } from 'socket.io-client';


type MediaToggleData =
  | { userId: string; state: boolean }        // audio / video
  | { userId: string; socketId: string }     // screen-share start
  | { userId: string }; 


  interface MediaTogglePayload {
  userId: string;
  state: boolean;
}

interface ScreenSharePayload {
  userId: string;
}


// Types
export interface RoomJoinResponse {
  success: boolean;
  socketId: string;
  roomId: string;
  userName: string
  hostId: string
  userId: string;
  isHost: boolean;
  participants: Participant[];
  error?: string;
}

export interface Participant {
  id: string | null | undefined;
  userId: string;
 
  userName: string;
  socketId: string;
  isVideoOn: boolean;
  isAudioOn: boolean;
  isScreenSharing?: boolean;
}

interface UserLeftPayload {
  userId: string;
  socketId: string;
}

interface UserJoinedPayload {
  userId: string;
  socketId: string;
  userName: string;
  isVideoOn: boolean;
  isAudioOn: boolean;
  isScreenSharing: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: string;
  type: 'text' | 'system';
}

class SocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
    private connectTime = 0; 
  
  // Event callbacks
  private onRoomJoinedCallback: ((data: RoomJoinResponse) => void) | null = null;
  private onUserJoinedCallback: ((user: Participant) => void) | null = null;
  private onUserLeftCallback: ((data: { userId: string }) => void) | null = null;
  private onWebRTCOfferCallback: ((data: { offer: RTCSessionDescriptionInit; from: string }) => void) | null = null;
  private onWebRTCAnswerCallback: ((data: { answer: RTCSessionDescriptionInit; from: string }) => void) | null = null;
  private onWebRTCIceCandidateCallback: ((data: { candidate: RTCIceCandidateInit; from: string }) => void) | null = null;
  private onChatMessageCallback: ((message: ChatMessage) => void) | null = null;
  private onMediaToggledCallbacks: Map<string, (data: MediaToggleData) => void> = new Map();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
            this.connectTime = Date.now(); 
        if (this.socket) {
      if (this.socket.connected) return resolve();
      return this.socket.connect();
    }

      const serverUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000' ;
      
  
    this.socket = io(serverUrl, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
    });

      // Connection events
    this.socket.once('connect', () => {
        console.log('✅ Connected:', this.socket?.id);
        console.log('Connection time:', this.connectTime);
        this.isConnected = true;
        this.reconnectAttempts = 0; // Reset on successful connect
        resolve();
      });


      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error.message);
        this.reconnectAttempts++;
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.log(serverUrl, ' Trying to connect to server URL');
          reject(new Error('Failed to connect after multiple attempts'));
        }
      });

        // 🔥 CRITICAL MISSING HANDLER - ADD THIS:
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
      this.isConnected = false;
      
      if (reason === 'io server disconnect') {
        console.log('Server disconnected us');
      } else if (reason === 'transport close') {
        console.log('Network connection lost');
      }
    });

   

      // Room events
      this.socket.on('room-joined', (data: RoomJoinResponse) => {
        this.onRoomJoinedCallback?.(data);
      });

      this.socket.on('user-joined', (user: Participant) => {
        this.onUserJoinedCallback?.(user);
      });

      this.socket.on('user-joining', (user: Participant) => {
        console.log('👤 User is joining:', user.userName);
      });

      this.socket.on('user-left', (data: { userId: string }) => {
        this.onUserLeftCallback?.(data);
      });

      // WebRTC signaling events
      this.socket.on('webrtc-offer', (data: { offer: RTCSessionDescriptionInit; from: string }) => {
        this.onWebRTCOfferCallback?.(data);
      });

      this.socket.on('webrtc-answer', (data: { answer: RTCSessionDescriptionInit; from: string }) => {
        this.onWebRTCAnswerCallback?.(data);
      });

      this.socket.on('webrtc-ice-candidate', (data: { candidate: RTCIceCandidateInit; from: string }) => {
        this.onWebRTCIceCandidateCallback?.(data);
      });

      // Media events
      this.socket.on('user-audio-toggled', (data: { userId: string; state: boolean }) => {
        this.onMediaToggledCallbacks.get('audio')?.(data);
      });

      this.socket.on('user-video-toggled', (data: { userId: string; state: boolean }) => {
        this.onMediaToggledCallbacks.get('video')?.(data);
      });

      this.socket.on('screen-share-started', (data: { userId: string; socketId: string }) => {
        this.onMediaToggledCallbacks.get('screen-share-start')?.(data);
      });

      this.socket.on('screen-share-stopped', (data: { userId: string }) => {
        this.onMediaToggledCallbacks.get('screen-share-stop')?.(data);
      });

      // Chat events
      this.socket.on('new-chat-message', (message: ChatMessage) => {
        this.onChatMessageCallback?.(message);
      });

      // Room management events
      this.socket.on('room-locked', (data: { isLocked: boolean }) => {
        console.log(`🔒 Room ${data.isLocked ? 'locked' : 'unlocked'}`);
      });

      this.socket.on('kicked', (data: { reason: string }) => {
        alert(`You were removed from the room: ${data.reason}`);
        window.location.reload();
      });

      // Health check
      this.socket.on('pong', () => {
        // Connection is healthy
      });
    });
  }

  // Room methods
  createRoom(userName: string, roomId: string): Promise<RoomJoinResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('create-room', { userName, roomId }, (response: RoomJoinResponse) => {
        console.log(response, "createRoomResponse");
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Failed to create room'));
        }
      });
    });
  }

  joinRoom(roomId: string, userName: string, password?: string): Promise<RoomJoinResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error('Not connected to server'));
        return;
      }

      this.socket.emit('join-room', { roomId, userName, password }, (response: RoomJoinResponse) => {
        console.log(response, "joinRoomResponse");
        if (response.success) {
    
          resolve(response);
        } else {
          reject(new Error(response.error || 'Failed to join room'));
        }
      });
    });
  }

  leaveRoom(roomId: string, userId: string): void {
    this.socket?.emit('leave-room', { roomId, userId });
  }

  // WebRTC signaling methods
  sendWebRTCOffer(to: string, offer: RTCSessionDescriptionInit, from: string): void {
    this.socket?.emit('webrtc-offer', { to, offer, from });
  }

  sendWebRTCAnswer(to: string, answer: RTCSessionDescriptionInit, from: string): void {
    this.socket?.emit('webrtc-answer', { to, answer, from });
  }

  sendWebRTCIceCandidate(to: string, candidate: RTCIceCandidateInit, from: string): void {
    this.socket?.emit('webrtc-ice-candidate', { to, candidate, from });
  }

  // Media control methods
  toggleAudio(roomId: string, userId: string, state: boolean): void {
    this.socket?.emit('toggle-audio', { roomId, userId, state });
  }

  toggleVideo(roomId: string, userId: string, state: boolean): void {
    this.socket?.emit('toggle-video', { roomId, userId, state });
  }

  startScreenShare(roomId: string, userId: string): void {
    this.socket?.emit('start-screen-share', { roomId, userId });
  }

  stopScreenShare(roomId: string, userId: string): void {
    this.socket?.emit('stop-screen-share', { roomId, userId });
  }

  // Chat methods
  sendChatMessage(roomId: string, userId: string, userName: string, message: string): void {
    this.socket?.emit('send-chat-message', { roomId, userId, userName, message });
  }

  // Room management methods
  lockRoom(roomId: string, password: string): void {
    this.socket?.emit('lock-room', { roomId, password });
  }

  unlockRoom(roomId: string): void {
    this.socket?.emit('unlock-room', { roomId });
  }

  kickUser(roomId: string, targetUserId: string): void {
    this.socket?.emit('kick-user', { roomId, targetUserId });
  }

  // Event subscription methods
  onRoomJoined(callback: (data: RoomJoinResponse) => void): void {
    this.onRoomJoinedCallback = callback;
  }

  onUserJoined(callback: (data: UserJoinedPayload) => void): void {
    if (this.socket) {
      this.socket.on("user-joined", callback);
    }
  }

onUserLeft(callback: (data: UserLeftPayload) => void) {
  if(!this.socket) return
  this.socket.on("user-left", callback);
}

  onWebRTCOffer(callback: (data: { offer: RTCSessionDescriptionInit; from: string }) => void): void {
    this.onWebRTCOfferCallback = callback;
  }

  onWebRTCAnswer(callback: (data: { answer: RTCSessionDescriptionInit; from: string }) => void): void {
    this.onWebRTCAnswerCallback = callback;
  }

  onWebRTCIceCandidate(callback: (data: { candidate: RTCIceCandidateInit; from: string }) => void): void {
    this.onWebRTCIceCandidateCallback = callback;
  }

  onChatMessage(callback: (message: ChatMessage) => void): void {
    this.onChatMessageCallback = callback;
  }
onMediaToggled(
  type: "audio" | "video",
  callback: (data: MediaTogglePayload) => void
) {
  if(!this.socket) return
  this.socket.on(`media-${type}-toggled`, callback);
}


  // Utility methods
  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnectedToServer(): boolean {
    return this.isConnected;
  }

}

// Singleton instance
export const socketService = new SocketService();