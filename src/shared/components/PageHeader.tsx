import type { ReactNode } from 'react';
type Props = { title: string; description?: string; action?: ReactNode };
export function PageHeader({ title, description, action }: Props) {
  return <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">{title}</h1>{description && <p className="mt-2 text-sm text-slate-500">{description}</p>}</div>{action}</div>;
}