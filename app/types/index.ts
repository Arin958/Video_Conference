// src/types/index.ts
export interface User {
  userId: string;
  socketId: string;
  userName: string;
  isVideoOn: boolean;
  isAudioOn: boolean;
  isScreenSharing: boolean;
  joinedAt: Date;
}

export interface Room {
  roomId: string;
  participants: User[];
  createdAt: Date;
  isLocked: boolean;
}

export interface Message {
  id: string;
  userId: string;
  userName: string;
  message: string;
  timestamp: string;
}

export interface WebRTCPeer {
  peerId: string;
  connection: RTCPeerConnection | null;
  stream: MediaStream | null;
  dataChannel: RTCDataChannel | null;
}

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'user-joined' | 'user-left' | 'media-toggled';
  from: string;
  to?: string;
 
}

export interface RoomJoinData {
  roomId: string;
  userName: string;
  userId?: string;
  password?: string;
}