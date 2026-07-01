import React from 'react';
import { Sparkles } from 'lucide-react';
import { Badge, Tooltip } from './UI';
import { cn } from './CollaboratorComponents';

type MariaActionBadgeProps = {
  tooltip?: React.ReactNode;
  className?: string;
};

export const MariaActionBadge: React.FC<MariaActionBadgeProps> = ({
  tooltip = 'Acao registrada pela Maria via WhatsApp.',
  className = '',
}) => (
  <Tooltip content={tooltip}>
    <span className={cn('inline-flex', className)}>
      <Badge
        variant="purple"
        className="border-accent/40 bg-accent/15 text-accent font-black"
      >
        <Sparkles className="w-3 h-3" />
        Maria
      </Badge>
    </span>
  </Tooltip>
);
