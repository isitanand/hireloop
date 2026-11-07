import type { ReactNode } from "react";

export default function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel p-12 text-center">
      <div className="font-display text-text font-semibold text-base">{title}</div>
      {body && <div className="text-muted text-sm mt-2 max-w-md mx-auto leading-relaxed">{body}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
