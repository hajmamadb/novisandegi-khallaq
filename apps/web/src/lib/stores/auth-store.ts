'use client';

import { create } from 'zustand';
import { api, ApiError } from '@/lib/api/client';
import type { AuthResponse, User } from '@/lib/types';

// Spec F.6 — auth-store. Token persisted in localStorage (the api client
// reads it from there on every request).

interface AuthState {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token:
    typeof window !== 'undefined' ? localStorage.getItem('token') : null,

  login: async (email, password) => {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    localStorage.setItem('token', res.accessToken);
    set({ user: res.user, token: res.accessToken });
  },

  register: async (email, password, displayName) => {
    const res = await api.post<AuthResponse>('/auth/register', {
      email,
      password,
      displayName,
    });
    localStorage.setItem('token', res.accessToken);
    set({ user: res.user, token: res.accessToken });
  },

  logout: () => {
    // DECISION: best-effort server logout — the local wipe is what matters
    // for the client; a network failure must not trap the user logged in.
    api
      .post('/auth/logout')
      .catch((err: unknown) => {
        if (err instanceof ApiError) return; // already handled by client
        throw err;
      });
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },

  setUser: (user) => set({ user }),
}));
