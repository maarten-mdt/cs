import { create } from "zustand";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  init: () => Promise<void>;
  setUser: (user: User | null) => void;
  logout: () => void;
}

const apiUrl = import.meta.env.VITE_API_URL || "";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  init: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch(`${apiUrl}/api/auth/me`, { credentials: "include" });
      if (res.ok) {
        const user = await res.json();
        set({ user, isAuthenticated: true });
      } else {
        set({ user: null, isAuthenticated: false });
      }
    } catch {
      set({ user: null, isAuthenticated: false });
    } finally {
      set({ isLoading: false });
    }
  },
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
