"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { completeTourAction } from "@/app/actions/users";
import { Button } from "@/components/ui/button";

interface Step {
  /** Valor de `data-tour` del elemento a resaltar. Sin target, el paso se muestra centrado. */
  target?: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: Step[] = [
  {
    title: "¡Bienvenido! 👋",
    body: "En un minuto te muestro cómo se arma la rendición de gastos. Podés saltear el tutorial cuando quieras y volver a verlo desde Ajustes.",
  },
  {
    target: "home-stats",
    title: "Tu resumen",
    body: "Acá ves cuántos gastos quedan por revisar, cuántos son de empresa y personales, y el total de empresa que todavía no rendiste. El botón verde te lleva al próximo paso.",
  },
  {
    target: "home-sources",
    title: "Qué archivos bajar",
    body: "Muestra la fecha del último movimiento cargado de Wise y de BBVA, y desde qué fecha tenés que bajar cada archivo.",
  },
  {
    target: "nav-importar",
    title: "1. Importar",
    body: "Subí el CSV de Wise y el Excel de BBVA, juntos o por separado. Si un archivo se solapa con otro, no se duplica nada. Los archivos no se guardan.",
  },
  {
    target: "nav-revision",
    title: "2. Revisar",
    body: "Marcá cada gasto como Aplica (empresa) o No aplica (personal), y elegí viaje y categoría. Todo se guarda solo, aunque la conexión sea mala.",
  },
  {
    target: "nav-viajes",
    title: "3. Viajes",
    body: "Creá cada viaje con sus fechas: los gastos de esos días se asignan solos. Ahí también cargás los km de la camioneta y los peajes.",
  },
  {
    target: "nav-rendiciones",
    title: "4. Rendir",
    body: "Elegí el período, revisá el total y descargá el PDF y el Excel. Copiá el mail y el importe para la factura, y cerrá la rendición para que esos gastos no se rindan dos veces.",
  },
  {
    target: "nav-ajustes",
    title: "Ajustes",
    body: "Tarjetas de BBVA, reglas de clasificación, usuarios, contraseña y el botón para volver a ver este tutorial.",
  },
  {
    title: "¡Listo!",
    body: "El día 20 de cada mes te llega un mail recordándote qué bajar. Para empezar, andá a Importar y subí tus archivos.",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

/** Entre varios elementos con el mismo data-tour (nav de móvil y de escritorio), el que está visible. */
function findVisible(target: string): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  return els.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

const PAD = 6;
const GAP = 12;

/**
 * Tutorial de bienvenida con tooltips sobre la pantalla de Inicio. Se muestra la primera vez que
 * entra cada usuario; al terminar o saltearlo queda marcado en la base y no vuelve a aparecer.
 */
export function WelcomeTour({ show }: { show: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(show);
  const [prevShow, setPrevShow] = useState(show);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const nextRef = useRef<HTMLButtonElement>(null);

  // Si el servidor vuelve a pedir el tutorial ("Ver el tutorial de nuevo"), se reabre desde el principio.
  if (prevShow !== show) {
    setPrevShow(show);
    if (show) {
      setOpen(true);
      setIndex(0);
    }
  }

  const active = open && pathname === "/";
  const step = TOUR_STEPS[index];

  const measure = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    if (!step?.target) return setRect(null);
    const el = findVisible(step.target);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useLayoutEffect(() => {
    if (!active) return;
    const el = step?.target ? findVisible(step.target) : null;
    el?.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
    // Se mide en el próximo frame, cuando el scroll ya se aplicó.
    const id = requestAnimationFrame(() => {
      measure();
      nextRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [active, step, measure]);

  useEffect(() => {
    if (!active) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, measure]);

  const finish = useCallback(() => {
    setOpen(false);
    void completeTourAction().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, TOUR_STEPS.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, finish]);

  if (!active || !step || viewport.w === 0) return null;

  const isLast = index === TOUR_STEPS.length - 1;
  const width = Math.min(340, viewport.w - 32);
  const tooltipStyle: React.CSSProperties = { width };
  if (rect) {
    const center = rect.left + rect.width / 2;
    tooltipStyle.left = Math.max(16, Math.min(center - width / 2, viewport.w - width - 16));
    const below = rect.top + rect.height + PAD + GAP;
    if (viewport.h - below >= 220 || rect.top < viewport.h / 2) tooltipStyle.top = Math.min(below, viewport.h - 220);
    else tooltipStyle.bottom = viewport.h - rect.top + PAD + GAP;
  } else {
    tooltipStyle.left = (viewport.w - width) / 2;
    tooltipStyle.top = Math.max(16, viewport.h / 2 - 120);
  }

  return createPortal(
    <div className="fixed inset-0 z-50" data-testid="welcome-tour">
      {rect ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl ring-4 ring-teal-300 transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.6)",
          }}
        />
      ) : (
        <div aria-hidden className="fixed inset-0 bg-slate-900/60" />
      )}
      <div role="dialog" aria-modal="true" aria-labelledby="tour-title" className="fixed rounded-xl bg-card p-4 shadow-2xl" style={tooltipStyle}>
        <div className="mb-1 text-xs text-muted-foreground">
          {index + 1} de {TOUR_STEPS.length}
        </div>
        <h2 id="tour-title" className="mb-1 text-base font-semibold">
          {step.title}
        </h2>
        <p className="text-sm text-muted-foreground">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          {!isLast ? (
            <Button variant="ghost" size="sm" onClick={finish}>
              Saltar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {index > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setIndex(index - 1)}>
                Atrás
              </Button>
            ) : null}
            <Button ref={nextRef} size="sm" onClick={() => (isLast ? finish() : setIndex(index + 1))}>
              {isLast ? "Terminar" : "Siguiente"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
