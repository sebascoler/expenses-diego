import "server-only";
import { Resend } from "resend";
import { env } from "../env";

export function isMailConfigured(): boolean {
  return Boolean(env.resendApiKey);
}

/** Envía con Resend; sin RESEND_API_KEY solo loguea el asunto y la cantidad de destinatarios (§16.5). */
export async function sendMail(msg: { to: string[]; subject: string; text: string; html?: string }): Promise<{ sent: boolean; reason?: string }> {
  const to = msg.to.filter(Boolean);
  if (to.length === 0) return { sent: false, reason: "Sin destinatario configurado" };
  if (!env.resendApiKey) {
    console.log(`[mail] (no configurado) asunto="${msg.subject}" destinatarios=${to.length}`);
    return { sent: false, reason: "Mail no configurado" };
  }
  const resend = new Resend(env.resendApiKey);
  const { error } = await resend.emails.send({ from: env.mailFrom, to, subject: msg.subject, text: msg.text, html: msg.html });
  if (error) {
    console.error("[mail] Resend devolvió un error:", error.name);
    return { sent: false, reason: error.message };
  }
  return { sent: true };
}
