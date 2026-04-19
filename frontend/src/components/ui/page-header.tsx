import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions, className, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 border-b border-[var(--border)] px-6 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-tight truncate">{title}</h1>
        {subtitle && (
          <div className="mt-1 text-[13.5px] text-[var(--muted-foreground)]">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
