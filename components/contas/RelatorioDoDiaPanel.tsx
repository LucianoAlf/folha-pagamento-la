import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, Copy, FileText, MessageSquare, RefreshCw } from 'lucide-react';
import { Badge, Card, DatePicker } from '../UI';
import { ContaPagar, ContaPagarCodigoMes, ContaPagarRelatorioDia } from '../../types/contasPagar';
import {
  fetchRelatoriosDia,
  filtrarContasRelatorioDia,
  marcarRelatorioCopiado,
  montarRelatorioMensagem,
  salvarRelatorioDia,
} from '../../services/contasPagarService';
import { cn } from '../CollaboratorComponents';
import { formatDateBR } from '../../utils/dateOnly';

export const RelatorioDoDiaPanel: React.FC<{
  contas: ContaPagar[];
  codigosPorConta: Record<string, ContaPagarCodigoMes>;
  unidade: string;
  unidadeLabel: string;
  geradoPor: string;
  onCopied?: () => void;
}> = ({ contas, codigosPorConta, unidade, unidadeLabel, geradoPor, onCopied }) => {
  const hoje = new Date().toISOString().split('T')[0];
  const [dataRef, setDataRef] = useState(hoje);
  const [mensagem, setMensagem] = useState('');
  const [relatorioId, setRelatorioId] = useState<string | null>(null);
  const [historico, setHistorico] = useState<ContaPagarRelatorioDia[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiando, setCopiando] = useState(false);

  const contasFiltradas = useMemo(
    () => filtrarContasRelatorioDia(contas, dataRef, unidade),
    [contas, dataRef, unidade]
  );

  const loadHistorico = useCallback(async () => {
    try {
      setHistorico(await fetchRelatoriosDia(dataRef, unidade));
    } catch {
      setHistorico([]);
    }
  }, [dataRef, unidade]);

  useEffect(() => {
    loadHistorico();
    setMensagem('');
    setRelatorioId(null);
  }, [loadHistorico, dataRef, unidade]);

  const gerar = async () => {
    setLoading(true);
    try {
      const texto = montarRelatorioMensagem(contasFiltradas, dataRef, {
        codigosPorConta,
        unidadeFiltro: unidade,
      });
      setMensagem(texto);
      const row = await salvarRelatorioDia({
        data_referencia: dataRef,
        unidade,
        mensagem_texto: texto,
        gerado_por: geradoPor,
        status_envio: 'rascunho',
        payload_json: { conta_ids: contasFiltradas.map((c) => c.id) },
      });
      setRelatorioId(row.id);
      await loadHistorico();
    } finally {
      setLoading(false);
    }
  };

  const copiar = async () => {
    if (!mensagem) return;
    setCopiando(true);
    try {
      await navigator.clipboard.writeText(mensagem);
      if (relatorioId) {
        await marcarRelatorioCopiado(relatorioId);
        await loadHistorico();
      }
      onCopied?.();
    } finally {
      setCopiando(false);
    }
  };

  const ultimoStatus = historico[0]?.status_envio;

  return (
    <section className="mt-10 pt-8 border-t border-line/60">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-muted">Operacional</div>
          <h3 className="text-xl font-black text-primary mt-1 flex items-center gap-2">
            <FileText size={20} className="text-accent shrink-0" />
            Relatório do dia
          </h3>
          <p className="text-sm text-secondary font-medium mt-2 max-w-2xl leading-relaxed">
            Monta a mensagem no novo modelo aprovado: total geral, resumo por unidade e blocos na ordem Recreio → Barra → Campo Grande,
            com código de barras ou PIX quando cadastrado. Inclui apenas contas que vencem na <strong className="text-primary font-bold">data de referência</strong>.
            Rose gera, revisa e copia — saldos entram na Fatia D (Pluggy) e o alerta curto de rateio aparece só quando necessário.
          </p>
        </div>
        {ultimoStatus && (
          <Badge variant={ultimoStatus === 'copiado' ? 'success' : ultimoStatus === 'enviado' ? 'info' : 'default'}>
            Último: {ultimoStatus}
          </Badge>
        )}
      </div>

      <Card className="p-0 overflow-hidden border border-line/80 shadow-[var(--shadow-card)]">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] divide-y lg:divide-y-0 lg:divide-x divide-line/60">
          {/* Coluna esquerda — controles */}
          <div className="p-6 space-y-5 bg-surface/20">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent/10 text-accent text-[10px] font-black uppercase tracking-wider">
                <MessageSquare size={12} />
                {contasFiltradas.length} conta(s)
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-2 text-secondary text-[10px] font-black uppercase tracking-wider">
                {unidadeLabel}
              </span>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-2.5 px-0.5">
                Data de referência
              </label>
              <DatePicker
                value={dataRef}
                onChange={(v) => setDataRef(v || hoje)}
                placeholder="dd/mm/aaaa"
                className="w-full"
              />
              <p className="text-[10px] text-muted font-bold mt-2 px-0.5">
                Referência: {formatDateBR(dataRef)} · vencimentos somente deste dia
              </p>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={loading}
                onClick={gerar}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-accent hover:bg-accent/80 text-on-accent text-xs font-black uppercase tracking-wider disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
                Gerar preview
              </button>
              <button
                type="button"
                disabled={!mensagem || copiando}
                onClick={copiar}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border border-line bg-surface hover:bg-surface-2 text-primary text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all active:scale-[0.98]"
              >
                <Copy size={14} />
                {copiando ? 'Copiando...' : 'Copiar mensagem'}
              </button>
            </div>

            {historico.length > 0 && (
              <div className="rounded-2xl border border-line/60 bg-bg/40 px-4 py-3 text-[10px] text-muted font-bold leading-relaxed">
                <Calendar size={12} className="inline mr-1.5 -mt-0.5 text-accent" />
                Snapshot salvo · {new Date(historico[0].created_at).toLocaleString('pt-BR')}
              </div>
            )}
          </div>

          {/* Coluna direita — preview estilo WhatsApp */}
          <div className="p-6 bg-bg/30 min-h-[220px] flex flex-col">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted mb-3 flex items-center gap-2">
              <MessageSquare size={12} className="text-accent" />
              Preview da mensagem
            </div>

            {mensagem ? (
              <div className="flex-1 rounded-2xl border border-line/70 bg-surface/50 p-4 shadow-inner">
                <pre className="text-xs font-bold text-primary whitespace-pre-wrap leading-relaxed font-sans">{mensagem}</pre>
              </div>
            ) : (
              <div className="flex-1 rounded-2xl border border-dashed border-line/80 bg-surface/20 flex flex-col items-center justify-center text-center px-6 py-10">
                <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center text-accent mb-4">
                  <FileText size={22} />
                </div>
                <p className="text-sm font-bold text-secondary">Nenhum preview gerado ainda</p>
                <p className="text-xs text-muted font-medium mt-1 max-w-xs">
                  Clique em <span className="text-accent font-bold">Gerar preview</span> para montar a mensagem do dia.
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
};
