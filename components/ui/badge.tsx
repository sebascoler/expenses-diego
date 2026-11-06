import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-900",
  danger: "bg-red-100 text-red-800",
  info: "bg-teal-100 text-teal-900",
};

export function Badge({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}
