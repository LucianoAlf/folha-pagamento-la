import React, { useState, useEffect, useMemo } from 'react';
import { X, DollarSign, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { Modal, DatePicker, Button, CustomSelect, Badge } from '../UI';
import { feriasService } from '../../services/feriasService';
import { calcularDataLimitePagamento, toISODate } from '../../utils/feriasCalculations';
import type { FeriasProgramacao, FeriasColaboradorStatus, FeriasValorCalculado } from '../../types';

interface RegistrarPagamentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  programacao: FeriasProgramacao;
  colaborador: FeriasColaboradorStatus;
  onSuccess: () => void;
}

export const RegistrarPagamentoModal: React.FC<RegistrarPagamentoModalProps> = ({
  isOpen,
  onClose,
  programacao,
  colaborador,
  onSuccess,
}) => {
  const [dataPagamento, setDataPagamento] = useState<string | undefined>(toISODate(new Date()));
  const [valorPago, setValorPago] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [valorCalculado, setValorCalculado] = useState<FeriasValorCalculado | null>(null);
  const [pagamentoModalidade, setPagamentoModalidade] = useState<'completo' | 'somente_terco'>(
    programacao.pagamento_modalidade || 'completo'
  );
  const [erro, setErro] = useState<string | null>(null);

  // Calcular valor estimado ao abrir
  useEffect(() => {
    if (isOpen) {
      const modalidade = programacao.pagamento_modalidade || 'completo';
      setDataPagamento(toISODate(new Date()));
      setObservacoes('');
      setErro(null);
      setPagamentoModalidade(modalidade);
      calcularValor(modalidade);
    }
  }, [isOpen]);

  const calcularValor = async (modalidade: 'completo' | 'somente_terco' = pagamentoModalidade) => {
    try {
      setIsCalculating(true);
      const valor = await feriasService.calcularValorFerias(
        colaborador.colaborador_id,
        programacao.dias_uteis,
        programacao.vendeu_abono ? programacao.dias_abono : 0
      );
      setValorCalculado(valor);
      // Valor padrão ao abrir: depende da modalidade selecionada
      const sugerido =
        modalidade === 'somente_terco'
          ? valor.valor_terco + (programacao.vendeu_abono ? valor.valor_abono : 0)
          : valor.valor_total;
      setValorPago(sugerido.toFixed(2));
    } catch (err: any) {
      console.error('Erro ao calcular valor:', err);
      setValorCalculado(null);
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!valorCalculado) return;
    const sugerido =
      pagamentoModalidade === 'somente_terco'
        ? valorCalculado.valor_terco + (programacao.vendeu_abono ? valorCalculado.valor_abono : 0)
        : valorCalculado.valor_total;
    setValorPago(sugerido.toFixed(2));
  }, [pagamentoModalidade, isOpen, valorCalculado]);

  const formatarMoeda = (valor: string): string => {
    // Remove tudo exceto números e vírgula/ponto
    let numero = valor.replace(/[^\d.,]/g, '');
    // Substitui vírgula por ponto
    numero = numero.replace(',', '.');
    return numero;
  };

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorFormatado = formatarMoeda(e.target.value);
    setValorPago(valorFormatado);
  };

  const handleRegistrar = async () => {
    if (!dataPagamento) {
      setErro('Selecione a data de pagamento');
      return;
    }

    const valorNumerico = parseFloat(valorPago);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      setErro('Informe um valor válido');
      return;
    }

    try {
      setIsLoading(true);
      setErro(null);

      await feriasService.registrarPagamento(programacao.id!, {
        data_pagamento: dataPagamento,
        valor_pagamento: valorNumerico,
        pagamento_modalidade: pagamentoModalidade,
        observacoes_pagamento: observacoes || null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao registrar pagamento:', err);
      setErro(err.message || 'Erro ao registrar pagamento');
    } finally {
      setIsLoading(false);
    }
  };

  const dataLimitePagamento = useMemo(
    () => calcularDataLimitePagamento(new Date(programacao.data_inicio)),
    [programacao.data_inicio]
  );
  const hoje = new Date();
  const dataPagamentoDate = useMemo(() => {
    if (!dataPagamento) return null;
    // Parse as UTC midnight to avoid timezone shifts
    return new Date(`${dataPagamento}T00:00:00.000Z`);
  }, [dataPagamento]);
  const estaDentroPrazo = dataPagamentoDate ? dataPagamentoDate <= dataLimitePagamento : false;
  const estaAtrasado = hoje > dataLimitePagamento;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between p-4 md:p-6 border-b border-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
              <DollarSign size={20} className="text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-black text-slate-100">
                Registrar Pagamento de Férias
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {colaborador.nome}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Info das Férias */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
            <div className="text-xs font-bold text-slate-400 mb-2">
              Período de Férias
            </div>
            <div className="text-sm text-slate-200">
              {new Date(programacao.data_inicio).toLocaleDateString('pt-BR')} a{' '}
              {new Date(programacao.data_fim).toLocaleDateString('pt-BR')}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {programacao.dias_corridos} dias corridos • {programacao.dias_uteis} dias
              úteis
              {programacao.vendeu_abono &&
                ` • ${programacao.dias_abono} dias de abono`}
            </div>
          </div>

          {/* Prazo de Pagamento */}
          <div
            className={`p-4 rounded-xl border ${
              estaAtrasado
                ? 'bg-rose-500/10 border-rose-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertCircle
                size={16}
                className={`${
                  estaAtrasado ? 'text-rose-400' : 'text-amber-400'
                } shrink-0 mt-0.5`}
              />
              <div>
                <div
                  className={`text-sm font-bold ${
                    estaAtrasado ? 'text-rose-400' : 'text-amber-400'
                  } mb-1`}
                >
                  {estaAtrasado ? '🚨 Prazo Vencido!' : '⏰ Prazo de Pagamento'}
                </div>
                <div
                  className={`text-xs ${
                    estaAtrasado ? 'text-rose-300/70' : 'text-amber-300/70'
                  }`}
                >
                  Deve ser pago até{' '}
                  {dataLimitePagamento.toLocaleDateString('pt-BR')} (2 dias antes do
                  início)
                  {estaAtrasado && ' - ATENÇÃO: Prazo ultrapassado!'}
                </div>
              </div>
            </div>
          </div>

          {/* Valor Calculado */}
          {isCalculating ? (
            <div className="p-4 rounded-xl bg-violet-600/10 border border-violet-500/30 flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
              <span className="text-sm text-slate-300">Calculando valor...</span>
            </div>
          ) : valorCalculado !== null ? (
            <div className="p-4 rounded-xl bg-violet-600/10 border border-violet-500/30">
              <div className="text-xs font-bold text-violet-400 mb-2">
                💰 Valor Calculado (Estimado)
              </div>
              <div className="text-2xl font-black text-slate-100">
                R$ {valorCalculado.valor_total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Férias + 1/3 constitucional
                {programacao.vendeu_abono && ' + abono pecuniário'}
              </div>
            </div>
          ) : null}

          {/* Modalidade */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-sm font-black text-slate-200">Modalidade de Pagamento</div>
              {pagamentoModalidade === 'somente_terco' ? (
                <Badge variant="info">1/3</Badge>
              ) : (
                <Badge variant="default">Completo</Badge>
              )}
            </div>
            <CustomSelect
              value={pagamentoModalidade}
              onValueChange={(v) => setPagamentoModalidade(v as any)}
              options={[
                { value: 'completo', label: 'Completo (ferias + 1/3)' },
                { value: 'somente_terco', label: 'Somente adicional de 1/3' },
              ]}
              className="bg-slate-950/40 border-slate-800/60"
            />
            <div className="text-xs text-slate-500 mt-2">
              Sugerido: {' '}
              {valorCalculado
                ? (pagamentoModalidade === 'somente_terco'
                    ? valorCalculado.valor_terco + (programacao.vendeu_abono ? valorCalculado.valor_abono : 0)
                    : valorCalculado.valor_total
                  ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                : '—'}
            </div>
          </div>

          {/* Data de Pagamento */}
          <div>
            <label className="block text-sm font-bold text-slate-200 mb-2">
              📅 Data do Pagamento
            </label>
            <DatePicker value={dataPagamento} onChange={setDataPagamento} className="w-full" />
            {dataPagamento && !estaDentroPrazo && !estaAtrasado && (
              <p className="text-xs text-amber-400 mt-2">
                ⚠️ Data após o prazo legal. Certifique-se de que o pagamento foi
                realizado no prazo.
              </p>
            )}
          </div>

          {/* Valor Pago */}
          <div>
            <label className="block text-sm font-bold text-slate-200 mb-2">
              💵 Valor Pago (R$)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">
                R$
              </span>
              <input
                type="text"
                value={valorPago}
                onChange={handleValorChange}
                placeholder="0,00"
                className="w-full pl-12 pr-4 py-2.5 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Informe o valor efetivamente pago ao colaborador
            </p>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-bold text-slate-200 mb-2">
              💬 Observações (opcional)
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500/50 transition-colors resize-none"
              placeholder="Método de pagamento, detalhes adicionais..."
            />
          </div>

          {/* Erro */}
          {erro && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-bold text-rose-400">{erro}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex gap-3 p-4 md:p-6 border-t border-slate-800/50">
          <Button onClick={onClose} variant="outline" className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleRegistrar}
            variant="primary"
            disabled={!dataPagamento || !valorPago || isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Registrando...
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Confirmar Pagamento
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
