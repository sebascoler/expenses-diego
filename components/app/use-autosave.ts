"use client";

import { useCallback, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "retrying" | "error";

/**
 * Autosave con guardado optimista y reintentos (RF-44): el cambio se aplica en pantalla al instante,
 * y el guardado se reintenta con backoff si la conexión falla (wifi del avión).
 */
export function useAutosave() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pending = useRef(0);

  const save = useCallback(async <T,>(fn: () => Promise<T>, onError?: () => void): Promise<T | undefined> => {
    pending.current++;
    setStatus("saving");
    const delays = [0, 1000, 3000, 8000, 15000];
    for (let i = 0; i < delays.length; i++) {
      if (delays[i]) {
        setStatus("retrying");
        await new Promise((r) => setTimeout(r, delays[i]));
      }
      try {
        const result = await fn();
        pending.current--;
        setStatus(pending.current > 0 ? "saving" : "saved");
        return result;
      } catch {
        // reintento
      }
    }
    pending.current--;
    setStatus("error");
    onError?.();
    return undefined;
  }, []);

  return { status, save };
}
