"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { t } from "@/lib/i18n/es";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div>
        <Label htmlFor="username">{t.login.username}</Label>
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required />
      </div>
      <div>
        <Label htmlFor="password">{t.login.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state?.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Entrando…" : t.login.submit}
      </Button>
    </form>
  );
}
