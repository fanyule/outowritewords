import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppThemeMode = "deepsea" | "mist" | "graphite";

export interface AppThemeOption {
  mode: AppThemeMode;
  label: string;
  shortLabel: string;
  description: string;
}

export const APP_THEME_OPTIONS: readonly AppThemeOption[] = [
  {
    mode: "deepsea",
    label: "深海专业",
    shortLabel: "深海",
    description: "提亮后的专业深色模式，适合长时间专注创作。",
  },
  {
    mode: "mist",
    label: "雾白简约",
    shortLabel: "雾白",
    description: "低饱和浅色模式，更像成熟商业 SaaS 产品。",
  },
  {
    mode: "graphite",
    label: "石墨蓝灰",
    shortLabel: "石墨",
    description: "介于深色与浅色之间的稳重工作模式。",
  },
] as const;

function normalizeThemeMode(raw: unknown): AppThemeMode {
  if (raw === "deepsea" || raw === "mist" || raw === "graphite") {
    return raw;
  }
  return "graphite";
}

interface AppThemeStoreState {
  themeMode: AppThemeMode;
  setThemeMode: (mode: AppThemeMode) => void;
}

export const useAppThemeStore = create<AppThemeStoreState>()(
  persist(
    (set) => ({
      themeMode: "graphite",
      setThemeMode: (themeMode) => set({ themeMode }),
    }),
    {
      name: "app-theme-mode",
      partialize: (state) => ({ themeMode: state.themeMode }),
      merge: (persisted, current) => {
        const persistedState = (persisted ?? {}) as Partial<AppThemeStoreState>;
        return {
          ...current,
          ...persistedState,
          themeMode: normalizeThemeMode(persistedState.themeMode),
        };
      },
    },
  ),
);
