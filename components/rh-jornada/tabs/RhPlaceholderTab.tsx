import React from 'react';
import { BellRing, FileSearch } from 'lucide-react';
import { Badge, Card } from '../../UI';

export const RhPlaceholderTab: React.FC<{
  title: string;
  subtitle: string;
  highlights: string[];
  foundation: string[];
}> = ({ title, subtitle, highlights, foundation }) => {
  return (
    <div className="space-y-6">
      <Card className="p-6 border border-strong/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-primary text-2xl font-black tracking-tight">{title}</h2>
            <p className="text-sm text-muted mt-1">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="success">Fase 1 entregue</Badge>
            <Badge variant="warning">Próxima implementação</Badge>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_.8fr] gap-6">
        <Card className="p-6 border border-strong/50">
          <div className="flex items-center gap-2 mb-4">
            <BellRing className="w-4 h-4 text-info" />
            <h3 className="text-primary text-base font-black">Escopo desta aba</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {highlights.map((item) => (
              <div key={item} className="rounded-2xl border border-base bg-surface/40 p-4">
                <div className="text-sm font-bold text-secondary">{item}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 border border-strong/50">
          <div className="flex items-center gap-2 mb-4">
            <FileSearch className="w-4 h-4 text-warning" />
            <h3 className="text-primary text-base font-black">Fundação pronta</h3>
          </div>
          <div className="space-y-3">
            {foundation.map((item) => (
              <div key={item} className="rounded-2xl border border-base bg-surface/40 p-4 text-sm text-secondary">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
