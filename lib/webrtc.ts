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
  pendingCandidates?: RTCIceCandidateInit[];
}

export type WebRTCEvent =
  | { type: 'stream'; peerId: string; stream: MediaStream }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'peerRemoved'; peerId: string };

export class WebRTCManager {
  // Singleton instance
  private static instance: WebRTCManager | null = null;
  
  private peers: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private userId: string = '';
  private roomId: string = '';
  private eventListeners: Array<(event: WebRTCEvent) => void> = [];

  /**
   * Get singleton instance
   * Optional parameters for first initialization
   */
  static getInstance(userId?: string, roomId?: string): WebRTCManager {
    if (!WebRTCManager.instance) {
      if (!userId || !roomId) {
        throw new Error('UserId and RoomId required for first initialization');
      }
      console.log('🔥 Creating WebRTCManager (singleton)');
      WebRTCManager.instance = new WebRTCManager(userId, roomId);
    } else {
      console.log('🔥 Returning existing WebRTCManager instance');
    }
    return WebRTCManager.instance;
  }

  /**
   * Reset the singleton (for testing or cleanup)
   */
  static reset(): void {
    if (WebRTCManager.instance) {
      WebRTCManager.instance.cleanup();
      WebRTCManager.instance = null;
    }
  }

  /**
   * Private constructor for singleton pattern
   */
  private constructor(userId: string, roomId: string) {
    this.userId = userId;
    this.roomId = roomId;
    this.setupSignalingHandlers();

    // Expose for debugging
    if (typeof window !== 'undefined') {
      window.webrtcManager = this;
    }
  }

  // Event listener methods...
  onEvent(callback: (event: WebRTCEvent) => void) {
    this.eventListeners.push(callback);
  }

  offEvent(callback: (event: WebRTCEvent) => void) {
    const index = this.eventListeners.indexOf(callback);
    if (index > -1) this.eventListeners.splice(index, 1);
  }

  private emitEvent(event: WebRTCEvent) {
    this.eventListeners.forEach(callback => callback(event));
  }

  private async flushPendingIce(peer: PeerConnection) {
    if (!peer.pendingCandidates?.length) return;

    console.log(`🧊 Flushing ${peer.pendingCandidates.length} pending ICE candidates`);

    for (const c of peer.pendingCandidates) {
      if (c) {
        try {
          await peer.connection.addIceCandidate(new RTCIceCandidate(c));
        } catch (error) {
          console.error('Error adding pending ICE candidate:', error);
        }
      }
    }

    peer.pendingCandidates = [];
  }

  private setupSignalingHandlers(): void {
    // Handle incoming WebRTC offers
    socketService.onWebRTCOffer(async ({ offer, from }) => {
      console.log('📨 Received WebRTC offer from:', from);

      try {
        if (!this.peers.has(from)) {
          await this.createPeer(from, false);
        }

        const peer = this.peers.get(from);
        if (peer && peer.connection) {
          const connection = peer.connection;

          // Check if we need to handle offer collision
          if (connection.signalingState !== 'stable') {
            console.log(`⚠️ Offer collision detected, state: ${connection.signalingState}`);

            if (connection.signalingState === 'have-local-offer') {
              // Roll back and accept incoming offer
              try {
                await connection.setLocalDescription({ type: 'rollback' });
                console.log('🔄 Rolled back local offer to accept incoming');
              } catch (error) {
                console.error('Error rolling back:', error);
                return;
              }
            }
          }

          // Set remote description
          await connection.setRemoteDescription(new RTCSessionDescription(offer));
          await this.flushPendingIce(peer);
          console.log('✅ Remote description set');

          // Create and set local description
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          console.log('✅ Local description set');

          // Send answer
          const socketId = socketService.getSocketId();
          if (socketId) {
            socketService.sendWebRTCAnswer(from, answer, socketId);
          } else {
            console.error('Socket ID not found');
          }
        }
      } catch (error) {
        console.error('❌ Error handling offer:', error);
        // Clean up on error
        if (this.peers.has(from)) {
          this.removePeer(from);
        }
      }
    });

    // Handle incoming WebRTC answers
    socketService.onWebRTCAnswer(async ({ answer, from }) => {
      console.log('📨 Received WebRTC answer from:', from);

      const peer = this.peers.get(from);
      if (peer && peer.connection) {
        try {
          await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
          await this.flushPendingIce(peer);
          console.log('✅ Answer processed');
        } catch (error) {
          console.error('❌ Error handling answer:', error);
        }
      }
    });

    // Handle ICE candidates
    socketService.onWebRTCIceCandidate(async ({ candidate, from }) => {
      console.log('📨 Received ICE candidate from:', from);
      const peer = this.peers.get(from);
      if (!peer) return;

      if (!peer.connection.remoteDescription) {
        // Store candidate until remote description is set
        peer.pendingCandidates ??= [];
        peer.pendingCandidates.push(candidate);
        console.log(`📦 Stored pending ICE candidate for ${from}`);
        return;
      }

      try {
        await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    });
  }

  async createPeer(peerId: string, isInitiator: boolean): Promise<PeerConnection> {
    console.log(`🔗 CREATE_PEER: ${peerId}, initiator: ${isInitiator}`);
    
    // Check for existing peer
    const existingPeer = this.peers.get(peerId);
    if (existingPeer) {
      const state = existingPeer.connection.signalingState;
      const connectionState = existingPeer.connection.connectionState;
      
      if (state === 'stable' && connectionState === 'connected') {
        console.log(`✅ Reusing existing stable connection for ${peerId}`);
        return existingPeer;
      }
      
      if (state === 'closed' || connectionState === 'failed' || connectionState === 'disconnected') {
        console.log(`🗑️ Removing stale connection for ${peerId}`);
        this.removePeer(peerId);
      } else {
        console.log(`⚠️ Peer ${peerId} exists but not ready (${state}/${connectionState})`);
        return existingPeer;
      }
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

    // Add local tracks only once
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        // Check if this track is already being sent
        const existingSender = connection.getSenders().find(
          sender => sender.track && sender.track.kind === track.kind
        );

        if (!existingSender) {
          try {
            connection.addTrack(track, this.localStream!);
            console.log(`📤 Added ${track.kind} track:`, track.id);
          } catch (error) {
            console.error(`Error adding ${track.kind} track:`, error);
          }
        }
      });
    }

    // Create data channel if initiator
    let dataChannel: RTCDataChannel | null = null;
    if (isInitiator) {
      try {
        dataChannel = connection.createDataChannel('chat', {
          ordered: true
        });
        console.log(`💬 Created data channel for ${peerId}`);
      } catch (error) {
        console.error(`❌ Failed to create data channel:`, error);
      }
    }

    // Setup data channel handler
    connection.ondatachannel = (event) => {
      console.log(`💬 Data channel received for ${peerId}:`, event.channel.label);
      const channel = event.channel;
      this.setupDataChannel(channel, peerId);
      
      // Update the peer object
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.dataChannel = channel;
      }
    };

    // ICE candidate handling
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 ICE candidate for ${peerId}:`, event.candidate.type);
        const socketId = socketService.getSocketId();
        if (socketId) {
          socketService.sendWebRTCIceCandidate(peerId, event.candidate.toJSON(), socketId);
        }
      }
    };

    // Track handler for incoming media
    connection.ontrack = (event) => {
      console.log('🔥 ONTRACK FIRED 🔥', {
        peerId,
        trackKind: event.track.kind,
        streamId: event.streams[0]?.id
      });

      const peer = this.peers.get(peerId);
      if (peer) {
        // Create or reuse stream
        if (!peer.stream) {
          peer.stream = new MediaStream();
        }

        // Add track if not already present
        const existingTrack = peer.stream.getTracks().find(t => t.id === event.track.id);
        if (!existingTrack) {
          peer.stream.addTrack(event.track);
        }

        // Emit stream event
        this.emitEvent({
          type: 'stream',
          peerId: peerId,
          stream: peer.stream
        });

        console.log(`✅ Stream updated for ${peerId}, tracks:`, 
          peer.stream.getTracks().map(t => t.kind));
      }
    };

    // Connection state monitoring
    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      console.log(`🔗 Connection state with ${peerId}: ${state}`);

      if (state === 'failed' || state === 'disconnected') {
        setTimeout(() => {
          if (connection.connectionState === 'disconnected' || 
              connection.connectionState === 'failed') {
            this.restartIce(peerId);
          }
        }, 2000);
      } else if (state === 'closed') {
        this.removePeer(peerId);
      }
    };

    // Create and store peer
    const peer: PeerConnection = {
      peerId,
      connection,
      stream: null,
      dataChannel
    };

    this.peers.set(peerId, peer);

    // Create offer if initiator
    if (isInitiator) {
      try {
        console.log(`📤 Creating offer for ${peerId}...`);
        const offer = await connection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        await connection.setLocalDescription(offer);
        console.log(`✅ Offer created for ${peerId}`);
        
        const socketId = socketService.getSocketId();
        if (socketId) {
          socketService.sendWebRTCOffer(peerId, offer, socketId);
        }
      } catch (error) {
        console.error(`❌ Error creating offer for ${peerId}:`, error);
        this.removePeer(peerId);
        throw error;
      }
    }

    return peer;
  }

  private restartIce(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.connection.signalingState === 'stable') {
      console.log(`🔄 Restarting ICE for ${peerId}`);
      try {
        peer.connection.restartIce();
      } catch (error) {
        console.error(`Error restarting ICE for ${peerId}:`, error);
      }
    }
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

    // Update existing peer connections with new tracks
    this.peers.forEach((peer, peerId) => {
      stream.getTracks().forEach(track => {
        const sender = peer.connection.getSenders()
          .find(s => s.track && s.track.kind === track.kind);

        if (sender) {
          sender.replaceTrack(track);
        } else {
          peer.connection.addTrack(track, stream);
        }
      });
    });
  }

  getPeer(peerId: string): PeerConnection | undefined {
    return this.peers.get(peerId);
  }

  removePeer(peerId: string): void {
    console.log(`🗑️ Removing peer: ${peerId}`);
    const peer = this.peers.get(peerId);
    if (peer) {
      try {
        peer.connection.close();
        if (peer.dataChannel) {
          peer.dataChannel.close();
        }
      } catch (error) {
        console.error('Error closing peer connection:', error);
      }
      this.peers.delete(peerId);
      
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
    this.peers.forEach(peer => {
      try {
        peer.connection.close();
        if (peer.dataChannel) {
          peer.dataChannel.close();
        }
      } catch (error) {
        // Ignore errors during cleanup
      }
    });

    // Stop local streams
    [this.localStream, this.screenStream].forEach(stream => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    });

    this.peers.clear();
    this.eventListeners = [];
  }
}