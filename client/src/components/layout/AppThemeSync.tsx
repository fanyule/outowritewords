import { useEffect } from "react";
import { useAppThemeStore } from "@/store/appThemeStore";

export default function AppThemeSync() {
  const themeMode = useAppThemeStore((state) => state.themeMode);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.appTheme = themeMode;
  }, [themeMode]);

  return null;
}
