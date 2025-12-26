// frontend/src/app/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import RoomForm from '@/app/components/landing/RoomForm';
import VideoGrid from '@/app/components/video/VideoGrid';
import MediaControls from '@/app/components/video/MediaControl';
import { useRoom } from '@/app/hooks/useRoom';
import { useMediaStream } from '@/app/hooks/useMediaStream';
import { Button } from '@/components/ui/button';
import { Users, Copy, Shield, Video as VideoIcon, VideoOff, MicOff } from 'lucide-react';


export default function HomePage() {
  const { currentRoom, currentUser, localStream, setLocalStream } = useRoom();
  const { startCamera, isLoading: mediaLoading, error: mediaError } = useMediaStream();
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const startedRef = useRef(false);

  // Initialize camera when user joins a room
 useEffect(() => {
  if (!currentRoom || startedRef.current) return;

  startedRef.current = true;
  startCamera().catch(console.error);

  return () => {
    startedRef.current = false;
  };
}, [currentRoom?.id]);

  const handleJoinRoom = (roomId: string) => {
    console.log('Joined room:', roomId);
  };

  if (!currentRoom) {
    return (
      <div className="min-h-screen bg-linear-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-950">
        <div className="container mx-auto px-4 py-12">
          {/* Header */}
          <header className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-linear-to-br from-blue-500 to-purple-600 rounded-2xl mb-6 shadow-lg">
              <VideoIcon className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
              Video Conference
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              High-quality video calls with screen sharing, real-time chat, and secure rooms.
              No downloads required.
            </p>
          </header>

          {/* Main Content */}
          <div className="grid md:grid-cols-2 gap-12 max-w-6xl mx-auto">
            {/* Left Column - Features */}
            <div className="space-y-8">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-lg">
                <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white">
                  Why Choose Our Platform
                </h2>
                
                <div className="space-y-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Shield className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 dark:text-white">Secure & Private</h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                        End-to-end encryption and password-protected rooms ensure your meetings are private.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Users className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 dark:text-white">Up to 20 Participants</h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                        Crystal clear video and audio for all participants with intelligent bandwidth optimization.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                      <VideoIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 dark:text-white">Screen Sharing</h3>
                      <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                        Share your entire screen, specific windows, or browser tabs with participants.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">20+</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Max Users</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">1080p</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">HD Video</div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">24/7</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Available</div>
                </div>
              </div>
            </div>

            {/* Right Column - Room Form */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl">
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">
                  Start or Join a Meeting
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Create a new room or join an existing one with the room ID.
                </p>
              </div>

              <RoomForm onJoinRoom={handleJoinRoom} />

              {/* Media Error Display */}
              {mediaError && (
                <div className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-red-600 dark:text-red-400 text-sm">
                    <strong>Media Error:</strong> {mediaError}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => window.location.reload()}
                  >
                    Retry
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <footer className="mt-16 text-center text-sm text-gray-500 dark:text-gray-400">
            <p>Built with Next.js, Socket.IO, and WebRTC</p>
            <p className="mt-1">No registration required • End-to-end encrypted • Open source</p>
          </footer>
        </div>
      </div>
    );
  }

  // Room View
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Room Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <VideoIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">
                  Room: <span className="font-mono">{currentRoom.id}</span>
                </h1>
                <p className="text-sm text-gray-400">
                  {currentUser?.userName} • {currentRoom.participants.size + 1} participants
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
              }}
              className="border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Invite
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pb-32">
        <VideoGrid />
      </main>

      {/* Media Controls */}
      <MediaControls
        onToggleChat={() => setShowChat(!showChat)}
        onToggleParticipants={() => setShowParticipants(!showParticipants)}
        onSettings={() => {
          // TODO: Implement settings modal
        }}
      />

      {/* Chat Panel */}
      {showChat && (
        <div className="fixed right-0 top-0 bottom-0 w-96 bg-gray-900 border-l border-gray-800 shadow-xl">
          {/* Chat header */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Chat</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowChat(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </Button>
            </div>
          </div>
          
          {/* Chat messages */}
          <div className="p-4">
            <p className="text-gray-500 text-center text-sm py-8">
              Chat functionality will be implemented in Day 5
            </p>
          </div>
        </div>
      )}

      {/* Participants Panel */}
      {showParticipants && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-gray-900 border-l border-gray-800 shadow-xl">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">
                Participants ({currentRoom.participants.size + 1})
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowParticipants(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </Button>
            </div>
          </div>
          
          <div className="p-4 space-y-2">
            {/* Local user */}
            <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {currentUser?.userName?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-white font-medium">{currentUser?.userName} (You)</p>
                  <p className="text-xs text-gray-400">Host</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              </div>
            </div>

            {/* Remote participants */}
            {Array.from(currentRoom.participants.values()).map((participant) => (
              <div
                key={participant.id}
                className="flex items-center justify-between p-3 hover:bg-gray-800/30 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {participant.userName?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{participant.userName}</p>
                    <p className="text-xs text-gray-400">Guest</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!participant.isAudioOn && (
                    <MicOff className="w-4 h-4 text-red-500" />
                  )}
                  {!participant.isVideoOn && (
                    <VideoOff className="w-4 h-4 text-red-500" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}