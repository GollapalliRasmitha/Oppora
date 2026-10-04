import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-page font-extrabold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-body text-ink-2">{subtitle}</p>
      </div>
      {actions}
    </div>
  );
}
