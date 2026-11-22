import type { HTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  title?: ReactNode;
  /** Heading level for the title. Default 2. */
  level?: 1 | 2 | 3;
};

/** A panel. With a title it becomes a labelled region. */
export function Card({ title, level = 2, children, className, ...rest }: CardProps) {
  const id = useId();
  const Heading = `h${level}` as const;
  return (
    <section
      className={["hk-card", className ?? ""].filter(Boolean).join(" ")}
      aria-labelledby={title ? id : undefined}
      {...rest}
    >
      {title ? <Heading id={id}>{title}</Heading> : null}
      {children}
    </section>
  );
}
