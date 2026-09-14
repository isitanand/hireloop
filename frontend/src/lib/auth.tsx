import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import * as api from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hasToken, setHasToken] = useState(() => Boolean(api.getToken()));

  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: api.fetchMe,
    enabled: hasToken,
    retry: false,
  });

  async function login(email: string, password: string) {
    const token = await api.login(email, password);
    api.setToken(token);
    setHasToken(true);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  async function register(email: string, password: string, name: string) {
    const token = await api.register(email, password, name);
    api.setToken(token);
    setHasToken(true);
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  }

  function logout() {
    api.clearToken();
    setHasToken(false);
    queryClient.clear();
  }

  return (
    <AuthContext.Provider
      value={{ user, isLoading: hasToken && isLoading, isAuthenticated: hasToken && Boolean(user), login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
