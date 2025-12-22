'use client';

import { useMemo } from 'react';
import VideoTile from './VideoTile';
import { useStore } from '@/app/store/useStore';
import { cn } from '@/lib/utils';

export default function VideoGrid() {
  const { currentRoom, currentUser, localStream } = useStore();

  // Get all participants including local user WITHOUT DUPLICATES
  // Extract complex store state values to variables for dependency tracking
  const isVideoOn = useStore(state => state.isVideoOn);
  const isAudioOn = useStore(state => state.isAudioOn);
  const isScreenSharing = useStore(state => state.isScreenSharing);

  const allParticipants = useMemo(() => {
    const participants = [];

    // Add local user FIRST (with local stream)
    if (currentUser) {
      participants.push({
        ...currentUser,
        isVideoOn,
        isAudioOn,
        isScreenSharing,
        stream: localStream || undefined,
      });
    }

    // Add remote participants ONLY (exclude current user)
    if (currentRoom) {
      Array.from(currentRoom.participants.values()).forEach(participant => {
        // ⚠️ CRITICAL: Don't add the current user again
        if (participant.id !== currentUser?.id && participant.socketId !== currentUser?.socketId) {
          participants.push(participant);
        }
      });
    }

    // Debug: Log what we're returning
    console.log("🎬 VideoGrid FINAL participants:", participants.map(p => ({
      name: p.userName,
      id: p.id,
      isLocal: p.id === currentUser?.id,
      hasStream: !!p.stream,
      socketId: p.socketId
    })));

    return participants;
  }, [currentUser, currentRoom, localStream, isVideoOn, isAudioOn, isScreenSharing]);

  // Calculate grid layout based on participant count
  const gridClasses = useMemo(() => {
    const count = allParticipants.length;
    
    if (count === 1) return 'grid-cols-1 max-w-2xl';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2';
    if (count <= 4) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4';
    if (count <= 6) return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6';
    if (count <= 9) return 'grid-cols-3 md:grid-cols-4 lg:grid-cols-9';
    return 'grid-cols-4 md:grid-cols-6 lg:grid-cols-9';
  }, [allParticipants.length]);

  if (allParticipants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-gray-500">
        <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
          <svg
            className="w-12 h-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </div>
        <p className="text-lg font-medium">No participants yet</p>
        <p className="text-sm">Invite others to join your room</p>
      </div>
    );
  }

  return (
    <div className={cn(
      "grid gap-4 p-4",
      gridClasses
    )}>
      {allParticipants.map((participant, index) => (
        <VideoTile
          key={participant.id + (participant.id === currentUser?.id ? '_local' : '_remote')}
          user={participant}
          isLocal={participant.id === currentUser?.id}
          className={cn(
            allParticipants.length === 2 && index === 0 && "md:col-span-1",
            allParticipants.length === 3 && index === 0 && "lg:col-span-2",
            allParticipants.length === 5 && index < 2 && "lg:col-span-3",
            allParticipants.length === 7 && index < 1 && "lg:col-span-4"
          )}
        />
      ))}
    </div>
  );
}