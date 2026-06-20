import React from 'react';
import { Card } from './UI';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid 
} from 'recharts';
import { formatCurrency } from '../services/api';

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subvalue?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
  variant?: 'default' | 'cyan' | 'emerald' | 'violet' | 'amber' | 'rose';
}

export const KPICard: React.FC<KPICardProps> = ({ icon: Icon, label, value, subvalue, trend, trendValue, variant = 'default' }) => {
  const colorMap = {
    default: 'from-slate-500 to-slate-600',
    cyan: 'from-cyan-500 to-cyan-600',
    emerald: 'from-emerald-500 to-emerald-600',
    violet: 'from-violet-500 to-violet-600',
    amber: 'from-amber-500 to-amber-600',
    rose: 'from-rose-500 to-rose-600',
  };

  return (
    <Card className="p-4 md:p-5 hover:border-strong/50 transition-all duration-300">
      <div className="flex items-start justify-between mb-2 md:mb-3">
        <div className={`p-2 md:p-2.5 rounded-xl bg-gradient-to-br ${colorMap[variant]} text-white shadow-lg shadow-black/20`}>
          <Icon size={18} className="md:w-5 md:h-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] md:text-sm font-medium ${trend === 'up' ? 'text-danger' : 'text-success'}`}>
            {trend === 'up' ? <TrendingUp size={12} className="md:w-3.5 md:h-3.5" /> : <TrendingDown size={12} className="md:w-3.5 md:h-3.5" />}
            {trendValue}
          </div>
        )}
      </div>
      <div className="text-base md:text-2xl font-bold text-primary mb-0.5 md:mb-1 truncate leading-tight">{value}</div>
      <div className="text-[10px] md:text-sm text-secondary truncate font-medium uppercase tracking-wider md:normal-case md:tracking-normal">{label}</div>
      {subvalue && <div className="text-[9px] md:text-xs text-muted mt-1 truncate">{subvalue}</div>}
    </Card>
  );
};

interface DistributionChartProps {
  data: { name: string; value: number; color: string; twColor?: string }[];
  totalLabel?: string;
  totalValue?: string;
  showBars?: boolean;
}

export const DistributionChart: React.FC<DistributionChartProps> = ({ data, totalLabel = 'Total', totalValue, showBars = false }) => {
  const total = data.reduce((s, d) => s + d.value, 0);

  const chart = (
    <div className="relative w-28 h-28 md:w-44 md:h-44 shrink-0 flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="78%"
            outerRadius="100%"
            paddingAngle={0}
            dataKey="value"
            stroke="none"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center p-2">
        <span className="text-primary font-black text-xs md:text-xl leading-tight">
          {totalValue || formatCurrency(total).replace('R$', '').trim()}
        </span>
        <span className="text-muted text-[8px] md:text-[10px] font-black uppercase tracking-widest mt-0.5">{totalLabel}</span>
      </div>
    </div>
  );

  if (!showBars) return <div className="h-full w-full">{chart}</div>;

  return (
    <div className="flex flex-row items-center gap-4 md:gap-8 w-full h-full">
      {chart}
      <div className="flex-1 w-full space-y-3 md:space-y-5">
        {data.map((item, index) => {
          const percent = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={index}>
              <div className="flex justify-between items-center mb-1 md:mb-2">
                <div className="flex items-center gap-1.5 md:gap-2">
                  <span className="w-2 h-2 md:w-3 md:h-3 rounded-full" style={{ backgroundColor: item.color }}></span>
                  <span className="text-secondary font-bold text-[10px] md:text-sm truncate max-w-[80px] md:max-w-none">{item.name}</span>
                </div>
                <span className="font-black text-primary text-[10px] md:text-sm">{formatCurrency(item.value)}</span>
              </div>
              <div className="w-full bg-surface-2/50 rounded-full h-1.5 md:h-2">
                <div 
                  className="h-full rounded-full transition-all duration-1000" 
                  style={{ width: `${percent}%`, backgroundColor: item.color }}
                ></div>
              </div>
              <div className="text-right text-[8px] md:text-[10px] text-muted font-black mt-0.5 md:mt-1">{percent.toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface EvolutionChartProps {
  data: { periodo: string; total: number }[];
}

export const EvolutionChart: React.FC<EvolutionChartProps> = ({ data }) => {
  return (
    <div className="h-full w-full min-h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.5} />
          <XAxis 
            dataKey="periodo" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            dy={10}
          />
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={(v) => (typeof v === 'number' ? `R$ ${(v/1000).toFixed(0)}k` : '')}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '12px' }}
            itemStyle={{ color: '#22d3ee', fontWeight: 'bold' }}
            formatter={(value: number) => [formatCurrency(value), 'Total']}
            labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
          />
          <Area 
            type="monotone" 
            dataKey="total" 
            stroke="#06b6d4" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorTotal)" 
            connectNulls={false}
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};