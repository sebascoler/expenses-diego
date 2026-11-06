"use client";

import { useActionState, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  changePasswordAction,
  deleteRuleAction,
  saveCardsAction,
  saveCategoryAction,
  saveRuleAction,
  saveSettingsAction,
  testReminderAction,
  toggleCategoryAction,
  toggleRuleAction,
  wipeDataAction,
} from "@/app/actions/settings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import type { Settings } from "@/lib/settings";

type State = { error?: string; ok?: string } | undefined;

function Msg({ state }: { state: State }) {
  if (!state) return null;
  return state.error ? <p className="text-sm text-danger">{state.error}</p> : state.ok ? <p className="text-sm text-success">{state.ok}</p> : null;
}

export function GeneralForm({ s }: { s: Settings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="s-km">Tarifa por km (EUR)</Label>
        <Input id="s-km" name="kmRateEur" inputMode="decimal" defaultValue={s.kmRateEur.replace(".", ",")} />
      </div>
      <div>
        <Label htmlFor="s-sur">Recargo BBVA (%)</Label>
        <Input id="s-sur" name="bbvaSurchargePct" inputMode="decimal" defaultValue={s.bbvaSurchargePct.replace(".", ",")} />
      </div>
      <label className="flex min-h-11 items-center gap-2 sm:col-span-2">
        <input type="checkbox" name="addWiseFee" className="h-5 w-5" defaultChecked={s.addWiseFee} /> Sumar el fee de Wise al monto reembolsable
      </label>
      <div>
        <Label htmlFor="s-name">Nombre para informes</Label>
        <Input id="s-name" name="reportName" defaultValue={s.reportName} />
      </div>
      <div>
        <Label htmlFor="s-tz">Zona horaria</Label>
        <Input id="s-tz" name="timeZone" defaultValue={s.timeZone} />
      </div>
      <div>
        <Label htmlFor="s-day">Día del recordatorio</Label>
        <Input id="s-day" name="reminderDay" type="number" min={1} max={28} defaultValue={s.reminderDay} />
      </div>
      <div>
        <Label htmlFor="s-hour">Hora del recordatorio</Label>
        <Input id="s-hour" name="reminderHour" type="number" min={0} max={23} defaultValue={s.reminderHour} />
      </div>
      <label className="flex min-h-11 items-center gap-2 sm:col-span-2">
        <input type="checkbox" name="reminderSecondNotice" className="h-5 w-5" defaultChecked={s.reminderSecondNotice} /> Segundo aviso a los 3 días si no importé nada
      </label>
      <div>
        <Label htmlFor="s-rem">Email del recordatorio</Label>
        <Input id="s-rem" name="reminderEmail" type="email" defaultValue={s.reminderEmail} />
      </div>
      <div>
        <Label htmlFor="s-rec">Email del destinatario de la rendición</Label>
        <Input id="s-rec" name="reportRecipientEmail" type="email" defaultValue={s.reportRecipientEmail} />
      </div>
      <div className="sm:col-span-2">
        <Msg state={state} />
      </div>
      <Button type="submit" disabled={pending} className="sm:col-span-2">
        Guardar ajustes
      </Button>
    </form>
  );
}

export function TestReminderButton() {
  const [state, setState] = useState<State>();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <Button variant="outline" disabled={pending} onClick={() => start(async () => setState(await testReminderAction()))}>
        Enviar recordatorio de prueba
      </Button>
      <Msg state={state} />
    </div>
  );
}

export function CardsForm({ cards }: { cards: Settings["bbvaCards"] }) {
  const [list, setList] = useState(cards);
  const [last4, setLast4] = useState("");
  const [type, setType] = useState<"fisica" | "virtual">("virtual");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const persist = (next: Settings["bbvaCards"]) =>
    start(async () => {
      setList(next);
      await saveCardsAction({ cards: next });
      setMsg("Tarjetas guardadas.");
    });
  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm">
        {list.map((c) => (
          <li key={c.last4} className="flex items-center justify-between rounded-lg bg-muted p-2">
            <span>
              ····{c.last4} · {c.type === "virtual" ? "Virtual (empresa)" : "Física (personal)"}
            </span>
            <button type="button" aria-label="Quitar tarjeta" className="flex h-11 w-11 items-center justify-center" onClick={() => persist(list.filter((x) => x.last4 !== c.last4))}>
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </li>
        ))}
        {list.length === 0 ? <li className="text-muted-foreground">Sin tarjetas cargadas: la regla de tarjeta no se aplica.</li> : null}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Input aria-label="Últimos 4 dígitos" placeholder="Últimos 4" inputMode="numeric" maxLength={4} className="w-28" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))} />
        <Select aria-label="Tipo de tarjeta" className="w-auto" value={type} onChange={(e) => setType(e.target.value as "fisica" | "virtual")}>
          <option value="virtual">Virtual</option>
          <option value="fisica">Física</option>
        </Select>
        <Button
          variant="outline"
          disabled={pending || last4.length !== 4}
          onClick={() => {
            persist([...list.filter((x) => x.last4 !== last4), { last4, type }]);
            setLast4("");
          }}
        >
          Agregar tarjeta
        </Button>
      </div>
      {msg ? <p className="text-sm text-success">{msg}</p> : null}
    </div>
  );
}

type RuleRow = { id: string; matchType: "merchant_equals" | "merchant_contains" | "regex"; pattern: string; applies: boolean | null; categoryId: string | null; createdFrom: "manual" | "aprendida"; hits: number; active: boolean };

const MATCH_LABEL = { merchant_equals: "es igual a", merchant_contains: "contiene", regex: "regex" };

export function RulesForm({ rules, categories }: { rules: RuleRow[]; categories: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveRuleAction, undefined);
  const [, start] = useTransition();
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm" data-testid="rules-list">
        {rules.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2">
            <span className={r.active ? "" : "opacity-50"}>
              Comercio {MATCH_LABEL[r.matchType]} <strong>{r.pattern}</strong> → {r.applies === null ? "" : r.applies ? "empresa" : "personal"}
              {r.categoryId ? ` · ${catName.get(r.categoryId) ?? ""}` : ""} {r.createdFrom === "aprendida" ? <Badge tone="info">aprendida</Badge> : null}{" "}
              <span className="text-xs text-muted-foreground">({r.hits} usos)</span>
            </span>
            <span className="flex shrink-0 items-center">
              <label className="flex min-h-11 items-center gap-1 text-xs">
                <input type="checkbox" className="h-5 w-5" checked={r.active} onChange={(e) => start(() => toggleRuleAction(r.id, e.target.checked))} /> activa
              </label>
              <button type="button" aria-label="Borrar regla" className="flex h-11 w-11 items-center justify-center" onClick={() => start(() => deleteRuleAction(r.id))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </span>
          </li>
        ))}
        {rules.length === 0 ? <li className="text-muted-foreground">Todavía no hay reglas.</li> : null}
      </ul>
      <form action={action} className="grid gap-2 sm:grid-cols-4">
        <Select name="matchType" aria-label="Tipo de coincidencia" defaultValue="merchant_contains">
          <option value="merchant_contains">Contiene</option>
          <option value="merchant_equals">Es igual a</option>
          <option value="regex">Regex</option>
        </Select>
        <Input name="pattern" aria-label="Comercio" placeholder="NETFLIX" required />
        <Select name="applies" aria-label="Decisión" defaultValue="false">
          <option value="true">Empresa</option>
          <option value="false">Personal</option>
          <option value="">Solo categoría</option>
        </Select>
        <Select name="categoryId" aria-label="Categoría" defaultValue="">
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="sm:col-span-4">
          <Msg state={state} />
        </div>
        <Button type="submit" variant="outline" disabled={pending} className="sm:col-span-4">
          Agregar regla
        </Button>
      </form>
    </div>
  );
}

export function CategoriesForm({ categories }: { categories: { id: string; name: string; active: boolean }[] }) {
  const [state, action, pending] = useActionState(saveCategoryAction, undefined);
  const [, start] = useTransition();
  return (
    <div className="space-y-3">
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-lg bg-muted px-2">
            <span className={c.active ? "" : "line-through opacity-50"}>{c.name}</span>
            <label className="flex min-h-11 items-center gap-1 text-xs">
              <input type="checkbox" className="h-5 w-5" checked={c.active} onChange={(e) => start(() => toggleCategoryAction(c.id, e.target.checked))} /> activa
            </label>
          </li>
        ))}
      </ul>
      <form action={action} className="flex gap-2">
        <Input name="name" aria-label="Nueva categoría" placeholder="Nueva categoría" required />
        <Button type="submit" variant="outline" disabled={pending}>
          Agregar
        </Button>
      </form>
      <Msg state={state} />
    </div>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <div>
        <Label htmlFor="pw-current">Actual</Label>
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <Label htmlFor="pw-next">Nueva (mín. 12)</Label>
        <Input id="pw-next" name="next" type="password" autoComplete="new-password" required />
      </div>
      <div>
        <Label htmlFor="pw-confirm">Repetir nueva</Label>
        <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <div className="sm:col-span-3">
        <Msg state={state} />
      </div>
      <Button type="submit" disabled={pending} className="sm:col-span-3">
        Cambiar contraseña
      </Button>
    </form>
  );
}

export function WipeForm() {
  const [state, action, pending] = useActionState(wipeDataAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" data-testid="wipe-form">
      <div>
        <Label htmlFor="wipe-pw">Tu contraseña</Label>
        <Input id="wipe-pw" name="password" type="password" autoComplete="current-password" required />
      </div>
      <div>
        <Label htmlFor="wipe-confirm">Escribí BORRAR</Label>
        <Input id="wipe-confirm" name="confirm" autoCapitalize="characters" required />
      </div>
      <div className="sm:col-span-2">
        <Msg state={state} />
      </div>
      <Button type="submit" variant="danger" disabled={pending} className="sm:col-span-2">
        Borrar todos los datos
      </Button>
    </form>
  );
}
