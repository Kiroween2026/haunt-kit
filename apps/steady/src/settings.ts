// Owner: Anish (built by Yadnesh while Anish is unavailable).
// Small preferences, kept in localStorage on this device.
import { z } from "zod";

export const settingsSchema = z.object({
  /** Count reps out loud. */
  voice: z.boolean().default(true),
  /** Also say the instructions, so the screen can stay dark. */
  voiceOnly: z.boolean().default(false),
  /** Bigger text: 100, 125 or 150 percent. */
  textPercent: z.union([z.literal(100), z.literal(125), z.literal(150)]).default(100),
  /** Black and white with yellow. */
  highContrast: z.boolean().default(false),
});

export type Settings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export const SETTINGS_KEY = "steady:settings:v1";
export const DISCLAIMER_KEY = "steady:disclaimer:v1";

type Store = Pick<Storage, "getItem" | "setItem">;

/** Reads settings. Anything missing or broken falls back to the default, field by field. */
export function loadSettings(store: Store | null): Settings {
  if (!store) return DEFAULT_SETTINGS;
  try {
    const raw = JSON.parse(store.getItem(SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
    const merged = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const one = settingsSchema.shape[key].safeParse(raw?.[key]);
      if (one.success) (merged as Record<string, unknown>)[key] = one.data;
    }
    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(store: Store | null, settings: Settings): void {
  try {
    store?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage is full or blocked: settings just won't be remembered.
  }
}

export function hasAcceptedDisclaimer(store: Store | null): boolean {
  try {
    return store?.getItem(DISCLAIMER_KEY) === "yes";
  } catch {
    return false;
  }
}

export function acceptDisclaimer(store: Store | null): void {
  try {
    store?.setItem(DISCLAIMER_KEY, "yes");
  } catch {
    // Not remembered: it will be shown again next time, which is safe.
  }
}
