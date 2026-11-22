import type { HTMLAttributes } from "react";
import type { ThemeName } from "./tokens";

export type ThemeProviderProps = HTMLAttributes<HTMLDivElement> & { theme: ThemeName };

/** Sets the theme for everything inside. Import "@haunt-kit/ui/styles.css" once in the app. */
export function ThemeProvider({ theme, className, ...rest }: ThemeProviderProps) {
  return (
    <div data-theme={theme} className={["hk-theme", className ?? ""].filter(Boolean).join(" ")} {...rest} />
  );
}
