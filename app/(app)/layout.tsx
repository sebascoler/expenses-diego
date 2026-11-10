import Link from "next/link";
import { Settings, LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { BottomNav, DesktopNav } from "@/components/app/nav";
import { WelcomeTour } from "@/components/app/welcome-tour";
import { requireSession } from "@/lib/auth/session";
import { needsTour } from "@/lib/auth/users";
import { getDb } from "@/lib/db/client";
import { t } from "@/lib/i18n/es";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Verificación real de la sesión en el servidor (el proxy solo mira si hay cookie).
  const session = await requireSession();
  const showTour = await needsTour(await getDb(), session.userId);
  return (
    <div className="min-h-dvh pb-20 md:pb-8">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">€</span>
            <span>{t.app.name}</span>
          </Link>
          <DesktopNav />
          <div className="flex items-center gap-1">
            <Link href="/ajustes" data-tour="nav-ajustes" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted" aria-label={t.nav.ajustes} title={t.nav.ajustes}>
              <Settings className="h-5 w-5" aria-hidden />
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted" aria-label={t.nav.salir} title={t.nav.salir}>
                <LogOut className="h-5 w-5" aria-hidden />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
      <BottomNav />
      <WelcomeTour show={showTour} />
    </div>
  );
}
