"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, type ButtonVariant } from "./Button";
import { Dialog } from "./Dialog";

/**
 * App-wide feedback: short toasts ("Saved") and confirmation questions
 * ("Delete this block?"). Use through the `useFeedback()` hook.
 */

type ToastKind = "info" | "success" | "error";
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

export interface Choice<T extends string = string> {
  value: T;
  label: string;
  variant?: ButtonVariant;
}

interface Question {
  title: string;
  body?: ReactNode;
  choices: Choice[];
  resolve: (value: string | null) => void;
}

interface FeedbackApi {
  toast: (message: string, kind?: ToastKind) => void;
  /** Report a failed action; accepts whatever was thrown. */
  toastError: (error: unknown, fallback?: string) => void;
  /** Ask a yes/no question. Resolves true when confirmed. */
  confirm: (opts: { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  /** Ask a question with several answers. Resolves to the chosen value, or null if dismissed. */
  choose: <T extends string>(opts: { title: string; body?: ReactNode; choices: Choice<T>[] }) => Promise<T | null>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function errorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    // Database permission errors are not helpful to read; translate the common one.
    if (/row-level security|permission denied/i.test(error.message)) return "You are not allowed to do that.";
    return error.message;
  }
  return fallback;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [question, setQuestion] = useState<Question | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message, kind }]);
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === "error" ? 6000 : 3500);
  }, []);

  const api = useMemo<FeedbackApi>(
    () => ({
      toast,
      toastError: (error, fallback) => toast(errorMessage(error, fallback), "error"),
      confirm: ({ title, body, confirmLabel = "Yes", danger = false }) =>
        new Promise<boolean>((resolve) => {
          setQuestion({
            title,
            body,
            choices: [
              { value: "no", label: "Cancel", variant: "dark" },
              { value: "yes", label: confirmLabel, variant: danger ? "danger" : "free" },
            ],
            resolve: (value) => resolve(value === "yes"),
          });
        }),
      choose: ({ title, body, choices }) =>
        new Promise((resolve) => {
          setQuestion({ title, body, choices, resolve: (value) => resolve(value as never) });
        }),
    }),
    [toast],
  );

  const answer = (value: string | null) => {
    question?.resolve(value);
    setQuestion(null);
  };

  return (
    <FeedbackContext value={api}>
      {children}

      <Dialog
        open={question !== null}
        onClose={() => answer(null)}
        title={question?.title ?? ""}
        footer={question?.choices.map((choice) => (
          <Button key={choice.value} variant={choice.variant ?? "stone"} onClick={() => answer(choice.value)}>
            {choice.label}
          </Button>
        ))}
      >
        {question?.body && <div className="text-ink-dim">{question.body}</div>}
      </Dialog>

      <div
        className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`panel pointer-events-auto max-w-md animate-pop px-4 py-2 text-center ${
              t.kind === "error" ? "!border-danger text-danger" : t.kind === "success" ? "!border-join text-join" : "text-ink"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </FeedbackContext>
  );
}

export function useFeedback(): FeedbackApi {
  const api = useContext(FeedbackContext);
  if (!api) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return api;
}
