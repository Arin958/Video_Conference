// frontend/src/store/useStore.ts
import { create } from 'zustand';
import { Participant, ChatMessage } from '@/lib/socket';

export interface User {
  id: string;
  userName: string;

  isHost: boolean;
  isVideoOn: boolean;
  isAudioOn: boolean;
  isScreenSharing: boolean;
  stream?: MediaStream;
  socketId?: string;
}

export interface Room {
  id: string;
  name?: string;
  participants: Map<string, User>;
  isLocked: boolean;
  hostId: string;
}

interface AppState {
  // User state
  currentUser: {
    id: string;
    userName: string;
    isHost: boolean;
  } | null;

  // Room state
  currentRoom: {
    id: string;
    participants: Map<string, User>;
    isLocked: boolean;
    hostId: string;
  } | null;

  // Media state
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  isVideoOn: boolean;
  isAudioOn: boolean;
  isScreenSharing: boolean;

  // Chat state
  messages: ChatMessage[];

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentUser: (user: { id: string; userName: string; isHost: boolean }) => void;
  setCurrentRoom: (room: { id: string; hostId: string; isLocked?: boolean }) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  toggleVideo: () => void;
  toggleAudio: () => void;
  toggleScreenShare: () => void;
  addParticipant: (userId: string, user: User) => void;
  removeParticipant: (userId: string) => void;
  updateParticipant: (userId: string, updates: Partial<User>) => void;
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  resetRoom: () => void;
  resetAll: () => void;
}

export const useStore = create<AppState>((set) => ({
  currentUser: null,
  currentRoom: null,
  localStream: null,
  screenStream: null,
  isVideoOn: true,
  isAudioOn: true,
  isScreenSharing: false,
  messages: [],
  isLoading: false,
  error: null,

  setCurrentUser: (user) => set({ currentUser: user }),
  setCurrentRoom: (room) => set({
    currentRoom: {
      id: room.id,
      hostId: room.hostId,
      isLocked: room.isLocked || false,
      participants: new Map()
    }
  }),
  setLocalStream: (stream) => set({ localStream: stream }),
  setScreenStream: (stream) => set({ screenStream: stream }),

  toggleVideo: () => set((state) => ({
    isVideoOn: !state.isVideoOn,
    currentUser: state.currentUser ? { ...state.currentUser } : null
  })),

  toggleAudio: () => set((state) => ({
    isAudioOn: !state.isAudioOn,
    currentUser: state.currentUser ? { ...state.currentUser } : null
  })),

  toggleScreenShare: () => set((state) => ({
    isScreenSharing: !state.isScreenSharing
  })),

  addParticipant: (userId, user) => set((state) => {
    if (!state.currentRoom) return state;

    const newParticipants = new Map(state.currentRoom.participants);
    newParticipants.set(userId, user);

    return {
      currentRoom: {
        ...state.currentRoom,
        participants: newParticipants
      }
    };
  }),

  updateParticipant: (userId, updates) => set((state) => {
    if (!state.currentRoom) return state;

    const participant = state.currentRoom.participants.get(userId);
    if (!participant) return state;

    const newParticipants = new Map(state.currentRoom.participants);
    newParticipants.set(userId, { ...participant, ...updates });

    return {
      currentRoom: {
        ...state.currentRoom,
        participants: newParticipants
      }
    };
  }),


  removeParticipant: (userId) => set((state) => {
    if (!state.currentRoom) return state;

    const newParticipants = new Map(state.currentRoom.participants);
    newParticipants.delete(userId);

    return {
      currentRoom: {
        ...state.currentRoom,
        participants: newParticipants
      }
    };
  }),

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message]
  })),


  resetRoom: () => set({
    currentRoom: null,
    localStream: null,
    screenStream: null,
    isVideoOn: true,
    isAudioOn: true,
    isScreenSharing: false,
    messages: []
  }),



  clearMessages: () => set({ messages: [] }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  resetAll: () => set({
    currentUser: null,
    currentRoom: null,
    localStream: null,
    screenStream: null,
    isVideoOn: true,
    isAudioOn: true,
    isScreenSharing: false,
    messages: [],
    isLoading: false,
    error: null
  })

}));