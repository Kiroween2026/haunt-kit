import { useEffect, useId, useRef, type ReactNode } from "react";

export type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ReactNode;
  /** Buttons at the bottom. Put the main action last. */
  actions?: ReactNode;
};

/**
 * A modal dialog built on the native <dialog>. The browser traps focus, makes the page behind it
 * inert and closes on Escape. Focus returns to the button that opened it.
 */
export function Modal({ open, title, onClose, children, actions }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="hk-modal" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      <h2 id={titleId}>{title}</h2>
      {children}
      {actions ? <div className="hk-modal__actions">{actions}</div> : null}
    </dialog>
  );
}
