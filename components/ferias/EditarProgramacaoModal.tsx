import React, { useState, useEffect } from 'react';
import { X, Calendar, AlertCircle, CheckCircle } from 'lucide-react';
import { Modal, DatePicker, Button } from '../UI';
import { feriasService } from '../../services/feriasService';
import {
  calcularDiasUteis,
  calcularDiasCorridos,
  calcularDataLimitePagamento,
  toISODate,
  parseISODate,
  adicionarDiasUteis,
} from '../../utils/feriasCalculations';
import {
  validarProgramacaoFerias,
  validarAbono,
  validarDiasMinimos,
  maxAbonoDias,
} from '../../utils/feriasValidations';
import type {
  FeriasProgramacao,
  FeriasPeriodoAquisitivo,
} from '../../types';

interface EditarProgramacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  programacao: FeriasProgramacao;
  periodo: FeriasPeriodoAquisitivo;
  onSuccess: () => void;
}

export const EditarProgramacaoModal: React.FC<EditarProgramacaoModalProps> = ({
  isOpen,
  onClose,
  programacao,
  periodo,
  onSuccess,
}) => {
  const [dataInicio, setDataInicio] = useState<Date | null>(null);
  const [dataFim, setDataFim] = useState<Date | null>(null);
  const [vendeAbono, setVendeAbono] = useState(programacao.vendeu_abono || false);
  const [diasAbono, setDiasAbono] = useState(programacao.dias_abono || 0);
  const [observacoes, setObservacoes] = useState(programacao.observacoes || '');
  const [isLoading, setIsLoading] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);

  // Calcular dias
  const diasUteis =
    dataInicio && dataFim ? calcularDiasUteis(dataInicio, dataFim) : 0;
  const diasCorridos =
    dataInicio && dataFim ? calcularDiasCorridos(dataInicio, dataFim) : 0;

  // Carregar dados iniciais
  useEffect(() => {
    if (isOpen) {
      setDataInicio(parseISODate(programacao.data_inicio));
      setDataFim(parseISODate(programacao.data_fim));
      setVendeAbono(programacao.vendeu_abono || false);
      setDiasAbono(programacao.dias_abono || 0);
      setObservacoes(programacao.observacoes || '');
      setErros([]);
      setAvisos([]);
    }
  }, [isOpen, programacao]);

  // Validação em tempo real
  useEffect(() => {
    if (!dataInicio || !dataFim) {
      setErros([]);
      setAvisos([]);
      return;
    }

    const validacao = validarProgramacaoFerias({
      periodo,
      dataInicio,
      dataFim,
      diasCorridos,
      diasAbono: vendeAbono ? diasAbono : 0,
      isPrimeiroPeriodo: false, // Assumimos que já foi criado, não é o primeiro
      ehPeriodoUnico: diasCorridos === periodo.dias_saldo,
    });

    setErros(validacao.erros);
    setAvisos(validacao.avisos);
  }, [dataInicio, dataFim, diasCorridos, diasAbono, vendeAbono, periodo]);

  // Handler de mudança de data início
  const handleDataInicioChange = (date: Date | null) => {
    setDataInicio(date);
    // Auto-calcular data fim baseado nos dias corridos atuais
    if (date && diasCorridos > 0) {
      const novaDataFim = new Date(date);
      novaDataFim.setDate(novaDataFim.getDate() + diasCorridos - 1);
      setDataFim(novaDataFim);
    }
  };

  // Handler de abono
  const handleAbonoChange = (checked: boolean) => {
    setVendeAbono(checked);
    if (!checked) {
      setDiasAbono(0);
    } else {
      // Sugerir máximo permitido: 1/3 do direito do período (CLT), limitado à fração
      const maxAbono = maxAbonoDias(periodo.dias_direito, diasCorridos);
      setDiasAbono(maxAbono);
    }
  };

  const handleSalvar = async () => {
    if (!dataInicio || !dataFim) {
      setErros(['Selecione as datas de início e fim']);
      return;
    }

    if (erros.length > 0) {
      return;
    }

    try {
      setIsLoading(true);

      await feriasService.updateProgramacao(programacao.id!, {
        data_inicio: toISODate(dataInicio),
        data_fim: toISODate(dataFim),
        dias_corridos: diasCorridos,
        dias_uteis: diasUteis,
        vendeu_abono: vendeAbono,
        dias_abono: vendeAbono ? diasAbono : 0,
        observacoes: observacoes || null,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Erro ao atualizar programação:', err);
      setErros([err.message || 'Erro ao atualizar programação']);
    } finally {
      setIsLoading(false);
    }
  };

  const podeEditar =
    programacao.status === 'programado' || programacao.status === 'aprovado';

  if (!podeEditar) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="sm">
        <div className="p-6 text-center">
          <AlertCircle size={48} className="mx-auto text-amber-500 mb-4" />
          <h3 className="text-lg font-bold text-slate-200 mb-2">
            Não é possível editar
          </h3>
          <p className="text-sm text-slate-400">
            Programações com status "{programacao.status}" não podem ser editadas.
          </p>
          <Button onClick={onClose} className="mt-4">
            Fechar
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between p-4 md:p-6 border-b border-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <Calendar size={20} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-black text-slate-100">
                Editar Programação de Férias
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Altere as datas ou configurações das férias programadas
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
          {/* Info do Período */}
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
            <div className="text-xs font-bold text-slate-400 mb-2">
              Período Aquisitivo
            </div>
            <div className="text-sm text-slate-200">
              {new Date(periodo.data_inicio).toLocaleDateString('pt-BR')} a{' '}
              {new Date(periodo.data_fim).toLocaleDateString('pt-BR')}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Saldo disponível: {periodo.dias_saldo} dias • Vence em{' '}
              {new Date(periodo.concessivo_fim).toLocaleDateString('pt-BR')}
            </div>
          </div>

          {/* Datas de Férias */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
                📅 Data de Início
              </label>
              <DatePicker
                value={dataInicio ? toISODate(dataInicio) : undefined}
                onChange={(s) => handleDataInicioChange(s ? parseISODate(s) : null)}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
                📅 Data de Fim
              </label>
              <DatePicker
                value={dataFim ? toISODate(dataFim) : undefined}
                onChange={(s) => setDataFim(s ? parseISODate(s) : null)}
                className="w-full"
              />
            </div>

            {dataInicio && dataFim && (
              <div className="p-3 rounded-lg bg-violet-600/10 border border-violet-500/30">
                <div className="text-xs font-bold text-violet-400 mb-1">
                  Duração Calculada
                </div>
                <div className="text-sm text-slate-200">
                  {diasCorridos} dias corridos
                </div>
              </div>
            )}
          </div>

          {/* Abono Pecuniário */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={vendeAbono}
                onChange={(e) => handleAbonoChange(e.target.checked)}
                className="w-5 h-5 rounded border-slate-700 bg-slate-900/40 text-violet-600 focus:ring-violet-500/50 cursor-pointer"
              />
              <div className="flex-1">
                <div className="text-sm font-bold text-slate-200">
                  Vender 1/3 das férias (abono pecuniário)
                </div>
                <div className="text-xs text-slate-400">
                  Receber em dinheiro até 10 dias das férias
                </div>
              </div>
            </label>

            {vendeAbono && (
              <div>
                <label className="block text-sm font-bold text-slate-200 mb-2">
                  Quantos dias deseja vender?
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={diasAbono}
                  onChange={(e) => setDiasAbono(parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-2.5 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Máximo: {maxAbonoDias(periodo.dias_direito, diasCorridos)} dias (1/3 de{' '}
                  {periodo.dias_direito} dias de direito)
                </p>
              </div>
            )}
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
              placeholder="Adicione observações ou justificativas..."
            />
          </div>

          {/* Erros */}
          {erros.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-bold text-rose-400 mb-1">
                    Erros de Validação
                  </div>
                  <ul className="text-xs text-rose-300/70 space-y-1">
                    {erros.map((erro, i) => (
                      <li key={i}>• {erro}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Avisos */}
          {avisos.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-bold text-amber-400 mb-1">
                    Avisos
                  </div>
                  <ul className="text-xs text-amber-300/70 space-y-1">
                    {avisos.map((aviso, i) => (
                      <li key={i}>• {aviso}</li>
                    ))}
                  </ul>
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
            onClick={handleSalvar}
            variant="primary"
            disabled={!dataInicio || !dataFim || erros.length > 0 || isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                Salvar Alterações
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
