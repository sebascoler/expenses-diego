import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const field = "min-h-11 w-full rounded-lg border border-border bg-card px-3 text-base sm:text-sm focus:border-primary";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, className)} {...props} />;
}
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "pr-8", className)} {...props} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "py-2", className)} {...props} />;
}
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-sm font-medium text-muted-foreground", className)} {...props} />;
}
