"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Upload, ListChecks, Plane, FileText } from "lucide-react";
import { t } from "@/lib/i18n/es";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: t.nav.inicio, icon: Home },
  { href: "/importar", label: t.nav.importar, icon: Upload },
  { href: "/revision", label: t.nav.revision, icon: ListChecks },
  { href: "/viajes", label: t.nav.viajes, icon: Plane },
  { href: "/rendiciones", label: t.nav.rendiciones, icon: FileText },
];

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
}

/** Barra inferior en móvil. Va fuera del header (el backdrop-filter rompe el position: fixed). */
export function BottomNav() {
  const active = useActive();
  return (
    <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-5">
          {items.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active(href) ? "text-primary" : "text-muted-foreground")} aria-current={active(href) ? "page" : undefined}>
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
    </nav>
  );
}

export function DesktopNav() {
  const active = useActive();
  return (
    <nav aria-label="Principal escritorio" className="hidden md:block">
        <ul className="flex gap-1">
          {items.map(({ href, label }) => (
            <li key={href}>
              <Link href={href} className={cn("rounded-lg px-3 py-2 text-sm", active(href) ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted")}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
    </nav>
  );
}
