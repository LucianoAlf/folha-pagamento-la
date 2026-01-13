import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, ToggleSwitch, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import { Bell, Loader2, CheckCircle2, RotateCcw } from 'lucide-react';
import { fetchNotificacaoConfig } from '../../services/agendaService';
import {
  deleteContaPagarNotificacoesOverride,
  fetchContaPagarNotificacoesOverride,
  upsertContaPagarNotificacoesOverride,
} from '../../services/contasPagarService';

export const ContaLembretesWhatsApp: React.FC<{
  contaId: string;
  dense?: boolean;
  showOpenCentral?: boolean;
}> = ({ contaId, dense = false, showOpenCentral = true }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasOverride, setHasOverride] = useState(false);

  const [state, setState] = useState<{ alerta_3d: boolean; alerta_1d: boolean; alerta_no_dia: boolean }>({
    alerta_3d: false,
    alerta_1d: false,
    alerta_no_dia: false,
  });

  const saveTimer = useRef<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [globalCfg, override] = await Promise.all([
        fetchNotificacaoConfig(),
        fetchContaPagarNotificacoesOverride(contaId),
      ]);
      const g3d = !!(globalCfg as any)?.contas_alerta_3d;
      const g1d = !!(globalCfg as any)?.contas_alerta_1d;
      const g0d = !!(globalCfg as any)?.contas_alerta_no_dia;

      setHasOverride(!!override);
      setState({
        alerta_3d: (override?.alerta_3d ?? g3d) as boolean,
        alerta_1d: (override?.alerta_1d ?? g1d) as boolean,
        alerta_no_dia: (override?.alerta_no_dia ?? g0d) as boolean,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaId]);

  const scheduleSave = (next: typeof state) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaving(true);
      setSaved(false);
      try {
        await upsertContaPagarNotificacoesOverride(contaId, {
          alerta_3d: next.alerta_3d,
          alerta_1d: next.alerta_1d,
          alerta_no_dia: next.alerta_no_dia,
        });
        setHasOverride(true);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1600);
      } finally {
        setSaving(false);
      }
    }, 450);
  };

  const headerRight = useMemo(() => {
    if (loading) return <Badge variant="default">Carregando…</Badge>;
    if (saving) return <Badge variant="info">Salvando…</Badge>;
    if (saved) return <Badge variant="success">Salvo</Badge>;
    return hasOverride ? (
      <Badge variant="info" className="bg-violet-500/10 text-violet-300 border-violet-500/20">
        Personalizado
      </Badge>
    ) : null;
  }, [hasOverride, loading, saved, saving]);

  return (
    <div className={cn('rounded-2xl border border-slate-800 bg-slate-950/20', dense ? 'p-4' : 'p-5')}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-violet-400" />
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">WhatsApp</div>
          {headerRight}
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-white font-black">Lembretes desta conta</div>
        </div>

        {showOpenCentral && !hasOverride ? (
          <div className="pt-1">
            <Tooltip content="Ver Configurações Globais" side="top">
              <button
                type="button"
                onClick={() => {
                  try {
                    window.dispatchEvent(new CustomEvent('la:navigate', { detail: { module: 'notificacoes' } }));
                  } catch {
                    // ignore
                  }
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950/30 text-slate-400 font-bold hover:bg-slate-950/45 transition-all text-[10px] uppercase tracking-widest"
              >
                Config. Globais
              </button>
            </Tooltip>
          </div>
        ) : null}

        {!dense ? (
          <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
            Esta conta segue o padrão definido no módulo <span className="text-slate-400">Notificações</span>. Se você
            alterar algo abaixo, ela passará a ter um ajuste <span className="text-violet-400/80">individual</span>.
          </p>
        ) : null}
      </div>

      <div className={cn('mt-4', dense && 'mt-3')}>
        {loading ? (
          <div className="text-xs text-slate-500 font-bold flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Carregando…
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(
              [
                { key: 'alerta_3d', label: '3 dias antes' },
                { key: 'alerta_1d', label: '1 dia antes' },
                { key: 'alerta_no_dia', label: 'No dia' },
              ] as const
            ).map((it) => (
              <div
                key={it.key}
                className={cn('flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-all', 'border-slate-800 bg-slate-950/25 hover:bg-slate-950/40')}
              >
                <span className="text-sm text-slate-200 font-bold">{it.label}</span>
                <ToggleSwitch
                  checked={!!(state as any)[it.key]}
                  onCheckedChange={(nextVal) => {
                    const next = { ...state, [it.key]: nextVal } as any;
                    setState(next);
                    scheduleSave(next);
                  }}
                  variant="cyan"
                  size="sm"
                  ariaLabel={`Ativar ${it.label}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {hasOverride && !loading ? (
        <div className={cn('mt-4 flex items-center justify-between', dense && 'mt-3')}>
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
            {saved ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Atualizado
              </>
            ) : (
              'Ajuste individual'
            )}
          </div>
          <Tooltip content="Remover override e voltar ao padrão global" side="top">
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setSaved(false);
                try {
                  await deleteContaPagarNotificacoesOverride(contaId);
                  setHasOverride(false);
                  await load();
                  setSaved(true);
                  window.setTimeout(() => setSaved(false), 1600);
                } finally {
                  setSaving(false);
                }
              }}
              className={cn(
                'px-4 py-2 rounded-xl border transition-all text-[10px] uppercase tracking-widest font-black inline-flex items-center gap-2',
                'border-slate-800 bg-slate-950/20 text-slate-400 hover:text-white hover:bg-slate-950/35',
                saving && 'opacity-60 cursor-not-allowed'
              )}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Usar padrão global
            </button>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
};

