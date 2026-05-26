import { cn } from "@/lib/utils";
import {
  APP_THEME_OPTIONS,
  type AppThemeMode,
  useAppThemeStore,
} from "@/store/appThemeStore";

interface ThemeModeSwitcherProps {
  compact?: boolean;
  className?: string;
}

export default function ThemeModeSwitcher(props: ThemeModeSwitcherProps) {
  const { compact = false, className } = props;
  const themeMode = useAppThemeStore((state) => state.themeMode);
  const setThemeMode = useAppThemeStore((state) => state.setThemeMode);

  return (
    <div className={cn("app-theme-switcher", compact && "app-theme-switcher-compact", className)}>
      {APP_THEME_OPTIONS.map((option) => {
        const active = option.mode === themeMode;
        return (
          <button
            key={option.mode}
            type="button"
            className={cn("app-theme-switcher__button", active && "app-theme-switcher__button--active")}
            onClick={() => setThemeMode(option.mode as AppThemeMode)}
            title={option.description}
            aria-pressed={active}
          >
            <span className="app-theme-switcher__dot" aria-hidden="true" />
            <span>{compact ? option.shortLabel : option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
