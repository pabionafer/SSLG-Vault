"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastValue {
  push: (kind: ToastKind, message: string) => void;
}

const ToastContext = createContext<ToastValue>({ push: () => {} });

export function useToast(): ToastValue {
  return useContext(ToastContext);
}

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-ok bg-ok-tint text-ok",
  error: "border-danger bg-danger-tint text-danger",
  info: "border-line bg-surface text-ink",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      window.setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="no-print pointer-events-none fixed right-4 top-4 z-50 flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-md border px-3 py-2 text-sm font-medium shadow-sm ${KIND_STYLES[t.kind]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span>{t.message}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => remove(t.id)}
                className="text-xs opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
