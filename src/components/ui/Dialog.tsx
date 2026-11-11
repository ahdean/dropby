"use client";

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";

/**
 * A modal built on the browser's native <dialog>: focus stays inside it, Esc
 * closes it and the page behind is inert. On phones it is a bottom sheet; on
 * larger screens a centred panel.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Next.js keeps the previous page alive (hidden) after a navigation so it can
  // be restored instantly. A modal left open there would still block the whole
  // screen, so close it, and tell the owner, whenever this page is hidden.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useLayoutEffect(() => {
    const dialog = ref.current;
    return () => {
      if (dialog?.open) {
        dialog.close();
        onCloseRef.current();
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => {
        // Esc: let the owner decide (it may want to confirm discarding changes).
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (event.target === ref.current) onClose();
      }}
      className={`panel fixed inset-x-0 bottom-0 top-auto m-0 w-full overflow-hidden p-0 animate-rise sm:inset-0 sm:m-auto sm:h-fit sm:animate-pop ${
        wide ? "sm:w-[min(720px,94vw)]" : "sm:w-[min(540px,94vw)]"
      }`}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col sm:max-h-[88dvh]">
          <header className="flex items-center justify-between gap-3 border-b-2 border-black bg-panel-2 px-4 py-2">
            <h2 id={titleId} className="text-[11px] text-ink">
              {title}
            </h2>
            <IconButton icon="x" label="Close" onClick={onClose} className="!min-h-[36px] !w-9" size={14} />
          </header>
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
          {footer && (
            <footer className="flex flex-wrap items-center justify-end gap-3 border-t-2 border-black bg-panel-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
