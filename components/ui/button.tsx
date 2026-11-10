import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-teal-800",
        outline: "border border-border bg-card hover:bg-muted",
        ghost: "hover:bg-muted",
        danger: "bg-danger text-white hover:bg-red-800",
        success: "bg-success text-white hover:bg-green-800",
      },
      size: { default: "", sm: "min-h-9 px-3 text-xs", lg: "min-h-12 px-6 text-base", icon: "min-h-11 w-11 px-0" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({ className, variant, size, ...props }: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
