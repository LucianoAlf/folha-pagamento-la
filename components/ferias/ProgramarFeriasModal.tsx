import React, { useState, useEffect, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Calendar, AlertCircle, DollarSign, Check } from 'lucide-react';
import { Modal, Button, DatePicker, Badge } from '../UI';
import { feriasService } from '../../services/feriasService';
import type {
  FeriasColaboradorStatus,
  FeriasPeriodoAquisitivo,
  FeriasValorCalculado,
} from '../../types';
import {
  calcularDiasUteis,
  calcularDiasCorridos,
  calcularDataLimitePagamento,
  parseISODate,
  toISODate,
} from '../../utils/feriasCalculations';
import { validarProgramacaoFerias, maxAbonoDias } from '../../utils/feriasValidations';

interface ProgramarFeriasModalProps {
  isOpen: boolean;
  onClose: () => void;
  colaborador: FeriasColaboradorStatus;
  onSuccess: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface FormData {
  periodo_aquisitivo_id: string;
  data_inicio: string;
  data_fim: string;
  dias_corridos: number;
  dias_uteis: number;
  vendeu_abono: boolean;
  dias_abono: number;
  pagamento_modalidade: 'completo' | 'somente_terco';
  observacoes: string;
}

export const ProgramarFeriasModal: React.FC<ProgramarFeriasModalProps> = ({
  isOpen,
  onClose,
  colaborador,
  onSuccess,
}) => {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [periodos, setPeriodos] = useState<FeriasPeriodoAquisitivo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPeriodos, setIsGeneratingPeriodos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [valorCalculado, setValorCalculado] = useState<FeriasValorCalculado | null>(null);

  const [formData, setFormData] = useState<FormData>({
    periodo_aquisitivo_id: '',
    data_inicio: '',
    data_fim: '',
    dias_corridos: 0,
    dias_uteis: 0,
    vendeu_abono: false,
    dias_abono: 0,
    pagamento_modalidade: 'completo',
    observacoes: '',
  });

  // Carregar períodos disponíveis
  useEffect(() => {
    if (isOpen) {
      loadPeriodos();
    } else {
      // Reset ao fechar
      setCurrentStep(1);
      setFormData({
        periodo_aquisitivo_id: '',
        data_inicio: '',
        data_fim: '',
        dias_corridos: 0,
        dias_uteis: 0,
        vendeu_abono: false,
        dias_abono: 0,
        pagamento_modalidade: 'completo',
        observacoes: '',
      });
      setError(null);
      setValorCalculado(null);
    }
  }, [isOpen]);

  const loadPeriodos = async () => {
    try {
      setIsLoading(true);
      const data = await feriasService.fetchPeriodosAquisitivos(colaborador.colaborador_id);
      // Filtrar períodos ativos e vencidos com saldo, limitando aos 2 mais recentes
      const periodosDisponiveis = data
        .filter(
          (p) => ['ativo', 'vencido'].includes(p.status) && p.dias_saldo > 0
        )
        .sort((a, b) => new Date(b.data_inicio).getTime() - new Date(a.data_inicio).getTime())
        .slice(0, 2);
      setPeriodos(periodosDisponiveis);

      // Se houver apenas um período, selecionar automaticamente
      if (periodosDisponiveis.length === 1) {
        setFormData((prev) => ({
          ...prev,
          periodo_aquisitivo_id: periodosDisponiveis[0].id,
        }));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar períodos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGerarPeriodos = async () => {
    try {
      setIsGeneratingPeriodos(true);
      setError(null);
      // Gera/atualiza períodos para este colaborador via Edge Function (RPC no banco).
      await feriasService.calcularPeriodos(colaborador.colaborador_id);
      await loadPeriodos();
    } catch (err: any) {
      console.error('Erro ao gerar períodos aquisitivos:', err);
      setError(err?.message || 'Erro ao gerar períodos aquisitivos');
    } finally {
      setIsGeneratingPeriodos(false);
    }
  };

  const periodoSelecionado = useMemo(
    () => periodos.find((p) => p.id === formData.periodo_aquisitivo_id),
    [periodos, formData.periodo_aquisitivo_id]
  );

  // Calcular dias quando datas mudam
  useEffect(() => {
    if (formData.data_inicio && formData.data_fim) {
      const inicio = parseISODate(formData.data_inicio);
      const fim = parseISODate(formData.data_fim);

      const corridos = calcularDiasCorridos(inicio, fim);
      const uteis = calcularDiasUteis(inicio, fim);

      setFormData((prev) => ({
        ...prev,
        dias_corridos: corridos,
        dias_uteis: uteis,
      }));
    }
  }, [formData.data_inicio, formData.data_fim]);

  // Calcular valor quando dias corridos ou abono mudam
  useEffect(() => {
    if (formData.dias_corridos > 0 && currentStep >= 4) {
      calcularValor();
    }
  }, [formData.dias_corridos, formData.dias_abono, currentStep]);

  const calcularValor = async () => {
    try {
      const valor = await feriasService.calcularValorFerias(
        colaborador.colaborador_id,
        formData.dias_corridos,
        formData.vendeu_abono ? formData.dias_abono : 0
      );
      setValorCalculado(valor);
    } catch (err: any) {
      console.error('Erro ao calcular valor:', err);
    }
  };

  const handleNext = () => {
    setError(null);

    // Validações por step
    if (currentStep === 1) {
      if (!formData.periodo_aquisitivo_id) {
        setError('Selecione um período aquisitivo');
        return;
      }
    }

    if (currentStep === 2) {
      if (!formData.data_inicio || !formData.data_fim) {
        setError('Selecione as datas de início e fim');
        return;
      }

      // Validar
      if (periodoSelecionado) {
        const validacao = validarProgramacaoFerias({
          periodo: periodoSelecionado,
          dataInicio: parseISODate(formData.data_inicio),
          dataFim: parseISODate(formData.data_fim),
          diasCorridos: formData.dias_corridos,
          diasAbono: formData.vendeu_abono ? formData.dias_abono : 0,
          isPrimeiroPeriodo: true, // TODO: Verificar se é primeiro período
          ehPeriodoUnico: formData.dias_corridos === periodoSelecionado.dias_saldo,
        });

        if (!validacao.valido) {
          setError(validacao.erros.join('. '));
          return;
        }

        // Mostrar avisos (concessivo, vencido, etc.) sem bloquear
        setWarnings(validacao.avisos);
      }
    }

    if (currentStep === 3) {
      if (formData.vendeu_abono && formData.dias_abono === 0) {
        setError('Informe a quantidade de dias de abono');
        return;
      }
    }

    if (currentStep < 6) {
      setCurrentStep((prev) => (prev + 1) as Step);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as Step);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      await feriasService.createProgramacao({
        periodo_aquisitivo_id: formData.periodo_aquisitivo_id,
        colaborador_id: colaborador.colaborador_id,
        data_inicio: formData.data_inicio,
        data_fim: formData.data_fim,
        dias_corridos: formData.dias_corridos,
        dias_uteis: formData.dias_uteis,
        vendeu_abono: formData.vendeu_abono,
        dias_abono: formData.vendeu_abono ? formData.dias_abono : 0,
        pagamento_modalidade: formData.pagamento_modalidade,
        observacoes: formData.observacoes || undefined,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erro ao programar férias');
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepTitles = {
    1: 'Selecione o Período Aquisitivo',
    2: 'Datas de Férias',
    3: 'Abono Pecuniário',
    4: 'Confirmação e Valores',
    5: 'Observações',
    6: 'Revisão Final',
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-between mb-6">
      {[1, 2, 3, 4, 5, 6].map((step) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
              step === currentStep
                ? 'bg-violet-600 text-white scale-110'
                : step < currentStep
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-800 text-slate-500'
            }`}
          >
            {step < currentStep ? <Check size={16} /> : step}
          </div>
          {step < 6 && (
            <div
              className={`w-8 md:w-12 h-0.5 mx-1 ${
                step < currentStep ? 'bg-emerald-600' : 'bg-slate-800'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  const renderStep1 = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Selecione qual período aquisitivo será usado para programar as férias.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-violet-500 rounded-full animate-spin" />
        </div>
      ) : periodos.length === 0 ? (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
            <AlertCircle size={16} className="inline mr-2" />
            Nenhum período aquisitivo disponível para este colaborador.
          </div>
          <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
            <div className="text-xs text-slate-400 mb-3">
              Se este colaborador e CLT e possui data de admissao, voce pode gerar os periodos automaticamente.
            </div>
            <Button
              onClick={handleGerarPeriodos}
              disabled={isGeneratingPeriodos}
              variant="primary"
              className="w-full !justify-center"
            >
              {isGeneratingPeriodos ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Gerando periodos...
                </>
              ) : (
                'Gerar periodos aquisitivos'
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {periodos.map((periodo) => {
            const diasAteVencimento = Math.ceil(
              (new Date(periodo.concessivo_fim).getTime() - new Date().getTime()) /
                (1000 * 60 * 60 * 24)
            );

            return (
              <label
                key={periodo.id}
                className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  formData.periodo_aquisitivo_id === periodo.id
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="periodo"
                  value={periodo.id}
                  checked={formData.periodo_aquisitivo_id === periodo.id}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, periodo_aquisitivo_id: e.target.value }))
                  }
                  className="sr-only"
                />
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-bold text-slate-200 mb-1">
                      Período {new Date(periodo.data_inicio).getFullYear()}-
                      {new Date(periodo.data_fim).getFullYear()}
                    </div>
                    <div className="text-xs text-slate-400 space-y-0.5">
                      <div>
                        Aquisitivo: {new Date(periodo.data_inicio).toLocaleDateString('pt-BR')}{' '}
                        a {new Date(periodo.data_fim).toLocaleDateString('pt-BR')}
                      </div>
                      <div>
                        Concessivo: vence em{' '}
                        {new Date(periodo.concessivo_fim).toLocaleDateString('pt-BR')}
                        {diasAteVencimento >= 0 && ` (${diasAteVencimento} dias)`}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge
                      variant={
                        periodo.esta_vencido
                          ? 'danger'
                          : diasAteVencimento <= 30
                          ? 'warning'
                          : 'success'
                      }
                    >
                      {periodo.dias_saldo} dias
                    </Badge>
                    {periodo.esta_vencido && (
                      <span className="text-[10px] text-rose-400 font-bold">VENCIDO</span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Selecione as datas de início e fim das férias.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Data de Início
          </label>
          <DatePicker
            value={formData.data_inicio}
            onChange={(value) => setFormData((prev) => ({ ...prev, data_inicio: value }))}
            placeholder="Selecione..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Data de Fim</label>
          <DatePicker
            value={formData.data_fim}
            onChange={(value) => setFormData((prev) => ({ ...prev, data_fim: value }))}
            placeholder="Selecione..."
          />
        </div>
      </div>

      {formData.data_inicio && formData.data_fim && (
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Dias corridos:</span>
            <span className="font-bold text-slate-200">{formData.dias_corridos} dias</span>
          </div>
          {periodoSelecionado && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Saldo restante:</span>
              <span className="font-bold text-cyan-400">
                {periodoSelecionado.dias_saldo - formData.dias_corridos} dias
              </span>
            </div>
          )}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-400">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span className="text-xs font-bold">{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 mb-4">
        O colaborador pode vender até 1/3 das férias (abono pecuniário).
      </p>

      <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
        <div className="flex items-start gap-2 text-sm text-cyan-300">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-bold mb-1">ℹ️ Abono Pecuniário</div>
            <div className="text-xs text-cyan-300/70">
              O colaborador pode converter até 10 dias de férias (1/3 de 30) em dinheiro. O
              valor inclui o salário dos dias vendidos + 1/3 constitucional.
            </div>
          </div>
        </div>
      </div>

      <label className="flex items-center gap-3 p-4 rounded-xl border-2 border-slate-800 bg-slate-900/40 cursor-pointer hover:border-slate-700 transition-all">
        <input
          type="checkbox"
          checked={formData.vendeu_abono}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              vendeu_abono: e.target.checked,
              dias_abono: e.target.checked ? maxAbonoDias(periodoSelecionado?.dias_direito, prev.dias_corridos) : 0,
            }))
          }
          className="w-5 h-5 rounded border-2 border-slate-700 text-violet-600 focus:ring-2 focus:ring-violet-500"
        />
        <span className="text-sm font-medium text-slate-200">
          Sim, desejo vender parte das férias (abono pecuniário)
        </span>
      </label>

      {formData.vendeu_abono && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Quantidade de dias a vender (máximo {maxAbonoDias(periodoSelecionado?.dias_direito, formData.dias_corridos)})
          </label>
          <input
            type="number"
            min="1"
            max={maxAbonoDias(periodoSelecionado?.dias_direito, formData.dias_corridos)}
            value={formData.dias_abono}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, dias_abono: Number(e.target.value) }))
            }
            className="w-full px-4 py-2.5 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-violet-500/50"
          />
          <div className="text-xs text-slate-500 mt-1">
            Dias de férias descontados: {formData.dias_abono} | Dias de descanso: {formData.dias_corridos - formData.dias_abono}
          </div>
        </div>
      )}
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 mb-4">
        Confira os valores calculados para as férias.
      </p>

      <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800">
        <div className="text-sm font-black text-slate-100 mb-2">Modalidade de Pagamento</div>
        <div className="text-xs text-slate-400 mb-3">
          O adicional de 1/3 e sempre um valor a mais. Aqui você registra se o pagamento foi completo ou somente do adicional.
        </div>
        <div className="space-y-2">
          <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/30 border border-slate-800 cursor-pointer">
            <input
              type="radio"
              name="pagamento_modalidade"
              checked={formData.pagamento_modalidade === 'completo'}
              onChange={() => setFormData((p) => ({ ...p, pagamento_modalidade: 'completo' }))}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="text-sm font-bold text-slate-200">Completo (férias + 1/3)</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Recomendado quando o pagamento de férias é adiantado conforme prática padrão.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/30 border border-slate-800 cursor-pointer">
            <input
              type="radio"
              name="pagamento_modalidade"
              checked={formData.pagamento_modalidade === 'somente_terco'}
              onChange={() => setFormData((p) => ({ ...p, pagamento_modalidade: 'somente_terco' }))}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="text-sm font-bold text-slate-200">Somente adicional de 1/3</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Útil quando vocês evitam adiantar o valor base das férias para não “sumir salário” no mês seguinte.
              </div>
            </div>
          </label>
        </div>
      </div>

      {valorCalculado ? (
        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/30">
            <div className="text-xs text-violet-400 mb-1">Valor sugerido para pagamento</div>
            <div className="text-2xl font-black text-violet-300">
              {(
                formData.pagamento_modalidade === 'somente_terco'
                  ? valorCalculado.valor_terco +
                    (formData.vendeu_abono && formData.dias_abono > 0 ? valorCalculado.valor_abono : 0)
                  : valorCalculado.valor_total
              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {formData.pagamento_modalidade === 'somente_terco'
                ? '1/3 constitucional' + (formData.vendeu_abono ? ' + abono (se houver)' : '')
                : 'Férias + 1/3' + (formData.vendeu_abono ? ' + abono (se houver)' : '')}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="text-xs text-slate-500 mb-2">Salário Base</div>
            <div className="text-2xl font-bold text-slate-200">
              {valorCalculado.salario_base.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 text-sm">
              <span className="text-slate-400">Férias ({formData.dias_corridos} dias)</span>
              <span className="font-bold text-slate-200">
                {valorCalculado.valor_ferias.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 text-sm">
              <span className="text-slate-400">1/3 Constitucional</span>
              <span className="font-bold text-slate-200">
                {valorCalculado.valor_terco.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>

            {formData.vendeu_abono && formData.dias_abono > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-sm">
                <span className="text-emerald-400">Abono ({formData.dias_abono} dias)</span>
                <span className="font-bold text-emerald-400">
                  {valorCalculado.valor_abono.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </span>
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/30">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-violet-400 mb-1">Total a Pagar</div>
                <div className="text-3xl font-black text-violet-400">
                  {valorCalculado.valor_total.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </div>
              </div>
              <DollarSign size={32} className="text-violet-400" />
            </div>
          </div>

          {formData.data_inicio && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm">
              <div className="flex items-start gap-2 text-amber-400">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">⏰ Prazo de Pagamento</div>
                  <div className="text-xs text-amber-300/70 mt-1">
                    As férias devem ser pagas até{' '}
                    <strong>
                      {calcularDataLimitePagamento(parseISODate(formData.data_inicio)).toLocaleDateString('pt-BR')}
                    </strong>{' '}
                    (2 dias antes do início)
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-slate-600 border-t-violet-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 mb-4">
        Adicione observações ou justificativas (opcional).
      </p>

      <textarea
        value={formData.observacoes}
        onChange={(e) => setFormData((prev) => ({ ...prev, observacoes: e.target.value }))}
        placeholder="Ex: Férias programadas conforme solicitação do colaborador..."
        rows={5}
        className="w-full px-4 py-3 bg-slate-900/40 border border-slate-800 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-violet-500/50 resize-none"
      />
    </div>
  );

  const renderStep6 = () => (
    <div className="space-y-4">
      <p className="text-sm text-slate-400 mb-4">
        Revise todas as informações antes de confirmar a programação.
      </p>

      <div className="space-y-3">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs text-slate-500 mb-1">Colaborador</div>
          <div className="font-bold text-slate-200">{colaborador.nome}</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs text-slate-500 mb-1">Período</div>
          <div className="font-bold text-slate-200">
            {formData.data_inicio &&
              new Date(formData.data_inicio).toLocaleDateString('pt-BR')}{' '}
            até{' '}
            {formData.data_fim && new Date(formData.data_fim).toLocaleDateString('pt-BR')}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {formData.dias_corridos} dias corridos
          </div>
        </div>

        {formData.vendeu_abono && (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <div className="text-xs text-emerald-400 mb-1">Abono Pecuniário</div>
            <div className="font-bold text-emerald-400">
              {formData.dias_abono} dias vendidos
            </div>
          </div>
        )}

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="text-xs text-slate-500 mb-1">Modalidade de Pagamento</div>
          <div className="font-bold text-slate-200">
            {formData.pagamento_modalidade === 'somente_terco'
              ? 'Somente adicional de 1/3'
              : 'Completo (férias + 1/3)'}
          </div>
        </div>

        {valorCalculado && (
          <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/30">
            <div className="text-xs text-violet-400 mb-1">Valor Total</div>
            <div className="text-2xl font-bold text-violet-400">
              {valorCalculado.valor_total.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL',
              })}
            </div>
          </div>
        )}

        {formData.observacoes && (
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
            <div className="text-xs text-slate-500 mb-1">Observações</div>
            <div className="text-sm text-slate-300">{formData.observacoes}</div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-100 flex items-center gap-2">
              <Calendar size={24} className="text-violet-400" />
              Programar Férias
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              {stepTitles[currentStep]} ({currentStep}/6)
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-300 hover:bg-slate-800 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2">
            <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-bold text-rose-400">Erro</div>
              <div className="text-xs text-rose-300/70 mt-0.5">{error}</div>
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="mb-6">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
          {currentStep === 4 && renderStep4()}
          {currentStep === 5 && renderStep5()}
          {currentStep === 6 && renderStep6()}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <Button
            onClick={handleBack}
            disabled={currentStep === 1}
            variant="outline"
            className="!px-6"
          >
            <ChevronLeft size={16} />
            Voltar
          </Button>

          {currentStep < 6 ? (
            <Button
              onClick={handleNext}
              disabled={isLoading || periodos.length === 0}
              variant="primary"
              className="!px-6"
            >
              Próximo
              <ChevronRight size={16} />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              variant="primary"
              className="!px-6"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Programando...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Confirmar Programação
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
};
