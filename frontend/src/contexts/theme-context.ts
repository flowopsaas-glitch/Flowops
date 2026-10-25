import { createContext, useContext } from "react";
import type { ThemeContextValue } from "./ThemeContext";

/**
 * Theme context + hook live apart from ThemeProvider so the provider file
 * only exports a component (react-refresh). The provider supplies the value;
 * the default below matches the dark-first initial theme.
 */
export const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
  isDark: true,
});

export const useTheme = () => useContext(ThemeContext);
