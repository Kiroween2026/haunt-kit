import type { ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  size?: "normal" | "large";
};

/** A button at least 44 × 44 px. Defaults to type="button" so it never submits a form by accident. */
export function Button({
  variant = "primary",
  size = "normal",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "hk-button",
    `hk-button--${variant}`,
    size === "large" ? "hk-button--large" : "",
    className ?? "",
  ];
  return <button type={type} className={classes.filter(Boolean).join(" ")} {...rest} />;
}
