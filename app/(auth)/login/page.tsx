import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { t } from "@/lib/i18n/es";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-white">€</div>
        <h1 className="text-2xl font-semibold">{t.app.name}</h1>
        <p className="text-sm text-muted-foreground">{t.app.tagline}</p>
      </div>
      <LoginForm />
    </main>
  );
}
