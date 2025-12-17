// frontend/src/lib/webrtc.ts
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

export class WebRTCManager {
  private peers: Map<string, PeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private userId: string = '';
  private roomId: string = '';

  constructor(userId: string, roomId: string) {
    this.userId = userId;
    this.roomId = roomId;
    this.setupSignalingHandlers();
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
    console.log(`Creating peer connection with ${peerId}, initiator: ${isInitiator}`);

    // WebRTC configuration
    const configuration: RTCConfiguration = {
      iceServers: [
        {
          urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302',
            'stun:stun2.l.google.com:19302',
            'stun:stun3.l.google.com:19302',
            'stun:stun4.l.google.com:19302'
          ]
        }
      ]
    };

    // Create RTCPeerConnection
    const connection = new RTCPeerConnection(configuration);
    
    // Add local stream tracks if available
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        connection.addTrack(track, this.localStream!);
      });
    }

    // Create data channel for chat (initiator only)
    let dataChannel: RTCDataChannel | null = null;
    if (isInitiator) {
      dataChannel = connection.createDataChannel('chat', {
        ordered: true
      });
      
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
        socketService.sendWebRTCIceCandidate(peerId, event.candidate.toJSON(), this.userId);
      }
    };

    // Track handling - when remote stream is received
    connection.ontrack = (event) => {
      console.log(`🎬 Received remote stream from ${peerId}`);
      
      const peer = this.peers.get(peerId);
      if (peer) {
        peer.stream = event.streams[0];
        // Emit event that new stream is available
        this.emitStreamUpdate(peerId, event.streams[0]);
      }
    };

    // Connection state changes
    connection.onconnectionstatechange = () => {
      console.log(`🔗 Connection state with ${peerId}: ${connection.connectionState}`);
      
      if (connection.connectionState === 'connected') {
        console.log(`✅ Successfully connected to ${peerId}`);
      } else if (connection.connectionState === 'failed' || 
                 connection.connectionState === 'disconnected' ||
                 connection.connectionState === 'closed') {
        console.log(`❌ Connection closed with ${peerId}`);
        this.removePeer(peerId);
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
        const offer = await connection.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        
        await connection.setLocalDescription(offer);
        socketService.sendWebRTCOffer(peerId, offer, this.userId);
      } catch (error) {
        console.error('Error creating offer:', error);
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
        // Handle chat message
        this.emitChatMessage(message);
      } catch (error) {
        console.error('Error parsing data channel message:', error);
      }
    };
  }

  async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    
    // Add tracks to existing peer connections
    for (const [peerId, peer] of this.peers.entries()) {
      const senders = peer.connection.getSenders();
      
      // Check if we already have these tracks
      const existingTrackIds = senders
        .map(sender => sender.track?.id)
        .filter(id => id) as string[];
      
      stream.getTracks().forEach(track => {
        if (!existingTrackIds.includes(track.id)) {
          peer.connection.addTrack(track, stream);
        }
      });
    }
  }

async startScreenSharing(): Promise<MediaStream | null> {
  try {
    const videoConstraints: DisplayMediaVideoConstraints = {
      displaySurface: 'monitor',
      frameRate: { ideal: 30, max: 60 },
    };

    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
      audio: true,
    });

    // Replace video tracks in all peer connections
    for (const peer of this.peers.values()) {
      const videoSender = peer.connection
        .getSenders()
        .find(sender => sender.track?.kind === 'video');

      if (videoSender && this.screenStream.getVideoTracks().length > 0) {
        await videoSender.replaceTrack(
          this.screenStream.getVideoTracks()[0]
        );
      }
    }

    return this.screenStream;
  } catch (error) {
    console.error('Error starting screen sharing:', error);
    return null;
  }
}


  stopScreenSharing(): void {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
      
      // Switch back to camera
      if (this.localStream) {
        for (const peer of this.peers.values()) {
          const videoSender = peer.connection.getSenders()
            .find(sender => sender.track?.kind === 'video');
          
          if (videoSender && this.localStream.getVideoTracks().length > 0) {
            videoSender.replaceTrack(this.localStream.getVideoTracks()[0]);
          }
        }
      }
    }
  }

  removePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.close();
      if (peer.dataChannel) {
        peer.dataChannel.close();
      }
      this.peers.delete(peerId);
      
      // Emit peer removal event
      this.emitPeerRemoved(peerId);
    }
  }

  getAllPeers(): Map<string, PeerConnection> {
    return new Map(this.peers);
  }

  getPeer(peerId: string): PeerConnection | undefined {
    return this.peers.get(peerId);
  }

  cleanup(): void {
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
  }

  // Event emitter helpers (you'll connect these to your React components)
  private emitStreamUpdate(peerId: string, stream: MediaStream): void {
    // You'll implement this in Day 3
    console.log(`Stream update for ${peerId}`, stream);
  }

  private emitChatMessage(message: ChatMessage): void {
    // You'll implement this in Day 3
    console.log('Chat message via WebRTC:', message);
  }

  private emitPeerRemoved(peerId: string): void {
    // You'll implement this in Day 3
    console.log(`Peer removed: ${peerId}`);
  }
}