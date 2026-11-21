import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";

/** Series colours checked at 4.5:1 or better against the panel surface in each theme. */
const PALETTE = {
  light: {
    series: ["#0B57A4", "#A64B00", "#14622B", "#7A2E8C", "#00666B", "#9B1C1C"],
    axis: "#454545",
    grid: "#D5D8DD",
    text: "#1A1A1A",
  },
  dark: {
    series: ["#9CCBFF", "#FFB870", "#8FE0A8", "#E3B0F0", "#7FDDE3", "#FFB8B0"],
    axis: "#C9CDD3",
    grid: "#363B43",
    text: "#F2F3F5",
  },
};

interface ThemeState {
  choice: ThemeChoice;
  setChoice: (c: ThemeChoice) => void;
  colors: (typeof PALETTE)["light"];
}

const ThemeContext = createContext<ThemeState>({ choice: "system", setChoice: () => {}, colors: PALETTE.light });

const KEY = "third-eye-admin-theme";

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const media = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const [systemDark, setSystemDark] = useState(media?.matches ?? false);

  useEffect(() => {
    if (!media) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", on);
    return () => media.removeEventListener("change", on);
  }, [media]);

  useEffect(() => {
    const root = document.documentElement;
    if (choice === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", choice);
  }, [choice]);

  const setChoice = (c: ThemeChoice) => {
    setChoiceState(c);
    try {
      if (c === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, c);
    } catch {
      /* storage unavailable */
    }
  };

  const dark = choice === "dark" || (choice === "system" && systemDark);
  return (
    <ThemeContext.Provider value={{ choice, setChoice, colors: dark ? PALETTE.dark : PALETTE.light }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
