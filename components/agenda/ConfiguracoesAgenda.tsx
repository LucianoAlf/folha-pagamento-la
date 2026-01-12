import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Card, CustomSelect } from '../UI';
import { cn } from '../CollaboratorComponents';
import { Save, Smartphone, Calendar, Columns3, Eye, EyeOff, ChevronUp, ChevronDown, Sparkles, Image as ImageIcon, Wand2, Trash2, Send, Loader2 } from 'lucide-react';
import type { AgendaKanbanColumnConfig, NotificacaoConfig } from '../../types/agenda';
import { AGENDA_BG_PRESETS } from '../../types/agenda';
import { supabase } from '../../services/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../services/supabase';
import {
  fetchAgendaKanbanConfig,
  fetchNotificacaoConfig,
  upsertAgendaKanbanConfig,
  upsertNotificacaoConfig,
} from '../../services/agendaService';

export const ConfiguracoesAgenda: React.FC<{
  onSaved?: () => void;
}> = ({ onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [appearanceSaved, setAppearanceSaved] = useState(false);
  const [appearanceError, setAppearanceError] = useState<string | null>(null);

  const [bgPrompt, setBgPrompt] = useState('');
  const [bgGenerating, setBgGenerating] = useState(false);
  const [bgGenError, setBgGenError] = useState<string | null>(null);
  const [bgProvider, setBgProvider] = useState<'photo' | 'gemini'>('photo');

  const [kanbanLoading, setKanbanLoading] = useState(true);
  const [kanbanSaving, setKanbanSaving] = useState(false);
  const [kanbanSaved, setKanbanSaved] = useState(false);
  const [kanbanError, setKanbanError] = useState<string | null>(null);

  const [config, setConfig] = useState<Partial<NotificacaoConfig>>({
    whatsapp_ativo: false,
    whatsapp_numero: '',
    google_calendar_ativo: false,
    google_calendar_id: '',
    resumo_diario_ativo: true,
    resumo_diario_hora: '08:00',
    resumo_semanal_ativo: true,
    resumo_semanal_dia: 'domingo',
    resumo_semanal_hora: '20:00',
    lembrete_padrao_minutos: 30,
    agenda_bg_preset: 'classic-dark',
    agenda_bg_url: null,
  });

  const defaultKanbanColumns: AgendaKanbanColumnConfig[] = useMemo(
    () => [
      { key: 'pendente', label: 'Pendente', visible: true, order: 10 },
      { key: 'em_andamento', label: 'Em Andamento', visible: true, order: 20 },
      { key: 'concluida', label: 'Concluída', visible: true, order: 30 },
      { key: 'adiada', label: 'Adiada', visible: true, order: 40 },
    ],
    []
  );
  const [kanbanColumns, setKanbanColumns] = useState<AgendaKanbanColumnConfig[]>(defaultKanbanColumns);

  // Visual “padrão Agenda” (painel escuro), sem interferir no Card global do app
  // Importante: sem opacidade (o user pediu “normal”, sem transparência)
  const agendaCardClass = 'bg-slate-950/85 border-slate-800/70 backdrop-blur-none';

  // WhatsApp: envio de teste
  const [waTesting, setWaTesting] = useState(false);
  const [waTestStatus, setWaTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [waTestMsg, setWaTestMsg] = useState<string>('');

  useEffect(() => {
    setLoading(true);
    fetchNotificacaoConfig()
      .then((row) => {
        if (row) {
          // IMPORTANT: não expor google_refresh_token na UI
          const { google_refresh_token: _ignored, ...safe } = row as any;
          setConfig(safe);
        }
      })
      .catch((e: any) => setError(e?.message || 'Falha ao carregar configurações'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setKanbanLoading(true);
    fetchAgendaKanbanConfig()
      .then((row) => {
        const cols = (row?.columns || []) as any[];
        if (Array.isArray(cols) && cols.length) {
          const byKey: Record<string, AgendaKanbanColumnConfig> = {};
          cols.forEach((c) => {
            if (!c?.key) return;
            byKey[String(c.key)] = {
              key: c.key,
              label: String(c.label || ''),
              visible: c.visible !== false,
              order: Number(c.order || 0) || 0,
            } as any;
          });
          const merged = defaultKanbanColumns.map((d) => byKey[d.key] || d);
          setKanbanColumns(merged);
        } else {
          setKanbanColumns(defaultKanbanColumns);
        }
      })
      .catch((e: any) => setKanbanError(e?.message || 'Falha ao carregar Kanban'))
      .finally(() => setKanbanLoading(false));
  }, [defaultKanbanColumns]);

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

  const minutesOptions = useMemo(
    () => [
      { value: 0, label: 'Sem lembrete' },
      { value: 10, label: '10 minutos antes' },
      { value: 30, label: '30 minutos antes' },
      { value: 60, label: '1 hora antes' },
      { value: 180, label: '3 horas antes' },
      { value: 1440, label: '1 dia antes' },
    ],
    []
  );

  const minutesOptionsSelect = useMemo(
    () => minutesOptions.map((m) => ({ value: String(m.value), label: m.label })),
    [minutesOptions]
  );

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Nunca enviar refresh token pelo client
      const { google_refresh_token: _ignored, ...safe } = config as any;
      const savedRow = await upsertNotificacaoConfig(safe);
      const { google_refresh_token: _ignored2, ...safeSaved } = savedRow as any;
      setConfig(safeSaved);
      setSaved(true);
      // Fecha as configurações e volta para tarefas após salvar
      if (onSaved) {
        setTimeout(() => onSaved(), 600);
      } else {
        setTimeout(() => setSaved(false), 1500);
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

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
      const mensagem = `✅ *TESTE LA MUSIC*\n\nSeu WhatsApp está configurado corretamente!\n\n📅 Agenda funcionando\n🔔 Você receberá lembretes aqui\n\n_${new Date().toLocaleString('pt-BR')}_`;
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

  const saveAppearance = async (partial: Partial<NotificacaoConfig>) => {
    const merged = { ...(config || {}), ...(partial || {}) } as any;
    setConfig(merged);

    // Aplica instantaneamente (mesmo antes de salvar no banco) para feedback imediato.
    try {
      window.dispatchEvent(
        new CustomEvent('agenda:appearance', {
          detail: {
            preset: merged?.agenda_bg_preset ?? null,
            url: merged?.agenda_bg_url ?? null,
          },
        })
      );
    } catch {
      // ignore
    }

    setAppearanceSaving(true);
    setAppearanceSaved(false);
    setAppearanceError(null);
    try {
      const { google_refresh_token: _ignored, ...safe } = merged as any;
      const savedRow = await upsertNotificacaoConfig(safe);
      const { google_refresh_token: _ignored2, ...safeSaved } = savedRow as any;
      setConfig(safeSaved);

      // Re-dispara com o estado confirmado do banco (se tiver diferenças)
      window.dispatchEvent(
        new CustomEvent('agenda:appearance', {
          detail: {
            preset: (safeSaved as any)?.agenda_bg_preset ?? null,
            url: (safeSaved as any)?.agenda_bg_url ?? null,
          },
        })
      );

      setAppearanceSaved(true);
      setTimeout(() => setAppearanceSaved(false), 1500);
    } catch (e: any) {
      setAppearanceError(e?.message || 'Falha ao salvar aparência');
    } finally {
      setAppearanceSaving(false);
    }
  };

  const generateBackground = async () => {
    const prompt = bgPrompt.trim();
    if (!prompt) {
      setBgGenError('Descreva a imagem (ex.: "rua em Nova York à noite, neon, chuva leve").');
      return;
    }
    setBgGenerating(true);
    setBgGenError(null);
    try {
      // Método 1 (preferido): invoke (anexa JWT automaticamente)
      let publicUrl: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke('ai-agenda-background', {
          body: { prompt, style: 'landscape', provider: bgProvider },
        });
        if (error) throw error;
        publicUrl = (data as any)?.publicUrl || null;
      } catch (e1: any) {
        // Método 2 (fallback): fetch direto, para capturar mensagem de erro do body (melhor debug)
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) throw e1;

        const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-agenda-background`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ prompt, style: 'landscape', provider: bgProvider }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error || `Edge Function error: ${res.status}`);
        }
        publicUrl = body?.publicUrl || null;
      }

      if (!publicUrl) throw new Error('IA não retornou URL da imagem.');
      await saveAppearance({ agenda_bg_url: publicUrl, agenda_bg_preset: 'classic-dark' });
    } catch (e: any) {
      setBgGenError(e?.message || 'Falha ao gerar imagem');
    } finally {
      setBgGenerating(false);
    }
  };

  const saveKanban = async () => {
    setKanbanSaving(true);
    setKanbanSaved(false);
    setKanbanError(null);
    try {
      const normalized = kanbanColumns
        .map((c, idx) => ({
          key: c.key,
          label:
            String(c.label || '').trim() ||
            defaultKanbanColumns.find((d) => d.key === c.key)?.label ||
            c.key,
          visible: !!c.visible,
          order: Number(c.order || 0) || (idx + 1) * 10,
        }))
        .sort((a, b) => a.order - b.order);

      const savedRow = await upsertAgendaKanbanConfig(normalized);
      setKanbanColumns((savedRow.columns || normalized) as any);
      setKanbanSaved(true);
      setTimeout(() => setKanbanSaved(false), 1500);
    } catch (e: any) {
      setKanbanError(e?.message || 'Falha ao salvar Kanban');
    } finally {
      setKanbanSaving(false);
    }
  };

  if (loading) return <div className="text-slate-400 font-bold">Carregando…</div>;

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="p-5 border border-rose-500/20 bg-rose-500/10">
          <div className="text-rose-200 font-black">Erro</div>
          <div className="text-sm text-rose-200/80 font-bold mt-1">{error}</div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WhatsApp */}
        <Card className={cn('p-0 overflow-hidden', agendaCardClass, 'bg-slate-950/95')}>
          <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-900/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-300">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-white font-black">WhatsApp</div>
                  <div className="text-xs text-slate-500 font-bold">Lembretes e resumos</div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-black text-slate-200">
                <span className="text-xs text-slate-500 font-black uppercase tracking-widest">Ativo</span>
                <input
                  type="checkbox"
                  checked={!!config.whatsapp_ativo}
                  onChange={(e) => setConfig((p) => ({ ...p, whatsapp_ativo: e.target.checked }))}
                  className="accent-violet-500"
                />
              </label>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                Número do WhatsApp
              </label>
              <input
                value={config.whatsapp_numero || ''}
                onChange={(e) => setConfig((p) => ({ ...p, whatsapp_numero: e.target.value }))}
                placeholder="+55 21 99999-9999"
                className="w-full bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <div className="text-xs text-slate-500 font-bold mt-2">
                Dica: use o número pessoal da Ana. O envio via UAZAPI será configurado na próxima fase.
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleTesteWhatsApp}
                  disabled={waTesting || !config?.whatsapp_ativo || !config?.whatsapp_numero}
                  className={cn(
                    'px-4 py-3 rounded-2xl font-black text-white transition-all shadow-lg active:scale-95 flex items-center gap-2',
                    waTesting || !config?.whatsapp_ativo || !config?.whatsapp_numero
                      ? 'bg-slate-900/40 border border-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                  )}
                  title="Enviar mensagem de teste para o número configurado"
                >
                  {waTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {waTesting ? 'Enviando...' : 'Enviar teste'}
                </button>

                {waTestStatus === 'success' ? <Badge variant="success">{waTestMsg || 'Enviado'}</Badge> : null}
                {waTestStatus === 'error' ? <Badge variant="danger">{waTestMsg || 'Erro'}</Badge> : null}
              </div>
            </div>
          </div>
        </Card>

        {/* Google Calendar */}
        <Card className={cn('p-0 overflow-hidden', agendaCardClass, 'bg-slate-950/95')}>
          <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-900/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-white font-black">Google Calendar</div>
                  <div className="text-xs text-slate-500 font-bold">Integração futura (Fase 4)</div>
                </div>
              </div>
              <Badge variant={config.google_calendar_ativo ? 'success' : 'warning'}>
                {config.google_calendar_ativo ? 'Conectado' : 'Desconectado'}
              </Badge>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="text-sm text-slate-300 font-bold">
              Status: {config.google_calendar_ativo ? '✅ Conectado' : '⚠️ Desconectado'}
            </div>
            <div className="text-xs text-slate-500 font-bold">
              {config.google_calendar_id ? `Calendário: ${config.google_calendar_id}` : 'Calendário: (não configurado)'}
            </div>
            <div className="text-xs text-slate-500 font-bold">
              Segurança: o sistema <span className="text-slate-300">nunca</span> exibe nem salva refresh token no client.
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled
                className="px-4 py-3 rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-500 font-black cursor-not-allowed"
              >
                Conectar
              </button>
              <button
                type="button"
                disabled
                className="px-4 py-3 rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-500 font-black cursor-not-allowed"
              >
                Desconectar
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Aparência */}
      <Card className={cn('p-0 overflow-hidden', agendaCardClass)}>
        <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-900/30">
          <div className="text-white font-black">Aparência</div>
          <div className="text-xs text-slate-500 font-bold mt-1">Presets + geração de imagens (paisagens) para a Ana</div>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Fundo da Agenda</div>
              <div className="text-xs text-slate-500 font-bold mt-1">
                Dica: a escolha é salva por usuário e atualiza em tempo real.
              </div>
              <div className="mt-2 flex items-center gap-2">
                {appearanceSaving ? <Badge variant="info">Salvando…</Badge> : null}
                {appearanceSaved ? <Badge variant="success">Salvo</Badge> : null}
                {appearanceError ? <Badge variant="danger">Erro</Badge> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => saveAppearance({ agenda_bg_preset: 'classic-dark', agenda_bg_url: null })}
              disabled={appearanceSaving}
              className="px-4 py-2 rounded-2xl border border-slate-800 bg-slate-900/20 text-slate-300 font-black hover:bg-slate-900/40 hover:border-violet-500/20 transition-all"
              title="Voltar ao fundo padrão"
            >
              Padrão
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {AGENDA_BG_PRESETS.slice(0, 10).map((p) => {
              const active = (config.agenda_bg_preset || 'classic-dark') === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => saveAppearance({ agenda_bg_preset: p.id, agenda_bg_url: null })}
                  disabled={appearanceSaving}
                  className={cn(
                    'rounded-2xl border overflow-hidden text-left transition-all',
                    active ? 'border-violet-500/35 ring-2 ring-violet-500/15' : 'border-slate-800/60 hover:border-violet-500/20'
                  )}
                >
                  <div className="h-16" style={{ backgroundImage: p.backgroundImage, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                  <div className="px-3 py-2 bg-slate-950/10">
                    <div className={cn('text-xs font-black truncate', active ? 'text-violet-200' : 'text-slate-200')}>{p.label}</div>
                    <div className="text-[10px] text-slate-500 font-bold truncate">{p.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="border-t border-slate-800/70 pt-4 mt-2" />

          <div className="rounded-2xl border border-slate-800/60 bg-slate-950/85 overflow-hidden">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-white font-black">
                  <Sparkles className="w-4 h-4 text-violet-300" />
                  Fundo gerado (Fotos reais / IA)
                </div>
                <div className="text-xs text-slate-500 font-bold mt-1">
                  Preferência: <span className="text-slate-200">Fotos reais</span> (sem “cara de IA”). IA fica como alternativa.
                </div>
              </div>
              {config.agenda_bg_url ? (
                <button
                  type="button"
                  onClick={() => saveAppearance({ agenda_bg_url: null })}
                  disabled={appearanceSaving}
                  className="px-3 py-2 rounded-2xl border border-slate-800 bg-slate-900/20 text-slate-300 font-black hover:bg-slate-900/40 hover:border-rose-500/20 transition-all flex items-center gap-2"
                  title="Remover imagem e voltar para presets"
                >
                  <Trash2 className="w-4 h-4" />
                  Remover
                </button>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    type="button"
                    onClick={() => setBgProvider('photo')}
                    className={cn(
                      'px-3 py-2 rounded-2xl border font-black text-xs transition-all',
                      bgProvider === 'photo'
                        ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-200'
                        : 'border-slate-800 bg-slate-900/20 text-slate-300 hover:bg-slate-900/40 hover:border-emerald-500/20'
                    )}
                    title="Usar fotos reais (recomendado)"
                  >
                    📷 Foto real
                  </button>
                  <button
                    type="button"
                    onClick={() => setBgProvider('gemini')}
                    className={cn(
                      'px-3 py-2 rounded-2xl border font-black text-xs transition-all',
                      bgProvider === 'gemini'
                        ? 'bg-violet-500/15 border-violet-500/25 text-violet-200'
                        : 'border-slate-800 bg-slate-900/20 text-slate-300 hover:bg-slate-900/40 hover:border-violet-500/20'
                    )}
                    title="Gerar com IA (pode ficar com cara de IA)"
                  >
                    ✨ IA
                  </button>
                </div>

                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Prompt</div>
                <textarea
                  value={bgPrompt}
                  onChange={(e) => setBgPrompt(e.target.value)}
                  placeholder="Ex.: Rua em Nova York à noite, neon roxo e azul, chuva leve, cinematográfico, sem pessoas, sem texto"
                  spellCheck={false}
                  className="w-full min-h-[96px] bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    { label: 'NY (Noite)', prompt: 'Rua em Nova York à noite, neon roxo e azul, chuva leve, cinematográfico, sem texto, sem pessoas' },
                    { label: 'Floral', prompt: 'Paisagem floral suave (pastel), luz de manhã, premium, sem texto' },
                    { label: 'Praia', prompt: 'Praia ao pôr do sol, tons roxo e dourado, atmosfera calma, sem pessoas, sem texto' },
                    { label: 'Montanhas', prompt: 'Montanhas com neblina, tons frios, minimalista, sem texto, sem pessoas' },
                  ].map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setBgPrompt(s.prompt)}
                      className="px-3 py-2 rounded-2xl border border-slate-800 bg-slate-900/20 text-slate-300 font-black hover:bg-slate-900/40 hover:border-violet-500/20 transition-all text-xs"
                      title="Usar sugestão"
                    >
                      <Wand2 className="w-4 h-4 inline-block mr-2 text-violet-300" />
                      {s.label}
                    </button>
                  ))}
                </div>
                {bgGenError ? (
                  <div className="mt-3 text-sm text-rose-200 font-bold">{bgGenError}</div>
                ) : null}
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={generateBackground}
                    disabled={bgGenerating}
                    className={cn(
                      'px-5 py-3 rounded-2xl font-black text-white transition-all shadow-lg active:scale-95 flex items-center gap-2',
                      bgGenerating ? 'bg-slate-800 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500 shadow-violet-600/20'
                    )}
                  >
                    <ImageIcon className={cn('w-4 h-4', bgGenerating ? 'animate-pulse' : '')} />
                    {bgGenerating ? 'Gerando…' : 'Gerar e aplicar'}
                  </button>
                  <div className="text-xs text-slate-500 font-bold">
                    Dica: depois a gente evolui para “Galeria pessoal” com histórico.
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Preview</div>
                <div className="rounded-2xl border border-slate-800/60 bg-slate-950/85 overflow-hidden">
                  <div
                    className="h-[160px] w-full"
                    style={{
                      backgroundImage: config.agenda_bg_url
                        ? `linear-gradient(rgba(8,10,15,.45), rgba(8,10,15,.45)), url(${config.agenda_bg_url})`
                        : `linear-gradient(rgba(8,10,15,.45), rgba(8,10,15,.45)), ${
                            (AGENDA_BG_PRESETS.find((x) => x.id === (config.agenda_bg_preset || 'classic-dark')) || AGENDA_BG_PRESETS[0]).backgroundImage
                          }`,
                      backgroundSize: config.agenda_bg_url ? 'cover' : 'auto',
                      backgroundPosition: 'center',
                    }}
                  />
                  <div className="px-4 py-3">
                    <div className="text-white font-black">Agenda da Ana</div>
                    <div className="text-xs text-slate-500 font-bold">O fundo escolhido aparece aqui.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Resumos */}
      <Card className={cn('p-0 overflow-hidden', agendaCardClass)}>
        <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-900/30">
          <div className="text-white font-black">Resumos automáticos</div>
          <div className="text-xs text-slate-500 font-bold mt-1">Preferências do “Bom dia Ana” e resumo semanal</div>
        </div>
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm font-black text-slate-200">
              <span>Resumo diário</span>
              <input
                type="checkbox"
                checked={!!config.resumo_diario_ativo}
                onChange={(e) => setConfig((p) => ({ ...p, resumo_diario_ativo: e.target.checked }))}
                className="accent-violet-500"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Horário</div>
                <input
                  type="time"
                  value={config.resumo_diario_hora || '08:00'}
                  onChange={(e) => setConfig((p) => ({ ...p, resumo_diario_hora: e.target.value }))}
                  className="w-full bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3 text-sm font-black text-slate-200">
              <span>Resumo semanal</span>
              <input
                type="checkbox"
                checked={!!config.resumo_semanal_ativo}
                onChange={(e) => setConfig((p) => ({ ...p, resumo_semanal_ativo: e.target.checked }))}
                className="accent-violet-500"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Dia</div>
                <CustomSelect
                  value={String(config.resumo_semanal_dia || 'domingo')}
                  onValueChange={(v) => setConfig((p) => ({ ...p, resumo_semanal_dia: v }))}
                  options={diasSemana}
                  placeholder="Escolha o dia"
                />
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Horário</div>
                <input
                  type="time"
                  value={config.resumo_semanal_hora || '20:00'}
                  onChange={(e) => setConfig((p) => ({ ...p, resumo_semanal_hora: e.target.value }))}
                  className="w-full bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Lembrete padrão</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <CustomSelect
                value={String(config.lembrete_padrao_minutos ?? 30)}
                onValueChange={(v) => setConfig((p) => ({ ...p, lembrete_padrao_minutos: Number(v) }))}
                options={minutesOptionsSelect}
                placeholder="Defina o lembrete"
              />
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                Ao criar uma tarefa (Quick Add), esse será o lembrete sugerido.
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Kanban */}
      <Card className={cn('p-0 overflow-hidden', agendaCardClass)}>
        <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-900/30 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-300">
                <Columns3 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-white font-black">Kanban</div>
                <div className="text-xs text-slate-500 font-bold">Personalize nomes, ordem e visibilidade das colunas</div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={saveKanban}
            disabled={kanbanSaving || kanbanLoading}
            className={cn(
              'px-4 py-3 rounded-2xl font-black flex items-center gap-2 transition-all',
              kanbanSaving || kanbanLoading
                ? 'bg-slate-900/40 border border-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20'
            )}
          >
            <Save className={cn('w-4 h-4', kanbanSaving ? 'animate-spin' : '')} />
            {kanbanSaving ? 'Salvando...' : kanbanSaved ? 'Salvo' : 'Salvar Kanban'}
          </button>
        </div>

        <div className="p-6 space-y-4">
          {kanbanError ? (
            <Card className="p-5 border border-rose-500/20 bg-rose-500/10">
              <div className="text-rose-200 font-black">Erro</div>
              <div className="text-sm text-rose-200/80 font-bold mt-1">{kanbanError}</div>
            </Card>
          ) : null}

          {kanbanLoading ? (
            <div className="text-slate-400 font-bold">Carregando Kanban…</div>
          ) : (
            <div className="space-y-3">
              {kanbanColumns
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((col) => (
                  <div key={col.key} className="rounded-2xl border border-slate-800/60 bg-slate-950/85 p-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() =>
                            setKanbanColumns((prev) =>
                              prev.map((c) => (c.key === col.key ? { ...c, visible: !c.visible } : c))
                            )
                          }
                          className={cn(
                            'w-10 h-10 rounded-2xl border flex items-center justify-center transition-all shrink-0',
                            col.visible
                              ? 'bg-slate-900/30 border-slate-800 text-slate-300 hover:text-white'
                              : 'bg-slate-900/10 border-slate-900/30 text-slate-600 hover:text-slate-300'
                          )}
                          aria-label={col.visible ? 'Ocultar coluna' : 'Mostrar coluna'}
                          title={col.visible ? 'Ocultar coluna' : 'Mostrar coluna'}
                        >
                          {col.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Status</div>
                          <div className="text-white font-black mt-0.5">{col.key.replace('_', ' ').toUpperCase()}</div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setKanbanColumns((prev) => {
                                const sorted = prev.slice().sort((a, b) => a.order - b.order);
                                const idx = sorted.findIndex((c) => c.key === col.key);
                                if (idx <= 0) return prev;
                                const above = sorted[idx - 1];
                                return prev.map((c) => {
                                  if (c.key === col.key) return { ...c, order: above.order };
                                  if (c.key === above.key) return { ...c, order: col.order };
                                  return c;
                                });
                              })
                            }
                            className="w-10 h-10 rounded-2xl border border-slate-800 bg-slate-900/20 text-slate-400 hover:text-white hover:bg-slate-900/40 transition-all"
                            title="Subir"
                          >
                            <ChevronUp className="w-4 h-4 mx-auto" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setKanbanColumns((prev) => {
                                const sorted = prev.slice().sort((a, b) => a.order - b.order);
                                const idx = sorted.findIndex((c) => c.key === col.key);
                                if (idx < 0 || idx >= sorted.length - 1) return prev;
                                const below = sorted[idx + 1];
                                return prev.map((c) => {
                                  if (c.key === col.key) return { ...c, order: below.order };
                                  if (c.key === below.key) return { ...c, order: col.order };
                                  return c;
                                });
                              })
                            }
                            className="w-10 h-10 rounded-2xl border border-slate-800 bg-slate-900/20 text-slate-400 hover:text-white hover:bg-slate-900/40 transition-all"
                            title="Descer"
                          >
                            <ChevronDown className="w-4 h-4 mx-auto" />
                          </button>
                        </div>
                      </div>

                      <div className="w-full md:w-[340px]">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Nome da coluna</div>
                        <input
                          value={col.label}
                          onChange={(e) =>
                            setKanbanColumns((prev) =>
                              prev.map((c) => (c.key === col.key ? { ...c, label: e.target.value } : c))
                            )
                          }
                          className="w-full bg-slate-900/40 border border-slate-700/60 rounded-2xl px-4 py-3 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50"
                          placeholder="Ex.: A Fazer"
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          <div className="text-xs text-slate-500 font-bold">
            Observação: por enquanto você pode personalizar nomes/ordem/visibilidade. Para “criar novas colunas ilimitadas”, eu adiciono uma fase 2 com
            <span className="text-slate-300"> kanban_stage </span>
            (sem mexer no status de conclusão).
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {saved ? <Badge variant="success">Salvo</Badge> : null}
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={cn(
            'px-6 py-3 rounded-2xl font-black text-white flex items-center gap-2 transition-all',
            saving ? 'bg-slate-800 text-slate-400 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500'
          )}
        >
          <Save className="w-4 h-4" />
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
};

