import { create } from "zustand";
import { supabase } from "../lib/supabase";

interface User {
  id: string;
  name: string;
  identity: string;
  role: "admin" | "user" | "admin2";
  is_verified?: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  checkAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem("token"),
  login: (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ token: null, user: null });
  },
  checkAuth: async () => {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    
    if (!token || !userStr) {
      set({ token: null, user: null });
      return;
    }

    try {
      const user = JSON.parse(userStr) as User;
      
      // Verify user still exists in Supabase
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, role, identity_number')
        .eq('id', user.id)
        .single();

      if (error || !data) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        set({ token: null, user: null });
        return;
      }

      // Check if user is verified
      const { data: verification } = await supabase
        .from('global_verifications')
        .select('id')
        .eq('user_id', user.id)
        .single();

      const updatedUser: User = {
        id: data.id,
        name: data.full_name,
        identity: data.identity_number,
        role: data.role as "admin" | "user" | "admin2",
        is_verified: !!verification
      };

      set({ user: updatedUser, token });
      localStorage.setItem("user", JSON.stringify(updatedUser));
    } catch (err) {
      console.error(err);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      set({ token: null, user: null });
    }
  },
}));
