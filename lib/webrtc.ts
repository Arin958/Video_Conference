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
      console.log("📤 SENDING OFFER", {offer, from });

      try {
        if (!this.peers.has(from)) {
          await this.createPeer(from, false);
        }

        const peer = this.peers.get(from);
        if (peer && peer.connection) {
          const connection = peer.connection;

          // Check if we need to handle offer collision (simultaneous offers)
          if (connection.signalingState !== 'stable') {
            console.log(`⚠️ Offer collision detected, state: ${connection.signalingState}`);

            // Handle 'have-local-offer' state (simultaneous offer)
            if (connection.signalingState === 'have-local-offer') {
              // Option 1: Reject the incoming offer (more common)
              console.log('Already made an offer to this peer, ignoring incoming offer');
              return;

              // Option 2: Roll back and accept incoming offer
              // await connection.setLocalDescription({ type: 'rollback' });
            }

            // Handle 'have-remote-offer' state
            if (connection.signalingState === 'have-remote-offer') {
              console.log('Already processing an offer from this peer');
              return;
            }
          }

          // Set remote description
          await connection.setRemoteDescription(new RTCSessionDescription(offer));
          console.log('✅ Remote description set');

          // Create and set local description
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          console.log('✅ Local description set');
          const socketId = socketService.getSocketId()

          if (socketId) {
            socketService.sendWebRTCAnswer(from, answer, socketId);
          } else {
            console.error('Socket ID not found');
          }
          // Send answer

          console.log('📤 Answer sent');
        }
      } catch (error) {
        console.error('❌ Error handling offer:', error);
        // Clean up on error
        if (this.peers.has(from)) {
          this.peers.delete(from);
        }
      }
    });

    // Handle incoming WebRTC answers
    socketService.onWebRTCAnswer(async ({ answer, from }) => {
      console.log('📨 Received WebRTC answer from:', from);

      const peer = this.peers.get(from);
      if (peer && peer.connection) {
        try {
          const connection = peer.connection;

          // Only set remote description if we're expecting an answer
          if (connection.signalingState === 'have-local-offer') {
            await connection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('✅ Answer processed');
          } else {
            console.log(`⚠️ Unexpected answer in state: ${connection.signalingState}`);

            // Handle late answer - still try to set it
            if (connection.remoteDescription === null) {
              await connection.setRemoteDescription(new RTCSessionDescription(answer));
            }
          }
        } catch (error) {
          console.error('❌ Error handling answer:', error);
        }
      }
    });

    // Handle ICE candidates
    socketService.onWebRTCIceCandidate(async ({ candidate, from }) => {
      console.log('📨 Received ICE candidate from:', from);

      const peer = this.peers.get(from);
      if (peer && peer.connection) {
        try {
          if (candidate) {
            await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log('✅ ICE candidate added');
          } else {
            // null candidate means end of candidates
            console.log('📬 End of ICE candidates received');
            await peer.connection.addIceCandidate(null);
          }
        } catch (error) {
          // Ignore errors for late candidates (common and expected)
          if (!peer.connection.remoteDescription) {
            console.log('⚠️ Late ICE candidate, storing for later');
            // Store candidate for later
            peer.pendingCandidates = peer.pendingCandidates || [];
            peer.pendingCandidates.push(candidate);
          } else {
            console.error('Error adding ICE candidate:', error);
          }
        }
      }
    });
  }

  async createPeer(peerId: string, isInitiator: boolean): Promise<PeerConnection> {
    console.log(`🔗 CREATE_PEER: ${peerId}, initiator: ${isInitiator}`);

    // Check if peer already exists AND is in a valid state
    const existingPeer = this.peers.get(peerId);
    if (existingPeer) {
      const state = existingPeer.connection.signalingState;
      const connectionState = existingPeer.connection.connectionState;
      console.log(`⚠️ Peer ${peerId} already exists with state: ${state}, connection: ${connectionState}`);

      // If connection is stable/connected, we can reuse it
      if (state === 'stable' && connectionState === 'connected') {
        console.log(`✅ Reusing existing stable connection for ${peerId}`);
        return existingPeer;
      }

      // If connection is closed/failed, remove and create new
      if (state === 'closed' || connectionState === 'failed' || connectionState === 'disconnected') {
        console.log(`🗑️ Removing stale connection for ${peerId}`);
        this.removePeer(peerId);
      } else {
        // Connection exists but isn't ready - return existing but don't create offer
        console.log(`⚠️ Peer ${peerId} exists but not ready (${state}/${connectionState})`);
        return existingPeer;
      }
    }

    // WebRTC configuration
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    // Create RTCPeerConnection
    const connection = new RTCPeerConnection(configuration);
    console.log(`✅ RTCPeerConnection created for ${peerId}`);

    // Add local stream tracks if available
    if (this.localStream) {
      console.log(`➕ Adding ${this.localStream.getTracks().length} tracks to ${peerId}`);
      this.localStream.getTracks().forEach(track => {
        // Check if track is already added to prevent duplicates
        const existingSender = connection.getSenders().find(
          sender => sender.track?.id === track.id
        );

        if (!existingSender) {
          connection.addTrack(track, this.localStream!);
          console.log(`📤 Added ${track.kind} track:`, track.id);
        } else {
          console.log(`⚠️ Track ${track.id} already added`);
        }
      });
    } else {
      console.log(`⚠️ No local stream available for ${peerId}`);
    }

    // Create data channel for chat
    let dataChannel: RTCDataChannel | null = null;

    if (isInitiator) {
      try {
        dataChannel = connection.createDataChannel('chat', {
          ordered: true,
          maxPacketLifeTime: 1000, // 1 second for reliable delivery
          maxRetransmits: 3
        });
        console.log(`💬 Created data channel for ${peerId}`);
      } catch (error) {
        console.error(`❌ Failed to create data channel:`, error);
      }
    }

    // Setup data channel when it opens (for both initiator and receiver)
    connection.ondatachannel = (event) => {
      console.log(`💬 Data channel received for ${peerId}:`, event.channel.label);
      dataChannel = event.channel;
      this.setupDataChannel(dataChannel, peerId);
    };

    // ICE candidate handling
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 ICE candidate for ${peerId}: ${event.candidate.type} ${event.candidate.protocol}`);
        const socketId = socketService.getSocketId()
        if (socketId) {

          socketService.sendWebRTCIceCandidate(peerId, event.candidate.toJSON(), socketId);
        } else {
          console.error('Socket ID not found');
        }
      } else {
        console.log(`✅ ICE gathering complete for ${peerId}`);
        // End of ICE candidates (do not send null, just log)
      }
    };

    // Track handler for incoming media
    connection.ontrack = (event) => {
      console.log(`🎬 ONTRACK from ${peerId}:`, {
        kind: event.track.kind,
        id: event.track.id,
        streams: event.streams.length,
        readyState: event.track.readyState
      });

      const peer = this.peers.get(peerId);
      if (peer) {
        // Use existing stream or create new one
        if (!peer.stream) {
          peer.stream = new MediaStream();
        }

        // Add track to stream if not already present
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

        console.log(`✅ Stream updated for ${peerId}, total tracks: ${peer.stream.getTracks().length}`);
      }

      // Monitor track state
      event.track.onmute = () => console.log(`🔇 Track ${event.track.id} muted`);
      event.track.onunmute = () => console.log(`🔊 Track ${event.track.id} unmuted`);
      event.track.onended = () => console.log(`⏹️ Track ${event.track.id} ended`);
    };

    // Connection state changes
    connection.onconnectionstatechange = () => {
      const state = connection.connectionState;
      console.log(`🔗 Connection state with ${peerId}: ${state}`);

      if (state === 'connected') {
        console.log(`✅ Connected to ${peerId}`);
        // Setup data channel if we're the initiator and it was created
        if (isInitiator && dataChannel && dataChannel.readyState === 'open') {
          this.setupDataChannel(dataChannel, peerId);
        }
      } else if (state === 'failed' || state === 'disconnected') {
        console.log(`⚠️ Connection issue with ${peerId}: ${state}`);
        // Try to restart ICE
        setTimeout(() => {
          if (connection.connectionState === 'disconnected' ||
            connection.connectionState === 'failed') {
            this.restartIce(peerId);
          }
        }, 2000);
      } else if (state === 'closed') {
        console.log(`❌ Connection closed with ${peerId}`);
        this.removePeer(peerId);
      }
    };

    // ICE connection state
    connection.oniceconnectionstatechange = () => {
      const iceState = connection.iceConnectionState;
      console.log(`🧊 ICE state with ${peerId}: ${iceState}`);

      if (iceState === 'failed') {
        console.log(`❌ ICE failed for ${peerId}, attempting restart...`);
        this.restartIce(peerId);
      }
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

        // Wait a moment for track transceivers to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        const offer = await connection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
          iceRestart: false
        });

        // Set codec preferences if needed (optional)
        const transceivers = connection.getTransceivers();
        transceivers.forEach(transceiver => {
          if (transceiver.sender.track?.kind === 'video') {
            // Prefer H.264 for better compatibility
            const codecs = RTCRtpSender.getCapabilities('video')?.codecs;
            if (codecs) {
              const h264Codec = codecs.find(codec =>
                codec.mimeType.includes('H264')
              );
              if (h264Codec) {
                transceiver.setCodecPreferences([h264Codec]);
              }
            }
          }
        });

        await connection.setLocalDescription(offer);
        console.log(`✅ Offer created for ${peerId}, sending...`);

        const socketId = socketService.getSocketId()

        if (socketId) {

          socketService.sendWebRTCOffer(peerId, offer, socketId);
        } else {
          console.error('Socket ID not found');
        }
      } catch (error) {
        console.error(`❌ Error creating offer for ${peerId}:`, error);
        // Clean up on error
        this.removePeer(peerId);
        throw error;
      }
    }

    return peer;
  }

  // Helper method to restart ICE
  private restartIce(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.connection.signalingState === 'stable') {
      console.log(`🔄 Restarting ICE for ${peerId}`);
      peer.connection.restartIce();
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