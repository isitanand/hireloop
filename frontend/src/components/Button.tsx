import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold px-4 py-2 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed";

const variants: Record<Variant, string> = {
  primary: "bg-text text-bg hover:opacity-90 shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset]",
  secondary: "bg-surface border border-line text-text hover:bg-surface-hover",
  ghost: "text-muted hover:text-text hover:bg-surface",
  danger: "bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20",
  "danger-solid": "bg-bad text-white hover:bg-bad/90 shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset]",
};

export default function Button({ variant = "primary", loading, className, children, disabled, ...rest }: Props) {
  return (
    <button className={clsx(base, variants[variant], className)} disabled={disabled || loading} {...rest}>
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
