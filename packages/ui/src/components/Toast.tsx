import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";

export type ToastKind = "info" | "success" | "warning" | "danger";
export type ToastItem = { id: number; message: string; kind: ToastKind };

/** Keeps a list of toasts. Each goes away after `ms` (default 5 s) or when dismissed. */
export function useToasts(ms = 5000) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, message, kind }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms),
      );
      return id;
    },
    [dismiss, ms],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach(clearTimeout);
  }, []);

  return { toasts, push, dismiss };
}

export type ToastRegionProps = { toasts: readonly ToastItem[]; onDismiss: (id: number) => void };

/** Shows toasts. A polite live region, so screen readers announce each new one. */
export function ToastRegion({ toasts, onDismiss }: ToastRegionProps) {
  return (
    <div className="hk-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`hk-toast hk-toast--${t.kind}`}>
          <span>{t.message}</span>
          <Button variant="secondary" aria-label={`Dismiss: ${t.message}`} onClick={() => onDismiss(t.id)}>
            ✕
          </Button>
        </div>
      ))}
    </div>
  );
}
