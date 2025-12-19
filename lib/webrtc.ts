// frontend/src/lib/webrtc.ts - FIXED VERSION
import { ChatMessage, socketService } from './socket';

type DisplayMediaVideoConstraints =
  | boolean
  | MediaTrackConstraints & {
      displaySurface?: 'monitor' | 'window' | 'browser';
    };

export interface PeerConnection {
  peerId: string;
  connection: RTCPeerConnection;
  stream: MediaStream | null;
  dataChannel: RTCDataChannel | null;
}

// Add event types
export type WebRTCEvent = 
  | { type: 'stream'; peerId: string; stream: MediaStream }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'peerRemoved'; peerId: string };

export class WebRTCManager {
  private peers: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private userId: string = '';
  private roomId: string = '';
  
  // Event emitter system
  private eventListeners: Array<(event: WebRTCEvent) => void> = [];

  constructor(userId: string, roomId: string) {
    this.userId = userId;
    this.roomId = roomId;
    this.setupSignalingHandlers();
    
    // Expose for debugging - type safe
    if (typeof window !== 'undefined') {
      window.webrtcManager = this;
    }
  }

  // Add event listener
  onEvent(callback: (event: WebRTCEvent) => void) {
    this.eventListeners.push(callback);
  }

  // Remove event listener
  offEvent(callback: (event: WebRTCEvent) => void) {
    const index = this.eventListeners.indexOf(callback);
    if (index > -1) this.eventListeners.splice(index, 1);
  }

  // Emit events to all listeners
  private emitEvent(event: WebRTCEvent) {
    this.eventListeners.forEach(callback => callback(event));
  }

  private setupSignalingHandlers(): void {
    // Handle incoming WebRTC offers
    socketService.onWebRTCOffer(async ({ offer, from }) => {
      console.log('📨 Received WebRTC offer from:', from);
      
      if (!this.peers.has(from)) {
        await this.createPeer(from, false);
      }
      
      const peer = this.peers.get(from);
      if (peer) {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        
        socketService.sendWebRTCAnswer(from, answer, this.userId);
      }
    });

    // Handle incoming WebRTC answers
    socketService.onWebRTCAnswer(async ({ answer, from }) => {
      console.log('📨 Received WebRTC answer from:', from);
      
      const peer = this.peers.get(from);
      if (peer) {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // Handle ICE candidates
    socketService.onWebRTCIceCandidate(async ({ candidate, from }) => {
      console.log('📨 Received ICE candidate from:', from);
      
      const peer = this.peers.get(from);
      if (peer && candidate) {
        try {
          await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    });
  }

  async createPeer(peerId: string, isInitiator: boolean): Promise<PeerConnection> {
    console.log(`🔗 CREATE_PEER: ${peerId}, initiator: ${isInitiator}`);

    // Check if peer already exists
    if (this.peers.has(peerId)) {
      console.log(`⚠️ Peer ${peerId} already exists`);
      return this.peers.get(peerId)!;
    }

    // WebRTC configuration
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    // Create RTCPeerConnection
    const connection = new RTCPeerConnection(configuration);
    console.log(`✅ RTCPeerConnection created for ${peerId}`);
    
    // Add local stream tracks if available
    if (this.localStream) {
      console.log(`➕ Adding ${this.localStream.getTracks().length} tracks to ${peerId}`);
      this.localStream.getTracks().forEach(track => {
        const sender = connection.addTrack(track, this.localStream!);
        console.log(`📤 Added ${track.kind} track:`, track.enabled);
      });
    } else {
      console.log(`⚠️ No local stream for ${peerId}`);
    }

    // Create data channel for chat (initiator only)
    let dataChannel: RTCDataChannel | null = null;
    if (isInitiator) {
      dataChannel = connection.createDataChannel('chat', { ordered: true });
      this.setupDataChannel(dataChannel, peerId);
    } else {
      connection.ondatachannel = (event) => {
        dataChannel = event.channel;
        this.setupDataChannel(dataChannel, peerId);
      };
    }

    // ICE candidate handling
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 ICE candidate for ${peerId}:`, event.candidate.type);
        socketService.sendWebRTCIceCandidate(peerId, event.candidate.toJSON(), this.userId);
      }
    };

    // 🔥 CRITICAL FIX: Enhanced ontrack handler
    connection.ontrack = (event) => {
      console.log(`🎬 ONTRACK from ${peerId}:`, {
        kind: event.track.kind,
        enabled: event.track.enabled,
        streams: event.streams.length,
        streamId: event.streams[0]?.id
      });
      
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.stream = event.streams[0];
        
        // 🔥 EMIT STREAM EVENT to React
        this.emitEvent({
          type: 'stream',
          peerId: peerId,
          stream: event.streams[0]
        });
        
        console.log(`✅ Stream emitted for ${peerId}`);
      }
    };

    // Connection state changes
    connection.onconnectionstatechange = () => {
      console.log(`🔗 Connection state with ${peerId}: ${connection.connectionState}`);
      
      if (connection.connectionState === 'connected') {
        console.log(`✅ Connected to ${peerId}`);
      } else if (connection.connectionState === 'failed' || 
                 connection.connectionState === 'disconnected' ||
                 connection.connectionState === 'closed') {
        console.log(`❌ Connection closed with ${peerId}`);
        this.removePeer(peerId);
      }
    };

    // ICE connection state
    connection.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE state with ${peerId}: ${connection.iceConnectionState}`);
    };

    // Create peer object
    const peer: PeerConnection = {
      peerId,
      connection,
      stream: null,
      dataChannel
    };

    this.peers.set(peerId, peer);

    // If initiator, create and send offer
    if (isInitiator) {
      try {
        console.log(`📤 Creating offer for ${peerId}...`);
        const offer = await connection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        await connection.setLocalDescription(offer);
        console.log(`📤 Offer created for ${peerId}, sending via socket`);
        socketService.sendWebRTCOffer(peerId, offer, this.userId);
      } catch (error) {
        console.error(`❌ Error creating offer for ${peerId}:`, error);
      }
    }

    return peer;
  }

  private setupDataChannel(channel: RTCDataChannel, peerId: string): void {
    channel.onopen = () => {
      console.log(`💬 Data channel opened with ${peerId}`);
    };

    channel.onclose = () => {
      console.log(`💬 Data channel closed with ${peerId}`);
    };

    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log(`📨 Received chat via WebRTC from ${peerId}:`, message);
        this.emitEvent({
          type: 'chat',
          message: message as ChatMessage
        });
      } catch (error) {
        console.error('Error parsing data channel message:', error);
      }
    };
  }

  async setLocalStream(stream: MediaStream): Promise<void> {
    console.log(`🎥 Setting local stream:`, {
      video: stream.getVideoTracks().length,
      audio: stream.getAudioTracks().length
    });
    
    this.localStream = stream;
    
    // Add tracks to existing peer connections
    for (const [peerId, peer] of this.peers.entries()) {
      console.log(`🔄 Updating ${peerId} with local stream`);
      stream.getTracks().forEach(track => {
        const sender = peer.connection.getSenders()
          .find(s => s.track?.kind === track.kind);
        
        if (sender) {
          sender.replaceTrack(track);
        } else {
          peer.connection.addTrack(track, stream);
        }
      });
    }
  }





  getPeer(peerId: string): PeerConnection | undefined {
    return this.peers.get(peerId);
  }

  removePeer(peerId: string): void {
    console.log(`🗑️ Removing peer: ${peerId}`);
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.close();
      if (peer.dataChannel) {
        peer.dataChannel.close();
      }
      this.peers.delete(peerId);
      
      // Emit peer removal event
      this.emitEvent({
        type: 'peerRemoved',
        peerId
      });
    }
  }

  getAllPeers(): Map<string, PeerConnection> {
    return new Map(this.peers);
  }

  cleanup(): void {
    console.log(`🧹 Cleaning up WebRTC Manager`);
    
    // Close all peer connections
    for (const peer of this.peers.values()) {
      peer.connection.close();
      if (peer.dataChannel) {
        peer.dataChannel.close();
      }
    }
    
    // Stop local streams
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
    }
    
    this.peers.clear();
    this.eventListeners = [];
  }
}