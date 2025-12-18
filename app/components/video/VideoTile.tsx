// frontend/src/components/video/VideoTile.tsx
'use client';

import { useRef, useEffect, useState } from 'react';
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
    const hasVideo =
        !!user.stream?.getVideoTracks()[0] &&
        user.stream.getVideoTracks()[0].enabled &&
        user.isVideoOn;
    const [isSpeaking, setIsSpeaking] = useState(false);

    useEffect(() => {
        if (!videoRef.current || !user.stream) return;

        videoRef.current.srcObject = user.stream;

        if (!isLocal) {
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


    const displayName = isLocal ? `${user.userName} (You)` : user.userName;

    return (
        <div className={cn(
            "relative bg-gray-900 rounded-xl overflow-hidden aspect-video group",
            isSpeaking && "ring-2 ring-green-500",
            className
        )}>
            {/* Video Element */}
            {hasVideo ? (
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal}
                    className="w-full h-full object-cover"
                />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
                    <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center mb-4">
                        <User className="w-10 h-10 text-gray-400" />
                    </div>
                    <p className="text-white font-medium text-lg">{displayName}</p>
                </div>
            )}

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