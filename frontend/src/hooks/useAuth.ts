import { create } from 'zustand';
import { api } from '../api/client';
import type { User } from '../types';

interface AuthStore {
  user: User | null;
  mode: 'principal' | 'guest' | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  guestProjectId: string | null;
  setAuthenticated: (user: User | null, mode: 'principal' | 'guest' | null, guestProjectId?: string | null) => void;
  setUser: (user: User | null) => void;
  fetchUser: () => Promise<void>;
  clear: () => void;
  refresh: () => Promise<void>;
}

export const useAuth = create<AuthStore>()((set, get) => ({
  user: null,
  mode: null,
  isAuthenticated: false,
  isGuest: false,
  guestProjectId: null,
  setAuthenticated: (user, mode, guestProjectId = null) => {
    set({
      user,
      mode,
      isAuthenticated: true,
      isGuest: mode === 'guest',
      guestProjectId,
    });
  },
  setUser: (user) => set({ user }),
  fetchUser: async () => {
    try {
      const response = await api.get('/auth/session');
      const { mode, user, project_id } = response.data;
      if (mode === 'principal' && user) {
        set({ user, mode: 'principal', isAuthenticated: true, isGuest: false, guestProjectId: null });
      } else if (mode === 'guest') {
        set({ user: null, mode: 'guest', isAuthenticated: true, isGuest: true, guestProjectId: project_id || null });
      }
    } catch {
      // ignore: guest sessions or network errors leave user as null
    }
  },
  clear: () => {
    set({
      user: null,
      mode: null,
      isAuthenticated: false,
      isGuest: false,
      guestProjectId: null,
    });
  },
  refresh: async () => {
    try {
      await api.post('/auth/refresh');
      // Cookies se actualizan automaticamente por withCredentials
    } catch {
      get().clear();
    }
  },
}));
