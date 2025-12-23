// frontend/src/components/video/VideoTile.tsx
'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Mic, MicOff,  VideoOff, User, ScreenShare } from 'lucide-react';
import { User as UserType } from '@/app/store/useStore';

interface VideoTileProps {
    user: UserType;
    isLocal?: boolean;
    className?: string;
}

export default function VideoTile({ user, isLocal = false, className }: VideoTileProps) {
    
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
const hasVideo = useMemo(() => {
    if (!user.stream) return false;
    
    const videoTracks = user.stream.getVideoTracks();
    if (videoTracks.length === 0) {
        console.log(`❌ No video tracks in stream for ${user.userName}`);
        return false;
    }
    
    const videoTrack = videoTracks[0];
    const isTrackLive = videoTrack.readyState === 'live';
    const isTrackEnabled = videoTrack.enabled;
    
    console.log(`🔍 Video check for ${user.userName}:`, {
        hasVideoTrack: true,
        trackEnabled: isTrackEnabled,
        trackReadyState: videoTrack.readyState,
        trackLabel: videoTrack.label,
        userIsVideoOn: user.isVideoOn,
        result: isTrackLive && isTrackEnabled
    });
    
    return isTrackLive && isTrackEnabled;
}, [user.stream, user.userName, user.isVideoOn]);

// Also add audio check
const hasAudio = useMemo(() => {
    if (!user.stream) return false;
    
    const audioTracks = user.stream.getAudioTracks();
    if (audioTracks.length === 0) {
        console.log(`🔇 No audio tracks in stream for ${user.userName}`);
        return false;
    }
    
    const audioTrack = audioTracks[0];
    console.log(`🔊 Audio check for ${user.userName}:`, {
        hasAudioTrack: true,
        trackEnabled: audioTrack.enabled,
        trackReadyState: audioTrack.readyState,
        trackLabel: audioTrack.label
    });
    
    return audioTrack.enabled && audioTrack.readyState === 'live';
}, [user.stream, user.userName]);
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Add this useEffect at the top of VideoTile
useEffect(() => {
    console.log(`🎥 VideoTile "${user.userName}" FULL DEBUG:`, {
        hasStream: !!user.stream,
        streamId: user.stream?.id,
        allTracks: user.stream?.getTracks().map(t => ({
            kind: t.kind,
            id: t.id,
            enabled: t.enabled,
            readyState: t.readyState,
            label: t.label
        })),
        videoTracks: user.stream?.getVideoTracks().length,
        audioTracks: user.stream?.getAudioTracks().length,
        isLocal: isLocal
    });

    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (user.stream) {
        console.log(`🎬 Setting stream for ${user.userName}:`, {
            previousStreamId: (videoElement.srcObject as MediaStream)?.id,
            newStreamId: user.stream.id,
            shouldAttach: videoElement.srcObject !== user.stream
        });

        // Only update if stream is different
        if (videoElement.srcObject !== user.stream) {
            console.log(`🔄 Attaching new stream to video element`);
            videoElement.srcObject = user.stream;
            videoElement.muted = isLocal;
            
            // Try to play
            const playPromise = videoElement.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log(`✅ Video playing successfully for ${user.userName}`);
                    })
                    .catch(error => {
                        console.log(`⏸️ Playback prevented for ${user.userName}:`, error.name);
                        
                        // If autoplay is blocked, wait for user interaction
                        if (error.name === 'NotAllowedError') {
                            const handleUserInteraction = () => {
                                videoElement.play()
                                    .then(() => console.log(`✅ Resumed after interaction`))
                                    .catch(e => console.log(`❌ Still blocked:`, e));
                                document.removeEventListener('click', handleUserInteraction);
                            };
                            document.addEventListener('click', handleUserInteraction);
                        }
                    });
            }
        } else {
            console.log(`⏸️ Same stream already attached, skipping`);
        }
    } else {
        console.log(`❌ No stream available for ${user.userName}`);
        videoElement.srcObject = null;
    }
}, [user.stream, user.userName, isLocal]);

    useEffect(() => {
        if (!videoRef.current || !user.stream) return;

        videoRef.current.srcObject = user.stream;

        if (!isLocal) {
            console.log(`🔊 Audio check for ${user.userName}:`, {
  hasAudioTrack: user.stream?.getAudioTracks().length > 0,
  audioTrackEnabled: user.stream?.getAudioTracks()[0]?.enabled,
  audioTrackReadyState: user.stream?.getAudioTracks()[0]?.readyState,
  isLocal: isLocal,
  videoElementMuted: videoRef.current?.muted
});
            const audioTrack = user.stream.getAudioTracks()[0];
            if (!audioTrack) return;

            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(user.stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;

            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let rafId: number;

            const checkAudioLevel = () => {
                analyser.getByteFrequencyData(dataArray);
                const average =
                    dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

                setIsSpeaking(average > 20);
                rafId = requestAnimationFrame(checkAudioLevel);
            };

            checkAudioLevel();

            return () => {
                cancelAnimationFrame(rafId);
                audioContext.close();
            };
        }
    }, [user.stream, isLocal]);

    // 🔊 REMOTE AUDIO PLAYBACK (THIS IS THE FIX)
useEffect(() => {
    if (!audioRef.current || !user.stream || isLocal) return;

    console.log(`🔊 Attaching audio stream for ${user.userName}`);

    audioRef.current.srcObject = user.stream;

    audioRef.current
        .play()
        .then(() => console.log(`🔊 Audio playing for ${user.userName}`))
        .catch(err => {
            console.warn(`🔇 Audio autoplay blocked`, err.name);

            const resume = () => {
                audioRef.current?.play();
                document.removeEventListener("click", resume);
            };

            document.addEventListener("click", resume);
        });
}, [user.stream, isLocal])


    const displayName = isLocal ? `${user.userName} (You)` : user.userName;

    return (
        <div className={cn(
            "relative bg-gray-900 rounded-xl overflow-hidden aspect-video group",
            isSpeaking && "ring-2 ring-green-500",
            className
        )}>
            <audio ref={audioRef} autoPlay playsInline />

            {/* Video Element */}
             {/* Video Element - FIXED CONDITION */}
        {hasVideo ? (
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isLocal}
                className="w-full h-full object-cover"
                // Add these event handlers for debugging
                onLoadedMetadata={() => {
                    console.log(`✅ Video metadata loaded for ${user.userName}`);
                    console.log(`📏 Video dimensions:`, {
                        width: videoRef.current?.videoWidth,
                        height: videoRef.current?.videoHeight,
                        duration: videoRef.current?.duration
                    });
                }}
                onCanPlay={() => console.log(`▶️ Video can play for ${user.userName}`)}
                onPlaying={() => console.log(`🎬 Video playing for ${user.userName}`)}
                onError={(e) => {
                    console.error(`❌ Video error for ${user.userName}:`, 
                        videoRef.current?.error?.message || e);
                }}
            />
        ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center mb-4">
                    <User className="w-10 h-10 text-gray-400" />
                </div>
                <p className="text-white font-medium text-lg">{displayName}</p>
                {!user.stream ? (
                    <p className="text-gray-400 text-sm mt-2">Connecting...</p>
                ) : !hasVideo ? (
                    <p className="text-gray-400 text-sm mt-2">Video off</p>
                ) : null}
            </div>
        )}

        {/* DEBUG OVERLAY - Keep this to see what's happening */}
        <div className="absolute top-2 left-2 bg-black/70 text-white text-xs p-2 rounded z-10">
            <div className="font-bold">{user.userName}</div>
            <div>Stream: {user.stream ? '✅' : '❌'}</div>
            <div>Video: {hasVideo ? '📹' : '👤'}</div>
            <div>Audio: {hasAudio ? '🔊' : '🔇'}</div>
            <div>Tracks: {user.stream?.getTracks().length || 0}</div>
        </div>

            {/* Overlay with user info */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 transition-opacity group-hover:opacity-100 opacity-90">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-white font-medium truncate max-w-[150px]">
                            {displayName}
                        </span>
                        {isLocal && (
                            <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                                You
                            </span>
                        )}
                        {user.isHost && (
                            <span className="text-xs bg-yellow-600 text-white px-2 py-1 rounded">
                                Host
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Screen sharing indicator */}
                        {user.isScreenSharing && (
                            <div className="bg-purple-600 p-1 rounded">
                                <ScreenShare className="w-4 h-4 text-white" />
                            </div>
                        )}

                        {/* Audio status */}
                        {!user.isAudioOn ? (
                            <div className="bg-red-600 p-1 rounded">
                                <MicOff className="w-4 h-4 text-white" />
                            </div>
                        ) : isSpeaking && !isLocal ? (
                            <div className="bg-green-600 p-1 rounded animate-pulse">
                                <Mic className="w-4 h-4 text-white" />
                            </div>
                        ) : (
                            <div className="bg-gray-700 p-1 rounded">
                                <Mic className="w-4 h-4 text-gray-300" />
                            </div>
                        )}

                        {/* Video status */}
                        {!user.isVideoOn && (
                            <div className="bg-red-600 p-1 rounded">
                                <VideoOff className="w-4 h-4 text-white" />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Connection indicator */}
            {isLocal && (
                <div className="absolute top-4 right-4">
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
                            Live
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}