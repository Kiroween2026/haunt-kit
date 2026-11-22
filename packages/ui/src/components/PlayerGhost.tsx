import type { CSSProperties } from "react";

export type PlayerGhostProps = {
  name: string;
  /** The player's color, "#rrggbb". */
  color: string;
  /** "ready" (default), "out" (eliminated) or "away" (disconnected). */
  status?: "ready" | "out" | "away";
};

const STATUS_TEXT = { ready: "", out: "Out", away: "Reconnecting…" } as const;

/** A ghost avatar in the player's color. It floats, unless the person asked for less motion. */
export function PlayerGhost({ name, color, status = "ready" }: PlayerGhostProps) {
  const style = { "--ghost-color": color } as CSSProperties;
  const text = STATUS_TEXT[status];
  return (
    <figure
      className={`hk-ghost hk-ghost--${status}`}
      style={{ ...style, margin: 0 }}
      aria-label={text ? `${name}, ${text}` : name}
    >
      <svg className="hk-ghost__body" viewBox="0 0 90 100" role="img" aria-hidden="true">
        <path
          d="M10 95 V45 C10 20 28 5 45 5 C62 5 80 20 80 45 V95 L68 83 L56 95 L45 83 L34 95 L22 83 Z"
          fill={color}
          stroke="var(--hk-color-ink)"
          strokeOpacity="0.35"
          strokeWidth="2"
        />
        <circle cx="33" cy="42" r="6" fill="var(--hk-color-ink)" />
        <circle cx="57" cy="42" r="6" fill="var(--hk-color-ink)" />
        <ellipse cx="45" cy="62" rx="7" ry="9" fill="var(--hk-color-ink)" />
      </svg>
      <figcaption className="hk-ghost__name">{name}</figcaption>
      {text ? <span className="hk-ghost__status">{text}</span> : null}
    </figure>
  );
}
