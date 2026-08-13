import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api/client';
import type { User } from '../types';

interface AuthStore {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  mode: 'principal' | 'guest' | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  setTokens: (access: string, refresh: string, user: User | null, mode: 'principal' | 'guest' | null) => void;
  setUser: (user: User | null) => void;
  fetchUser: () => Promise<void>;
  clear: () => void;
  refresh: () => Promise<void>;
}

export const useAuth = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      mode: null,
      isAuthenticated: false,
      isGuest: false,
      setTokens: (access, refresh, user, mode) => {
        localStorage.setItem('accessToken', access);
        localStorage.setItem('refreshToken', refresh);
        set({
          accessToken: access,
          refreshToken: refresh,
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
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('tempToken');
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          mode: null,
          isAuthenticated: false,
          isGuest: false,
        });
      },
      refresh: async () => {
        const refresh = get().refreshToken;
        if (!refresh) return;
        try {
          const response = await api.post('/auth/refresh', { refresh_token: refresh });
          const { access_token, refresh_token } = response.data;
          set((_state) => ({
            accessToken: access_token,
            refreshToken: refresh_token,
            isAuthenticated: true,
          }));
        } catch {
          get().clear();
        }
      },
    }),
    {
      name: 'cutternest-auth',
    }
  )
);
