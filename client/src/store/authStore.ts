import { create } from "zustand";
import type { LocalSessionInfo } from "@ai-novel/shared/types/auth";
import {
  getCurrentSession,
  loginWithPassword,
  logoutCurrentSession,
  registerWithPassword,
  type RegisterWithPasswordInput,
} from "@/api/auth";
import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession,
} from "@/lib/authSession";

type AuthStatus = "checking" | "authenticated" | "unauthenticated";

interface AuthStoreState {
  initialized: boolean;
  status: AuthStatus;
  session: LocalSessionInfo | null;
  bootstrap: () => Promise<void>;
  refreshSession: () => Promise<void>;
  login: (username: string, password: string) => Promise<LocalSessionInfo>;
  register: (input: RegisterWithPasswordInput) => Promise<LocalSessionInfo>;
  logout: () => Promise<void>;
  applySession: (session: LocalSessionInfo | null) => void;
}

const initialSession = readStoredAuthSession();
let bootstrapPromise: Promise<void> | null = null;

function persistSession(session: LocalSessionInfo | null): void {
  if (session) {
    writeStoredAuthSession(session);
    return;
  }
  clearStoredAuthSession();
}

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  initialized: false,
  status: initialSession ? "checking" : "unauthenticated",
  session: initialSession,
  applySession: (session) => {
    persistSession(session);
    set({
      session,
      status: session ? "authenticated" : "unauthenticated",
      initialized: true,
    });
  },
  bootstrap: async () => {
    if (bootstrapPromise) {
      return bootstrapPromise;
    }

    bootstrapPromise = (async () => {
      const existing = readStoredAuthSession();
      if (!existing?.sessionToken) {
        clearStoredAuthSession();
        set({
          initialized: true,
          status: "unauthenticated",
          session: null,
        });
        return;
      }

      set({
        status: "checking",
        session: existing,
      });

      try {
        const current = await getCurrentSession();
        if (!current?.session) {
          clearStoredAuthSession();
          set({
            initialized: true,
            status: "unauthenticated",
            session: null,
          });
          return;
        }

        writeStoredAuthSession(current.session);
        set({
          initialized: true,
          status: "authenticated",
          session: current.session,
        });
      } catch {
        clearStoredAuthSession();
        set({
          initialized: true,
          status: "unauthenticated",
          session: null,
        });
      } finally {
        bootstrapPromise = null;
      }
    })();

    return bootstrapPromise;
  },
  refreshSession: async () => {
    await get().bootstrap();
  },
  login: async (username, password) => {
    const response = await loginWithPassword(username, password);
    persistSession(response.session);
    set({
      initialized: true,
      status: "authenticated",
      session: response.session,
    });
    return response.session;
  },
  register: async (input) => {
    const response = await registerWithPassword(input);
    persistSession(response.session);
    set({
      initialized: true,
      status: "authenticated",
      session: response.session,
    });
    return response.session;
  },
  logout: async () => {
    try {
      await logoutCurrentSession();
    } finally {
      clearStoredAuthSession();
      set({
        initialized: true,
        status: "unauthenticated",
        session: null,
      });
    }
  },
}));
