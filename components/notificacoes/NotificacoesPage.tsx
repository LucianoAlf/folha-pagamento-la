import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Card, CustomSelect, TimeSelect, ToggleSwitch, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import { Bell, Calendar, ClipboardCheck, CreditCard, Send, Loader2, Save, Smartphone, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import type { NotificacaoConfig } from '../../types/agenda';
import { fetchNotificacaoConfig, upsertNotificacaoConfig } from '../../services/agendaService';
import { supabase } from '../../services/supabase';

export const NotificacoesPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mobile detection (reactive)
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const handleChange = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(e.matches);
    };
    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Accordion state (mobile only)
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('notificacoes:accordion');
      return stored ? JSON.parse(stored) : { whatsapp: true, agenda: false, rh: false, contas: false, folha: false, ferias: false };
    } catch {
      return { whatsapp: true, agenda: false, rh: false, contas: false, folha: false, ferias: false };
    }
  });

  const toggleAccordion = (key: string) => {
    setAccordionOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('notificacoes:accordion', JSON.stringify(next));
      return next;
    });
  };

  const [config, setConfig] = useState<Partial<NotificacaoConfig>>({
    whatsapp_ativo: false,
    whatsapp_numero: '',

    agenda_lembrete_tarefas_ativo: true,
    agenda_lembrete_aniversarios_ativo: true,
    lembrete_padrao_minutos: 30,
    rh_agenda_lembrete_processos_ativo: true,
    rh_agenda_lembrete_processos_minutos: 1440,
    rh_agenda_lembrete_etapas_ativo: true,
    rh_agenda_lembrete_etapas_minutos: 1440,
    rh_agenda_lembrete_pdi_ativo: true,
    rh_agenda_lembrete_pdi_minutos: 1440,

    resumo_diario_ativo: true,
    resumo_diario_hora: '08:00',

    resumo_semanal_ativo: false,
    resumo_semanal_dia: 'domingo',
    resumo_semanal_hora: '20:00',

    contas_alerta_3d: false,
    contas_alerta_1d: false,
    contas_alerta_no_dia: false,
    contas_alerta_hora: '08:00',
    contas_resumo_semanal_ativo: false,
    contas_resumo_semanal_dia: 'segunda',
    contas_resumo_semanal_hora: '08:00',

    folha_alerta_fechamento_ativo: false,
    folha_alerta_fechamento_dia: 25,
    folha_alerta_aprovacao_pendente_ativo: false,

    ferias_alerta_vencimento_multa: true,
    ferias_alerta_concessivo_critico: true,
    ferias_alerta_concessivo_dias: 60,
    ferias_alerta_pagamento_pendente: true,
    ferias_alerta_aquisitivo_prox: false,
    ferias_alerta_aquisitivo_dias: 30,
    ferias_resumo_mensal_ativo: false,
    ferias_resumo_mensal_dia: 1,
    ferias_resumo_mensal_hora: 8,
  });

  // Padrão do sistema: Card “dark” com borda (como usamos no resto do app)
  // OBS: quando usamos bg-slate-* o componente Card não aplica borda padrão automaticamente.
  const cardClass = 'bg-slate-950/85 border border-slate-800/70 backdrop-blur-none';

  const diasSemana = useMemo(
    () => [
      { value: 'segunda', label: 'Segunda' },
      { value: 'terca', label: 'Terça' },
      { value: 'quarta', label: 'Quarta' },
      { value: 'quinta', label: 'Quinta' },
      { value: 'sexta', label: 'Sexta' },
      { value: 'sabado', label: 'Sábado' },
      { value: 'domingo', label: 'Domingo' },
    ],
    []
  );

  const lembreteOptions = useMemo(
    () => [
      { value: '0', label: 'Sem lembrete' },
      { value: '10', label: '10 minutos antes' },
      { value: '15', label: '15 minutos antes' },
      { value: '30', label: '30 minutos antes' },
      { value: '60', label: '1 hora antes' },
      { value: '180', label: '3 horas antes' },
      { value: '1440', label: '1 dia antes' },
    ],
    []
  );

  useEffect(() => {
    setLoading(true);
    fetchNotificacaoConfig()
      .then((row) => {
        if (row) {
          // não expor google_refresh_token
          const { google_refresh_token: _ignored, ...safe } = row as any;
          setConfig((prev) => ({ ...prev, ...safe }));
        }
      })
      .catch((e: any) => setError(e?.message || 'Falha ao carregar configurações'))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const { google_refresh_token: _ignored, ...safe } = config as any;
      const savedRow = await upsertNotificacaoConfig(safe);
      const { google_refresh_token: _ignored2, ...safeSaved } = savedRow as any;
      setConfig(safeSaved);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  // WhatsApp: envio de teste
  const [waTesting, setWaTesting] = useState(false);
  const [waTestStatus, setWaTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [waTestMsg, setWaTestMsg] = useState<string>('');

  const handleTesteWhatsApp = async () => {
    const numero = String(config?.whatsapp_numero || '').trim();
    if (!numero) {
      setWaTestStatus('error');
      setWaTestMsg('Configure o número primeiro.');
      return;
    }
    if (!config?.whatsapp_ativo) {
      setWaTestStatus('error');
      setWaTestMsg('Ative o WhatsApp primeiro.');
      return;
    }

    setWaTesting(true);
    setWaTestStatus('idle');
    setWaTestMsg('');
    try {
      const mensagem = `✅ *TESTE LA MUSIC*\n\nSeu WhatsApp está configurado corretamente!\n\n🔔 Você receberá lembretes aqui\n\n_${new Date().toLocaleString('pt-BR')}_`;
      const { data, error } = await supabase.functions.invoke('whatsapp-send', {
        body: { numero, mensagem },
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'Falha ao enviar mensagem');

      setWaTestStatus('success');
      setWaTestMsg('Mensagem de teste enviada!');
      setTimeout(() => {
        setWaTestStatus('idle');
        setWaTestMsg('');
      }, 2500);
    } catch (e: any) {
      setWaTestStatus('error');
      setWaTestMsg(e?.message || 'Falha ao enviar');
    } finally {
      setWaTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Carregando notificações…</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto px-0 pb-24 lg:pb-0">
      {/* Mobile Premium Header Card */}
      {isMobile ? (
        <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
          <Card className="p-4 bg-slate-900/40 border border-slate-800/60">
            <div className="flex items-center gap-3 mb-1">
              <Bell className="w-5 h-5 text-violet-400" />
              <h2 className="text-xl font-black text-white leading-tight">Central de Notificações</h2>
            </div>
            <p className="text-sm text-slate-500 font-medium mt-1 leading-snug">
              Configure alertas automáticos por WhatsApp para todos os módulos do sistema.
            </p>
          </Card>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-violet-400" />
              <h2 className="text-2xl font-black text-white">Configurações de Notificações</h2>
            </div>
            <p className="text-sm text-slate-500 font-bold mt-1">
              Centralize WhatsApp, Agenda e alertas automáticos por módulo (com overrides por item quando necessário).
            </p>
          </div>

          <div className="flex items-center gap-2">
            {saved ? <Badge variant="success">Salvo</Badge> : null}
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all',
                'bg-violet-600/90 hover:bg-violet-600 border-violet-500/40 text-white font-black shadow-lg shadow-violet-600/10',
                saving && 'opacity-70 cursor-not-allowed'
              )}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <div className="mb-6">
          <Card className={cn('p-4 border-rose-500/30 bg-rose-500/10')}>
            <div className="text-rose-200 font-bold">Erro</div>
            <div className="text-rose-200/80 text-sm mt-1">{error}</div>
          </Card>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6">
        {/* WhatsApp */}
        <Card className={cn('p-0 overflow-hidden', cardClass, 'bg-slate-950/95')}>
          <div
            role={isMobile ? 'button' : undefined}
            tabIndex={isMobile ? 0 : -1}
            onClick={() => isMobile && toggleAccordion('whatsapp')}
            onKeyDown={(e) => {
              if (!isMobile) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleAccordion('whatsapp');
              }
            }}
            className={cn(
              'w-full px-6 py-4 border-b border-slate-800/70 flex items-center justify-between',
              isMobile && 'cursor-pointer active:bg-slate-900/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-emerald-300" />
              </div>
              <div className="text-left">
                <div className="text-white font-black">WhatsApp</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Canal de envio</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isMobile && <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Ativo</div>}
              <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                <ToggleSwitch
                  checked={!!config.whatsapp_ativo}
                  onCheckedChange={(next) => setConfig((prev) => ({ ...prev, whatsapp_ativo: next }))}
                  variant="emerald"
                  ariaLabel="Ativar WhatsApp"
                />
              </div>
              {isMobile && (
                accordionOpen.whatsapp ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />
              )}
            </div>
          </div>
          {(!isMobile || accordionOpen.whatsapp) && (
            <div className="divide-y divide-slate-800/60">
              <div className="px-6 py-5 space-y-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Número</div>
                  <input
                    value={String(config.whatsapp_numero || '')}
                    onChange={(e) => setConfig((prev) => ({ ...prev, whatsapp_numero: e.target.value }))}
                    placeholder="55DDDNUMERO"
                    className="w-full px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-200 outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  {waTestStatus !== 'idle' ? (
                    <div
                      className={cn(
                        'mt-2 text-xs font-bold',
                        waTestStatus === 'success' ? 'text-emerald-300' : 'text-rose-300'
                      )}
                    >
                      {waTestMsg}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleTesteWhatsApp}
                  disabled={waTesting || !config.whatsapp_ativo || !String(config.whatsapp_numero || '').trim()}
                  className={cn(
                    'inline-flex items-center gap-2 px-5 py-3 rounded-xl border transition-all w-full justify-center',
                    'bg-emerald-600/90 hover:bg-emerald-600 border-emerald-500/30 text-white font-black',
                    'disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {waTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {waTesting ? 'Enviando…' : 'Enviar teste'}
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Agenda */}
        <Card className={cn('p-0 overflow-hidden', cardClass)}>
          <button
            type="button"
            onClick={() => isMobile && toggleAccordion('agenda')}
            className={cn(
              'w-full px-6 py-4 border-b border-slate-800/70 flex items-center justify-between',
              isMobile && 'active:bg-slate-900/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-violet-300" />
              </div>
              <div className="text-left">
                <div className="text-white font-black">Agenda</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Lembretes e resumos</div>
              </div>
            </div>
            {isMobile && (
              accordionOpen.agenda ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />
            )}
          </button>
          {(!isMobile || accordionOpen.agenda) && (
            <div className="divide-y divide-slate-800/60">
              <div className="px-6 py-5 space-y-6">
                {/* Lembrete de tarefas */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">Lembrete de tarefas</div>
                    <ToggleSwitch
                      checked={config.agenda_lembrete_tarefas_ativo !== false}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, agenda_lembrete_tarefas_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar lembrete de tarefas"
                    />
                  </div>
                  <div className="w-full">
                    <CustomSelect
                      value={String(config.lembrete_padrao_minutos ?? 30)}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, lembrete_padrao_minutos: Number(v) }))}
                      options={lembreteOptions}
                      className={cn(config.agenda_lembrete_tarefas_ativo === false && 'opacity-60 pointer-events-none')}
                    />
                  </div>
                </div>

                {/* Lembrete de aniversários */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-slate-300 font-black">Lembrete de aniversários</div>
                      <div className="text-xs text-slate-500 font-bold mt-0.5">Conforme configuração de cada aniversário</div>
                    </div>
                    <ToggleSwitch
                      checked={config.agenda_lembrete_aniversarios_ativo !== false}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, agenda_lembrete_aniversarios_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar lembrete de aniversários"
                    />
                  </div>
                </div>

                {/* Resumo diário */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">Resumo diário</div>
                    <ToggleSwitch
                      checked={!!config.resumo_diario_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, resumo_diario_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar resumo diário"
                    />
                  </div>
                  <TimeSelect
                    value={String(config.resumo_diario_hora || '08:00')}
                    onValueChange={(v) => setConfig((prev) => ({ ...prev, resumo_diario_hora: v }))}
                    stepMinutes={30}
                    className="w-full"
                    disabled={!config.resumo_diario_ativo}
                  />
                </div>

                {/* Resumo semanal */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">Resumo semanal</div>
                    <ToggleSwitch
                      checked={!!config.resumo_semanal_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, resumo_semanal_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar resumo semanal"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <CustomSelect
                      value={String(config.resumo_semanal_dia || 'domingo')}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, resumo_semanal_dia: v }))}
                      options={diasSemana}
                      className={cn(!config.resumo_semanal_ativo && 'opacity-60 pointer-events-none')}
                    />
                    <TimeSelect
                      value={String(config.resumo_semanal_hora || '20:00')}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, resumo_semanal_hora: v }))}
                      stepMinutes={30}
                      className="w-full"
                      disabled={!config.resumo_semanal_ativo}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Jornada RH */}
        <Card className={cn('p-0 overflow-hidden', cardClass)}>
          <button
            type="button"
            onClick={() => isMobile && toggleAccordion('rh')}
            className={cn(
              'w-full px-6 py-4 border-b border-slate-800/70 flex items-center justify-between',
              isMobile && 'active:bg-slate-900/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-fuchsia-300" />
              </div>
              <div className="text-left">
                <div className="text-white font-black">Jornada RH</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Agenda e lembretes da Ana</div>
              </div>
            </div>
            {isMobile && (
              accordionOpen.rh ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />
            )}
          </button>
          {(!isMobile || accordionOpen.rh) && (
            <div className="divide-y divide-slate-800/60">
              <div className="px-6 py-5 space-y-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/25 px-4 py-3">
                  <div className="text-sm text-slate-200 font-black">Espelhamento automatico na Agenda</div>
                  <div className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                    Tudo o que for agendado na Jornada RH continua aparecendo na Agenda da Ana. Aqui voce configura a antecedencia dos lembretes desses espelhos.
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-slate-300 font-black">Processos RH</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">Recrutamento, onboarding e desligamento.</div>
                    </div>
                    <ToggleSwitch
                      checked={config.rh_agenda_lembrete_processos_ativo !== false}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_processos_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar lembrete para processos da Jornada RH"
                    />
                  </div>
                  <CustomSelect
                    value={String(config.rh_agenda_lembrete_processos_minutos ?? 1440)}
                    onValueChange={(value) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_processos_minutos: Number(value) }))}
                    options={lembreteOptions}
                    className={cn(config.rh_agenda_lembrete_processos_ativo === false && 'opacity-60 pointer-events-none')}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-slate-300 font-black">Etapas da Jornada</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">Entrevistas, boas-vindas, treinamentos e tarefas operacionais.</div>
                    </div>
                    <ToggleSwitch
                      checked={config.rh_agenda_lembrete_etapas_ativo !== false}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_etapas_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar lembrete para etapas da Jornada RH"
                    />
                  </div>
                  <CustomSelect
                    value={String(config.rh_agenda_lembrete_etapas_minutos ?? 1440)}
                    onValueChange={(value) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_etapas_minutos: Number(value) }))}
                    options={lembreteOptions}
                    className={cn(config.rh_agenda_lembrete_etapas_ativo === false && 'opacity-60 pointer-events-none')}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-slate-300 font-black">Checkpoints de PDI</div>
                      <div className="text-xs text-slate-500 font-medium mt-0.5">Acompanhamentos de 30, 60, 90 dias e ciclos do desenvolvimento.</div>
                    </div>
                    <ToggleSwitch
                      checked={config.rh_agenda_lembrete_pdi_ativo !== false}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_pdi_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar lembrete para checkpoints de PDI"
                    />
                  </div>
                  <CustomSelect
                    value={String(config.rh_agenda_lembrete_pdi_minutos ?? 1440)}
                    onValueChange={(value) => setConfig((prev) => ({ ...prev, rh_agenda_lembrete_pdi_minutos: Number(value) }))}
                    options={lembreteOptions}
                    className={cn(config.rh_agenda_lembrete_pdi_ativo === false && 'opacity-60 pointer-events-none')}
                  />
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/25 px-4 py-3">
                  <div className="text-sm text-slate-200 font-black">WhatsApp da Jornada RH</div>
                  <div className="mt-1 text-xs text-slate-500 font-medium leading-relaxed">
                    O canal de WhatsApp continua sendo configurado acima. Dentro da Jornada RH, cada etapa pode marcar se deve avisar os responsaveis e o colaborador.
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Contas a pagar */}
        <Card className={cn('p-0 overflow-hidden', cardClass)}>
          <button
            type="button"
            onClick={() => isMobile && toggleAccordion('contas')}
            className={cn(
              'w-full px-6 py-4 border-b border-slate-800/70 flex items-center justify-between',
              isMobile && 'active:bg-slate-900/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-cyan-300" />
              </div>
              <div className="text-left">
                <div className="text-white font-black">Contas a Pagar</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Alertas e resumo</div>
              </div>
            </div>
            {isMobile && (
              accordionOpen.contas ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />
            )}
          </button>
          {(!isMobile || accordionOpen.contas) && (
            <div className="divide-y divide-slate-800/60">
              <div className="px-6 py-5 space-y-6">
                {/* Alertas por vencimento */}
                <div className="space-y-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-3">
                    Alertas por vencimento
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/25 px-4 py-3">
                      <div className="text-sm text-slate-200 font-black whitespace-nowrap">3 dias antes</div>
                      <ToggleSwitch
                        checked={!!config.contas_alerta_3d}
                        onCheckedChange={(next) => setConfig((prev) => ({ ...prev, contas_alerta_3d: next }))}
                        variant="cyan"
                        size="sm"
                        ariaLabel="Ativar alerta 3 dias antes"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/25 px-4 py-3">
                      <div className="text-sm text-slate-200 font-black whitespace-nowrap">1 dia antes</div>
                      <ToggleSwitch
                        checked={!!config.contas_alerta_1d}
                        onCheckedChange={(next) => setConfig((prev) => ({ ...prev, contas_alerta_1d: next }))}
                        variant="cyan"
                        size="sm"
                        ariaLabel="Ativar alerta 1 dia antes"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/25 px-4 py-3">
                      <div className="text-sm text-slate-200 font-black whitespace-nowrap">No dia</div>
                      <ToggleSwitch
                        checked={!!config.contas_alerta_no_dia}
                        onCheckedChange={(next) => setConfig((prev) => ({ ...prev, contas_alerta_no_dia: next }))}
                        variant="cyan"
                        size="sm"
                        ariaLabel="Ativar alerta no dia"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] shrink-0">Horário</div>
                    <TimeSelect
                      value={String(config.contas_alerta_hora || '08:00')}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, contas_alerta_hora: v }))}
                      stepMinutes={30}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Resumo semanal */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">Resumo semanal de contas</div>
                    <ToggleSwitch
                      checked={!!config.contas_resumo_semanal_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, contas_resumo_semanal_ativo: next }))}
                      variant="cyan"
                      ariaLabel="Ativar resumo semanal de contas"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <CustomSelect
                      value={String(config.contas_resumo_semanal_dia || 'segunda')}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, contas_resumo_semanal_dia: v }))}
                      options={diasSemana}
                      className={cn(!config.contas_resumo_semanal_ativo && 'opacity-60 pointer-events-none')}
                    />
                    <TimeSelect
                      value={String(config.contas_resumo_semanal_hora || '08:00')}
                      onValueChange={(v) => setConfig((prev) => ({ ...prev, contas_resumo_semanal_hora: v }))}
                      stepMinutes={30}
                      className="w-full"
                      disabled={!config.contas_resumo_semanal_ativo}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Folha */}
        <Card className={cn('p-0 overflow-hidden', cardClass)}>
          <button
            type="button"
            onClick={() => isMobile && toggleAccordion('folha')}
            className={cn(
              'w-full px-6 py-4 border-b border-slate-800/70 flex items-center justify-between',
              isMobile && 'active:bg-slate-900/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-300" />
              </div>
              <div className="text-left">
                <div className="text-white font-black">Folha de Pagamento</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Alertas operacionais</div>
              </div>
            </div>
            {isMobile && (
              accordionOpen.folha ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />
            )}
          </button>
          {(!isMobile || accordionOpen.folha) && (
            <div className="divide-y divide-slate-800/60">
              <div className="px-6 py-5 space-y-6">
                {/* Alerta de fechamento */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">Alerta de fechamento</div>
                    <ToggleSwitch
                      checked={!!config.folha_alerta_fechamento_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, folha_alerta_fechamento_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar alerta de fechamento"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Dia</div>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={Number(config.folha_alerta_fechamento_dia ?? 25)}
                      onChange={(e) => setConfig((prev) => ({ ...prev, folha_alerta_fechamento_dia: Number(e.target.value || 25) }))}
                      className={cn(
                        'w-full px-3 py-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-200 outline-none',
                        !config.folha_alerta_fechamento_ativo && 'opacity-60 pointer-events-none'
                      )}
                    />
                  </div>
                </div>

                {/* Alerta de aprovação pendente */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">Alerta de aprovação pendente</div>
                    <ToggleSwitch
                      checked={!!config.folha_alerta_aprovacao_pendente_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, folha_alerta_aprovacao_pendente_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar alerta de aprovação pendente"
                    />
                  </div>
                  <div className="text-xs text-slate-500 font-medium leading-relaxed">
                    Envia quando existir folha em status <span className="text-slate-300 font-bold">pendente</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Férias CLT */}
        <Card className={cn('p-0 overflow-hidden', cardClass)}>
          <button
            type="button"
            onClick={() => isMobile && toggleAccordion('ferias')}
            className={cn(
              'w-full px-6 py-4 border-b border-slate-800/70 flex items-center justify-between',
              isMobile && 'active:bg-slate-900/40 transition-colors'
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-violet-300" />
              </div>
              <div className="text-left">
                <div className="text-white font-black">Férias CLT</div>
                <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Alertas de vencimento</div>
              </div>
            </div>
            {isMobile && (
              accordionOpen.ferias ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />
            )}
          </button>
          {(!isMobile || accordionOpen.ferias) && (
            <div className="divide-y divide-slate-800/60">
              <div className="px-6 py-5 space-y-6">
                {/* Alerta de férias vencidas (CRÍTICO) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">🚨 Férias vencidas (MULTA)</div>
                    <ToggleSwitch
                      checked={!!config.ferias_alerta_vencimento_multa}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, ferias_alerta_vencimento_multa: next }))}
                      variant="rose"
                      ariaLabel="Ativar alerta de férias vencidas"
                    />
                  </div>
                  <div className="text-xs text-slate-500 font-medium leading-relaxed">
                    Alerta CRÍTICO quando período concessivo vencer. Férias devem ser pagas em <span className="text-rose-400 font-bold">DOBRO</span>.
                  </div>
                </div>

                {/* Alerta de concessivo próximo de vencer */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">⏰ Período concessivo próximo</div>
                    <ToggleSwitch
                      checked={!!config.ferias_alerta_concessivo_critico}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, ferias_alerta_concessivo_critico: next }))}
                      variant="amber"
                      ariaLabel="Ativar alerta de concessivo próximo"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Alertar com</div>
                    <input
                      type="number"
                      min={7}
                      max={90}
                      value={Number(config.ferias_alerta_concessivo_dias ?? 60)}
                      onChange={(e) => setConfig((prev) => ({ ...prev, ferias_alerta_concessivo_dias: Number(e.target.value || 60) }))}
                      className={cn(
                        'w-20 px-3 py-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-200 outline-none',
                        !config.ferias_alerta_concessivo_critico && 'opacity-60 pointer-events-none'
                      )}
                    />
                    <div className="text-xs text-slate-500 font-medium">dias de antecedência</div>
                  </div>
                </div>

                {/* Alerta de pagamento pendente */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">💳 Pagamento pendente</div>
                    <ToggleSwitch
                      checked={!!config.ferias_alerta_pagamento_pendente}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, ferias_alerta_pagamento_pendente: next }))}
                      variant="violet"
                      ariaLabel="Ativar alerta de pagamento pendente"
                    />
                  </div>
                  <div className="text-xs text-slate-500 font-medium leading-relaxed">
                    Alerta quando férias programadas estiverem próximas e pagamento não foi efetuado (prazo: 2 dias antes).
                  </div>
                </div>

                {/* Alerta de período aquisitivo próximo */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">📅 Período aquisitivo próximo</div>
                    <ToggleSwitch
                      checked={!!config.ferias_alerta_aquisitivo_prox}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, ferias_alerta_aquisitivo_prox: next }))}
                      variant="cyan"
                      ariaLabel="Ativar alerta de período aquisitivo"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Alertar com</div>
                    <input
                      type="number"
                      min={7}
                      max={60}
                      value={Number(config.ferias_alerta_aquisitivo_dias ?? 30)}
                      onChange={(e) => setConfig((prev) => ({ ...prev, ferias_alerta_aquisitivo_dias: Number(e.target.value || 30) }))}
                      className={cn(
                        'w-20 px-3 py-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-200 outline-none',
                        !config.ferias_alerta_aquisitivo_prox && 'opacity-60 pointer-events-none'
                      )}
                    />
                    <div className="text-xs text-slate-500 font-medium">dias de antecedência</div>
                  </div>
                </div>

                {/* Resumo mensal */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-300 font-black">📊 Resumo mensal</div>
                    <ToggleSwitch
                      checked={!!config.ferias_resumo_mensal_ativo}
                      onCheckedChange={(next) => setConfig((prev) => ({ ...prev, ferias_resumo_mensal_ativo: next }))}
                      variant="violet"
                      ariaLabel="Ativar resumo mensal de férias"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Dia</div>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={Number(config.ferias_resumo_mensal_dia ?? 1)}
                        onChange={(e) => setConfig((prev) => ({ ...prev, ferias_resumo_mensal_dia: Number(e.target.value || 1) }))}
                        className={cn(
                          'w-full px-3 py-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-200 outline-none',
                          !config.ferias_resumo_mensal_ativo && 'opacity-60 pointer-events-none'
                        )}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Hora</div>
                      <input
                        type="number"
                        min={0}
                        max={23}
                        value={Number(config.ferias_resumo_mensal_hora ?? 8)}
                        onChange={(e) => setConfig((prev) => ({ ...prev, ferias_resumo_mensal_hora: Number(e.target.value || 8) }))}
                        className={cn(
                          'w-full px-3 py-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-slate-200 outline-none',
                          !config.ferias_resumo_mensal_ativo && 'opacity-60 pointer-events-none'
                        )}
                      />
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 font-medium leading-relaxed">
                    Resumo executivo com estatísticas gerais, situações críticas e próximas férias programadas.
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Sticky Save Bar (Mobile) */}
      {isMobile && (
        <div 
          className="fixed left-0 right-0 z-[10400] bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/70 p-4 animate-in slide-in-from-bottom-2 duration-300"
          style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border transition-all',
              'bg-violet-600/90 hover:bg-violet-600 active:scale-[0.98] border-violet-500/40 text-white font-black shadow-lg shadow-violet-600/20',
              saving && 'opacity-70 cursor-not-allowed'
            )}
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Salvando…
              </>
            ) : saved ? (
              <>
                <Save className="w-5 h-5" />
                Salvo ✓
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Salvar Alterações
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

