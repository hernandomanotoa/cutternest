import { create } from 'zustand';
import { api } from '../api/client';
import type { User } from '../types';

interface AuthStore {
  user: User | null;
  mode: 'principal' | 'guest' | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  setAuthenticated: (user: User | null, mode: 'principal' | 'guest' | null) => void;
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
  setAuthenticated: (user, mode) => {
    set({
      user,
      mode,
      isAuthenticated: true,
      isGuest: mode === 'guest',
    });
  },
  setUser: (user) => set({ user }),
  fetchUser: async () => {
    try {
      const response = await api.get('/auth/users/me');
      set({ user: response.data });
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
