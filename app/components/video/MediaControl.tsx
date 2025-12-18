// frontend/src/components/video/MediaControls.tsx
'use client';

import { Button } from '@/components/ui/button';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,

  PhoneOff,
  Settings,
  Users,
  MessageSquare
} from 'lucide-react';
import { useRoom } from '@/app/hooks/useRoom';
import { useMediaStream } from '@/app/hooks/useMediaStream';

interface MediaControlsProps {
  onToggleChat?: () => void;
  onToggleParticipants?: () => void;
  onSettings?: () => void;
}

export default function MediaControls({
  onToggleChat,
  onToggleParticipants,
  onSettings
}: MediaControlsProps) {
  const {
    isVideoOn,
    isAudioOn,
 
    toggleLocalVideo,
    toggleLocalAudio,

    leaveRoom
  } = useRoom();

  const { hasCamera, hasMicrophone } = useMediaStream();



  const handleLeaveRoom = () => {
    if (confirm('Are you sure you want to leave the room?')) {
      leaveRoom();
    }
  };

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
      <div className="flex items-center gap-2 bg-black/80 backdrop-blur-lg border border-gray-800 rounded-full px-6 py-3 shadow-2xl">
        {/* Audio Control */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleLocalAudio}
          className={cn(
            "rounded-full",
            !hasMicrophone && "opacity-50 cursor-not-allowed",
            !isAudioOn && "bg-red-600 hover:bg-red-700"
          )}
          disabled={!hasMicrophone}
          title={isAudioOn ? "Mute microphone" : "Unmute microphone"}
        >
          {isAudioOn ? (
            <Mic className="w-5 h-5 text-white" />
          ) : (
            <MicOff className="w-5 h-5 text-white" />
          )}
        </Button>

        {/* Video Control */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleLocalVideo}
          className={cn(
            "rounded-full",
            !hasCamera && "opacity-50 cursor-not-allowed",
            !isVideoOn && "bg-red-600 hover:bg-red-700"
          )}
          disabled={!hasCamera}
          title={isVideoOn ? "Turn off camera" : "Turn on camera"}
        >
          {isVideoOn ? (
            <Video className="w-5 h-5 text-white" />
          ) : (
            <VideoOff className="w-5 h-5 text-white" />
          )}
        </Button>

     

        {/* Divider */}
        <div className="h-8 w-px bg-gray-700 mx-2"></div>

        {/* Participants List */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleParticipants}
          className="rounded-full"
          title="View participants"
        >
          <Users className="w-5 h-5 text-white" />
        </Button>

        {/* Chat */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleChat}
          className="rounded-full"
          title="Open chat"
        >
          <MessageSquare className="w-5 h-5 text-white" />
        </Button>

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onSettings}
          className="rounded-full"
          title="Settings"
        >
          <Settings className="w-5 h-5 text-white" />
        </Button>

        {/* Divider */}
        <div className="h-8 w-px bg-gray-700 mx-2"></div>

        {/* Leave Call */}
        <Button
          variant="destructive"
          className="rounded-full px-6"
          onClick={handleLeaveRoom}
          title="Leave call"
        >
          <PhoneOff className="w-5 h-5 mr-2" />
          Leave
        </Button>
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}