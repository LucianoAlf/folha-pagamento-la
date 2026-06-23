import React from 'react';
import { Card } from '../UI';
import { cn } from '../CollaboratorComponents';

export const RH_KPI_GRID_CLASS = 'grid grid-cols-2 gap-3 sm:gap-4';

type RhKpiCardProps = {
  label: React.ReactNode;
  value: React.ReactNode;
  subvalue?: React.ReactNode;
  valueClassName?: string;
  className?: string;
};

export const RhKpiCard: React.FC<RhKpiCardProps> = ({
  label,
  value,
  subvalue,
  valueClassName = 'text-primary',
  className,
}) => (
  <Card className={cn('min-h-[108px] p-3.5 sm:min-h-0 sm:p-5 border border-line-strong/50', className)}>
    <div className="text-[9px] sm:text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.2em] text-muted font-black leading-tight">
      {label}
    </div>
    <div className={cn('mt-2 text-2xl sm:text-3xl font-black leading-none', valueClassName)}>
      {value}
    </div>
    {subvalue ? (
      <div className="mt-2 text-[11px] sm:text-xs font-bold text-muted leading-tight line-clamp-2">
        {subvalue}
      </div>
    ) : null}
  </Card>
);
