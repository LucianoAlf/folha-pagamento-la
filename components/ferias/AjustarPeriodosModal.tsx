import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Save, Loader2, RefreshCw, Info } from 'lucide-react';
import { Modal, Button, Badge, CustomSelect } from '../UI';
import { feriasService } from '../../services/feriasService';
import type { FeriasColaboradorStatus, FeriasPeriodoAquisitivo, FeriasPeriodoStatus } from '../../types';

type RowState = {
  dias_gozados: number;
  dias_vendidos: number;
  status: FeriasPeriodoStatus;
  observacoes: string;
  concessivo_inicio: string;
  concessivo_fim: string;
};

function clampInt(v: unknown, min: number, max: number) {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseISODateOnly(iso: string) {
  // Ensure stable parsing across browsers/timezones
  return new Date(`${iso}T00:00:00.000Z`);
}

function addDays(d: Date, days: number) {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function addMonths(d: Date, months: number) {
  const copy = new Date(d.getTime());
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

export const AjustarPeriodosModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  colaborador: FeriasColaboradorStatus;
  onSuccess: () => void;
}> = ({ isOpen, onClose, colaborador, onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [periodos, setPeriodos] = useState<FeriasPeriodoAquisitivo[]>([]);
  const [draft, setDraft] = useState<Record<string, RowState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const statusOptions = useMemo(
    () => [
      { value: 'ativo', label: 'Ativo' },
      { value: 'em_gozo', label: 'Em gozo' },
      { value: 'concluido', label: 'Concluído' },
      { value: 'vencido', label: 'Vencido' },
    ],
    []
  );

  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const rows = await feriasService.fetchPeriodosAquisitivos(colaborador.colaborador_id);
        setPeriodos(rows);
        setDraft(
          Object.fromEntries(
            rows.map((p) => [
              p.id,
              {
                dias_gozados: p.dias_gozados || 0,
                dias_vendidos: p.dias_vendidos || 0,
                status: p.status,
                observacoes: p.observacoes || '',
                concessivo_inicio: p.concessivo_inicio,
                concessivo_fim: p.concessivo_fim,
              },
            ])
          )
        );
      } catch (err: any) {
        console.error('Erro ao carregar períodos aquisitivos:', err);
        setError(err?.message || 'Erro ao carregar períodos aquisitivos');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [isOpen, colaborador.colaborador_id]);

  const refreshPeriodos = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      // Idempotente: cria/atualiza períodos a partir da data de admissão.
      await feriasService.calcularPeriodos(colaborador.colaborador_id);
      const rows = await feriasService.fetchPeriodosAquisitivos(colaborador.colaborador_id);
      setPeriodos(rows);
      setDraft(
        Object.fromEntries(
          rows.map((p) => [
            p.id,
            {
              dias_gozados: p.dias_gozados || 0,
              dias_vendidos: p.dias_vendidos || 0,
              status: p.status,
              observacoes: p.observacoes || '',
            },
          ])
        )
      );
      onSuccess();
    } catch (err: any) {
      console.error('Erro ao atualizar períodos:', err);
      setError(err?.message || 'Erro ao atualizar períodos');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSave = async (p: FeriasPeriodoAquisitivo) => {
    const d = draft[p.id];
    if (!d) return;

    try {
      setSavingId(p.id);
      setError(null);

      // dias_saldo é coluna gerada; não pode ser enviada no PATCH.
      await feriasService.updatePeriodoAquisitivo(p.id, {
        dias_gozados: clampInt(d.dias_gozados, 0, Math.max(0, p.dias_direito || 30)),
        dias_vendidos: clampInt(d.dias_vendidos, 0, 10),
        status: d.status,
        observacoes: d.observacoes,
        concessivo_inicio: d.concessivo_inicio,
        concessivo_fim: d.concessivo_fim,
      });

      // Recarrega períodos para refletir triggers (esta_vencido/status/dias_saldo)
      const rows = await feriasService.fetchPeriodosAquisitivos(colaborador.colaborador_id);
      setPeriodos(rows);
      onSuccess();
    } catch (err: any) {
      console.error('Erro ao salvar período:', err);
      setError(err?.message || 'Erro ao salvar período');
    } finally {
      setSavingId(null);
    }
  };

  const latestPeriodo = periodos[0] || null;
  const nextPeriodoInfo = useMemo(() => {
    if (!latestPeriodo) return null;
    // This app only persists periods after acquisition is completed (periodo_fim <= today).
    // So for recent hires it's normal to see only 1 row.
    const start = addDays(parseISODateOnly(latestPeriodo.data_fim), 1);
    const end = addDays(addMonths(start, 12), -1);
    return { start, end };
  }, [latestPeriodo?.id]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ajustar Periodos Aquisitivos"
      subtitle={
        <div className="text-white/80">
          {colaborador.nome} • Cada linha abaixo e um periodo de direito (12 meses). Aqui voce ajusta o saldo real.
        </div>
      }
      className="max-w-3xl"
    >
      <div className="mb-4 p-3 rounded-xl bg-slate-900/40 border border-slate-800 flex items-start gap-2">
        <Info size={16} className="text-cyan-400 shrink-0 mt-0.5" />
        <div className="flex-1 text-xs text-slate-300">
          <div className="font-bold text-slate-200 mb-1">Como preencher</div>
          <div>
            Se a pessoa tirou 20 dias + 10 dias no mesmo ano, voce soma em <span className="font-bold">Dias gozados</span> (30).
            Para anos diferentes, voce ajusta o periodo correspondente.
          </div>
          <div className="text-slate-500 mt-1">
            Dica: o sistema so cria um periodo novo quando o aquisitivo fecha 12 meses.
          </div>
        </div>
        <Button
          onClick={refreshPeriodos}
          disabled={isRefreshing || isLoading}
          variant="outline"
          className="!text-xs !py-2 !px-3 whitespace-nowrap"
        >
          {isRefreshing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Atualizando...
            </>
          ) : (
            <>
              <RefreshCw size={14} />
              Atualizar periodos
            </>
          )}
        </Button>
      </div>

      {nextPeriodoInfo && (
        <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90">
          Proximo periodo aquisitivo previsto:{' '}
          <span className="font-bold">
            {nextPeriodoInfo.start.toLocaleDateString('pt-BR')} a {nextPeriodoInfo.end.toLocaleDateString('pt-BR')}
          </span>
          . Ele so vai aparecer aqui depois que fechar o aquisitivo (quando chegar em{' '}
          <span className="font-bold">{nextPeriodoInfo.end.toLocaleDateString('pt-BR')}</span>).
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2">
          <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-bold text-rose-400">Erro</div>
            <div className="text-xs text-rose-300/70 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-10 flex items-center justify-center text-slate-400">
          <Loader2 size={18} className="animate-spin mr-2" />
          Carregando periodos...
        </div>
      ) : periodos.length === 0 ? (
        <div className="py-10 text-center text-slate-400">
          Nenhum periodo encontrado para este colaborador.
        </div>
      ) : (
        <div className="space-y-3">
          {periodos.map((p) => {
            const d = draft[p.id];
            const isSaving = savingId === p.id;

            return (
              <div
                key={p.id}
                className="p-4 rounded-xl bg-slate-900/40 border border-slate-800"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-slate-100 truncate">
                      Periodo {new Date(p.data_inicio).getFullYear()}-{new Date(p.data_fim).getFullYear()}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Aquisitivo: {new Date(p.data_inicio).toLocaleDateString('pt-BR')} a{' '}
                      {new Date(p.data_fim).toLocaleDateString('pt-BR')} • Concessivo:{' '}
                      {new Date(p.concessivo_inicio).toLocaleDateString('pt-BR')} a{' '}
                      {new Date(p.concessivo_fim).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <Badge variant={p.esta_vencido ? 'danger' : p.status === 'ativo' ? 'info' : 'default'}>
                    {p.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 px-1">
                      Dias direito
                    </label>
                    <div className="px-3 py-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 text-sm text-slate-200 font-bold">
                      {p.dias_direito}
                    </div>
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 px-1">
                      Dias gozados
                    </label>
                    <input
                      value={d?.dias_gozados ?? 0}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] || {
                              dias_gozados: 0,
                              dias_vendidos: 0,
                              status: p.status,
                              observacoes: '',
                              concessivo_inicio: p.concessivo_inicio,
                              concessivo_fim: p.concessivo_fim,
                            }),
                            dias_gozados: clampInt(e.target.value, 0, Math.max(0, p.dias_direito || 30)),
                          },
                        }))
                      }
                      className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800/60 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
                      inputMode="numeric"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 px-1">
                      Dias vendidos
                    </label>
                    <input
                      value={d?.dias_vendidos ?? 0}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] || {
                              dias_gozados: 0,
                              dias_vendidos: 0,
                              status: p.status,
                              observacoes: '',
                              concessivo_inicio: p.concessivo_inicio,
                              concessivo_fim: p.concessivo_fim,
                            }),
                            dias_vendidos: clampInt(e.target.value, 0, 10),
                          },
                        }))
                      }
                      className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800/60 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
                      inputMode="numeric"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 px-1">
                      Status
                    </label>
                    <CustomSelect
                      value={d?.status || p.status}
                      onValueChange={(v) =>
                        setDraft((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] || {
                              dias_gozados: 0,
                              dias_vendidos: 0,
                              status: p.status,
                              observacoes: '',
                              concessivo_inicio: p.concessivo_inicio,
                              concessivo_fim: p.concessivo_fim,
                            }),
                            status: v as FeriasPeriodoStatus,
                          },
                        }))
                      }
                      options={statusOptions}
                      className="bg-slate-950/40 border-slate-800/60"
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 px-1">
                      Concessivo Inicio
                    </label>
                    <input
                      type="date"
                      value={d?.concessivo_inicio || p.concessivo_inicio}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] || {
                              dias_gozados: p.dias_gozados || 0,
                              dias_vendidos: p.dias_vendidos || 0,
                              status: p.status,
                              observacoes: p.observacoes || '',
                              concessivo_inicio: p.concessivo_inicio,
                              concessivo_fim: p.concessivo_fim,
                            }),
                            concessivo_inicio: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800/60 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 px-1">
                      Concessivo Fim
                    </label>
                    <input
                      type="date"
                      value={d?.concessivo_fim || p.concessivo_fim}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [p.id]: {
                            ...(prev[p.id] || {
                              dias_gozados: p.dias_gozados || 0,
                              dias_vendidos: p.dias_vendidos || 0,
                              status: p.status,
                              observacoes: p.observacoes || '',
                              concessivo_inicio: p.concessivo_inicio,
                              concessivo_fim: p.concessivo_fim,
                            }),
                            concessivo_fim: e.target.value,
                          },
                        }))
                      }
                      className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800/60 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1 px-1">
                    Observacoes
                  </label>
                  <textarea
                    value={d?.observacoes ?? ''}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [p.id]: {
                          ...(prev[p.id] || {
                            dias_gozados: 0,
                            dias_vendidos: 0,
                            status: p.status,
                            observacoes: '',
                          }),
                          observacoes: e.target.value,
                        },
                      }))
                    }
                    rows={2}
                    className="w-full px-3 py-2.5 bg-slate-950/40 border border-slate-800/60 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    Saldo: <span className="text-slate-300 font-bold">{p.dias_saldo}</span> dia(s)
                  </div>
                  <Button
                    onClick={() => handleSave(p)}
                    disabled={isSaving}
                    variant="primary"
                    className="!text-xs !py-2 !px-3"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save size={14} />
                        Salvar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

