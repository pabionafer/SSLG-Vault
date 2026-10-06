"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  role: "admin" | "treasurer" | "president" | "adviser" | "officer";
  is_active: boolean;
  bio: string | null;
  profile_image_url: string | null;
  pending_username: string | null;
}

export type GuardName =
  | "admin"
  | "treasurer"
  | "paymentRecorder"
  | "studentManager"
  | "expenseManager"
  | "igpEditor"
  | "igpManager";

/** Mirrors lib/roles.ts GUARDS so the UI can hide what a role cannot use. */
export const GUARD_ROLES: Record<GuardName, string[]> = {
  admin: ["admin"],
  treasurer: ["admin", "treasurer"],
  paymentRecorder: ["admin", "treasurer", "president"],
  studentManager: ["admin", "treasurer", "president"],
  expenseManager: ["admin", "treasurer", "president"],
  igpEditor: ["admin", "treasurer", "president", "officer"],
  igpManager: ["admin", "treasurer", "president"],
};

interface SessionValue {
  profile: Profile | null;
  loading: boolean;
  can: (guard: GuardName) => boolean;
  refresh: () => void;
}

const SessionContext = createContext<SessionValue>({
  profile: null,
  loading: true,
  can: () => false,
  refresh: () => {},
});

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    const res = await api<{ user: Profile }>("/api/auth/me");
    return res.ok ? res.data.user : null;
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchProfile();
    setProfile(next);
    setLoading(false);
  }, [fetchProfile]);

  useEffect(() => {
    let cancelled = false;
    fetchProfile().then((next) => {
      if (cancelled) return;
      setProfile(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchProfile]);

  const can = useCallback(
    (guard: GuardName) => {
      if (!profile) return false;
      return GUARD_ROLES[guard].includes(profile.role);
    },
    [profile],
  );

  return (
    <SessionContext.Provider value={{ profile, loading, can, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}
