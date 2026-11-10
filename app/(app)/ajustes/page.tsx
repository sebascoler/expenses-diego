import { asc, desc } from "drizzle-orm";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/users";
import { isAiEnabled } from "@/lib/classify/ai";
import { getDb } from "@/lib/db/client";
import { categories, rules } from "@/lib/db/schema";
import { isMailConfigured } from "@/lib/mail/send";
import { getSettings } from "@/lib/settings";
import { CardsForm, CategoriesForm, GeneralForm, PasswordForm, RestartTourButton, RulesForm, TestReminderButton, UsersForm, WipeForm } from "./forms";

export default async function SettingsPage() {
  const session = await requireSession();
  const db = await getDb();
  const [s, cats, ruleList, userList] = await Promise.all([
    getSettings(db),
    db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select().from(rules).orderBy(desc(rules.createdAt)),
    listUsers(db),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ajustes</h1>

      <Card className="flex flex-wrap gap-2 text-sm">
        <Badge tone={isMailConfigured() ? "success" : "warning"}>{isMailConfigured() ? "Mail configurado" : "Mail no configurado"}</Badge>
        <Badge tone={isAiEnabled() ? "success" : "neutral"}>{isAiEnabled() ? "IA activada" : "IA no configurada (los gastos quedan sin clasificar)"}</Badge>
      </Card>

      <Card>
        <CardTitle className="mb-3">General</CardTitle>
        <GeneralForm s={s} />
        <div className="mt-3">
          <TestReminderButton />
        </div>
      </Card>

      <Card>
        <CardTitle className="mb-1">Tarjetas BBVA</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">La tarjeta virtual sugiere &quot;empresa&quot; y la física &quot;personal&quot; (con confianza media).</p>
        <CardsForm cards={s.bbvaCards} />
      </Card>

      <Card>
        <CardTitle className="mb-1">Reglas de clasificación</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">Se aplican antes que la tarjeta y la IA. Las reglas aprendidas se crean cuando corregís dos veces el mismo comercio.</p>
        <RulesForm rules={ruleList.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))} categories={cats.filter((c) => c.active)} />
      </Card>

      <Card>
        <CardTitle className="mb-3">Categorías</CardTitle>
        <CategoriesForm categories={cats} />
      </Card>

      <Card>
        <CardTitle className="mb-3">Cambiar contraseña</CardTitle>
        <PasswordForm />
      </Card>

      <Card>
        <CardTitle className="mb-1">Usuarios</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">Todos los usuarios ven y editan los mismos gastos, viajes y rendiciones. Cada uno entra con su usuario y su contraseña.</p>
        <UsersForm users={userList.map((u) => ({ id: u.id, username: u.username, createdAt: u.createdAt.toISOString() }))} currentUserId={session.userId} />
      </Card>

      <Card className="space-y-2">
        <CardTitle>Tutorial</CardTitle>
        <p className="text-sm text-muted-foreground">El recorrido guiado de la pantalla de Inicio, el mismo que aparece la primera vez que entrás.</p>
        <RestartTourButton />
      </Card>

      <Card className="space-y-2">
        <CardTitle>Mis datos</CardTitle>
        <a href="/api/export" className="inline-flex min-h-11 items-center text-primary underline" download>
          Exportar todos mis datos (JSON)
        </a>
      </Card>

      <Card className="border-red-300">
        <CardTitle className="mb-1 text-danger">Borrar todos los datos</CardTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          Elimina movimientos, importaciones, viajes, km, peajes, rendiciones, reglas, tasas, sesiones y <strong>todos los usuarios</strong>, y restaura los ajustes por defecto. No se puede deshacer.
        </p>
        <WipeForm />
      </Card>
    </div>
  );
}
