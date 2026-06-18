import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme:      Theme;
  toggleTheme: () => void;
  isDark:     boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:       "dark",
  toggleTheme: () => {},
  isDark:      true,
});

const STORAGE_KEY = "flowops.theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Theme) ?? "dark";
    } catch {
      return "dark";
    }
  });

  // Apply / remove the "light-mode" class on <html> whenever the theme changes.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light-mode");
    } else {
      root.classList.remove("light-mode");
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark: theme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
