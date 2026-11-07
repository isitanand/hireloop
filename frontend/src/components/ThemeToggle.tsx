import { IconMoon, IconSun } from "./icons";
import { useTheme } from "../lib/theme";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className={`inline-flex items-center justify-center h-8 w-8 rounded-lg border border-line text-muted hover:text-text hover:bg-surface-hover transition-colors ${className}`}
    >
      {theme === "dark" ? <IconSun className="text-[15px]" /> : <IconMoon className="text-[15px]" />}
    </button>
  );
}
