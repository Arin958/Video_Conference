// frontend/src/components/landing/RoomForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { Video, Users, Lock, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRoom } from '@/app/hooks/useRoom';

interface RoomFormProps {
  onJoinRoom?: (roomId: string) => void;
}

export default function RoomForm({ onJoinRoom }: RoomFormProps) {
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<{
    userName?: string;
    roomId?: string;
    password?: string;
  }>({});

  const { createRoom, joinRoom, isLoading, error, setError } = useRoom();

  const validateForm = () => {
    const newErrors: typeof errors = {};
    
    if (!userName.trim()) {
      newErrors.userName = 'Name is required';
    } else if (userName.length < 2) {
      newErrors.userName = 'Name must be at least 2 characters';
    } else if (userName.length > 20) {
      newErrors.userName = 'Name must be less than 20 characters';
    }
    
    if (!isCreating && !roomId.trim()) {
      newErrors.roomId = 'Room ID is required';
    } else if (!isCreating && roomId.length !== 6) {
      newErrors.roomId = 'Room ID must be 6 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateRoom = async () => {
    if (!validateForm()) return;
    
    setError(null);
    try {
      const response = await createRoom(userName, roomId);
      console.log(response, "response");
      console.log('Room created with ID:', response.roomId, response.userName);
      setRoomId(response.roomId);
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create room:', error);
    }
  };

  const handleJoinRoom = async () => {
    if (!validateForm()) return;
    
    setError(null);
    try {
      await joinRoom(roomId.toUpperCase(), userName, password || undefined);
      if (onJoinRoom) {
        onJoinRoom(roomId);
      }
    } catch (error) {
      console.error('Failed to join room:', error);
    }
  };

  const handleGenerateRoom = () => {
    setIsCreating(true);
    setRoomId('');
    setPassword('');
    setErrors({});
  };

  const handleCopyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* User Info */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Your Name
          </label>
          <Input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            placeholder="Enter your name"
            className={cn(
              "w-full",
              errors.userName && "border-red-500 focus:border-red-500 focus:ring-red-500"
            )}
            disabled={isLoading}
          />
          {errors.userName && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.userName}</p>
          )}
        </div>

        {/* Room ID - Only show for joining */}
        {!isCreating && (
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Room ID
            </label>
            <div className="relative">
              <Input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="Enter 6-digit room ID"
                className={cn(
                  "w-full pr-12",
                  errors.roomId && "border-red-500 focus:border-red-500 focus:ring-red-500"
                )}
                disabled={isLoading}
                maxLength={6}
              />
              {roomId && (
                <button
                  onClick={handleCopyRoomId}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  disabled={isLoading}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
            {errors.roomId && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.roomId}</p>
            )}
          </div>
        )}

        {/* Password - Optional */}
        {!isCreating && (
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Password (Optional)
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Room password if required"
              className="w-full"
              disabled={isLoading}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password}</p>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        {isCreating ? (
          <Button
            onClick={handleCreateRoom}
            className="w-full py-6 text-lg"
            disabled={isLoading}
          >
            <Video className="w-5 h-5 mr-2" />
            {isLoading ? 'Creating Room...' : 'Create New Room'}
          </Button>
        ) : (
          <Button
            onClick={handleJoinRoom}
            className="w-full py-6 text-lg bg-green-600 hover:bg-green-700"
            disabled={isLoading}
          >
            <Users className="w-5 h-5 mr-2" />
            {isLoading ? 'Joining...' : 'Join Room'}
          </Button>
        )}

        <Button
          onClick={isCreating ? () => setIsCreating(false) : handleGenerateRoom}
          variant="outline"
          className="w-full"
          disabled={isLoading}
        >
          {isCreating ? 'Join Existing Room' : 'Create New Room Instead'}
        </Button>
      </div>

      {/* Room Info if created */}
      {isCreating && roomId && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Your Room ID
            </span>
            <button
              onClick={handleCopyRoomId}
              className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="flex items-center justify-center">
            <code className="text-2xl font-bold tracking-wider text-blue-800 dark:text-blue-200 bg-white dark:bg-gray-800 px-4 py-2 rounded">
              {roomId}
            </code>
          </div>
          <p className="mt-2 text-sm text-blue-600 dark:text-blue-400 text-center">
            Share this ID with others to join your room
          </p>
        </div>
      )}

      {/* Features List */}
      <div className="grid grid-cols-2 gap-4 pt-6 border-t border-gray-200 dark:border-gray-800">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg mb-2">
            <Video className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">HD Video</p>
        </div>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg mb-2">
            <Users className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Up to 20 Users</p>
        </div>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg mb-2">
            <Lock className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Secure</p>
        </div>
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg mb-2">
            <Check className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </div>
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">No Login</p>
        </div>
      </div>
    </div>
  );
}