"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Mesmo ponto de quebra do `lg` do Tailwind (barra lateral visível). */
export const CONSULTA_DESKTOP = "(min-width: 64rem)";

/** true quando a consulta de mídia casa. No servidor (e antes de hidratar), false. */
export function useMedia(consulta: string): boolean {
  const assinar = useCallback(
    (aoMudar: () => void) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", aoMudar);
      return () => m.removeEventListener("change", aoMudar);
    },
    [consulta],
  );
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
