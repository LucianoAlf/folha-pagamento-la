import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Card, CustomSelect, Tooltip } from '../UI';
import { cn } from '../CollaboratorComponents';
import { Save, Smartphone, Calendar, Columns3, Eye, EyeOff, ChevronUp, ChevronDown, Sparkles, Image as ImageIcon, Wand2, Trash2, Send, Loader2, Bot, Images, X } from 'lucide-react';
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

// Tipo para imagens da galeria
interface GalleryImage {
  name: string;
  url: string;
  created_at: string;
}

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
  const [tempGeneratedUrl, setTempGeneratedUrl] = useState<string | null>(null);

  // Galeria de imagens geradas
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [deletingImage, setDeletingImage] = useState<string | null>(null);

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

  // Visual "padrão Agenda" (painel escuro), sem interferir no Card global do app
  // Importante: sem opacidade (o user pediu "normal", sem transparência)
  const agendaCardClass = 'bg-slate-950/85 border-slate-800/70 backdrop-blur-none';

  // WhatsApp: envio de teste
  const [waTesting, setWaTesting] = useState(false);
  const [waTestStatus, setWaTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [waTestMsg, setWaTestMsg] = useState<string>('');

  // Carregar galeria de imagens do usuário
  const loadGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) {
        console.log('Gallery: No user ID');
        return;
      }

      const userId = userData.user.id;
      console.log('Gallery: Loading for user', userId);
      
      const { data: files, error } = await supabase.storage
        .from('agenda-backgrounds')
        .list(`users/${userId}`, {
          limit: 20,
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) {
        console.error('Gallery: Storage error', error);
        // Se for erro de política, vamos mostrar algo mais amigável
        if (error.message.includes('New policies')) {
          console.warn('Aguardando propagação das novas políticas do Storage...');
        }
        throw error;
      }

      console.log('Gallery: Found files', files?.length || 0, files);

      const images: GalleryImage[] = (files || [])
        .filter((f) => f.name && (f.name.endsWith('.jpg') || f.name.endsWith('.png')))
        .map((f) => {
          const { data: urlData } = supabase.storage
            .from('agenda-backgrounds')
            .getPublicUrl(`users/${userId}/${f.name}`);
          return {
            name: f.name,
            url: urlData?.publicUrl || '',
            created_at: f.created_at || '',
          };
        })
        .filter((img) => img.url);

      console.log('Gallery: Processed images', images.length);
      setGalleryImages(images);
    } catch (e: any) {
      console.error('Erro ao carregar galeria:', e?.message);
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  // Deletar imagem da galeria
  const deleteGalleryImage = async (imageName: string) => {
    setDeletingImage(imageName);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return;

      const userId = userData.user.id;
      const { error } = await supabase.storage
        .from('agenda-backgrounds')
        .remove([`users/${userId}/${imageName}`]);

      if (error) throw error;

      // Remover da lista local
      setGalleryImages((prev) => prev.filter((img) => img.name !== imageName));

      // Se a imagem deletada era a atual, limpar
      if (config.agenda_bg_url?.includes(imageName)) {
        await saveAppearance({ agenda_bg_url: null });
      }
    } catch (e: any) {
      console.error('Erro ao deletar imagem:', e?.message);
    } finally {
      setDeletingImage(null);
    }
  };

  // Aplicar imagem da galeria como fundo
  const applyGalleryImage = async (imageUrl: string) => {
    await saveAppearance({ agenda_bg_url: imageUrl, agenda_bg_preset: 'classic-dark' });
  };

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
    
    // Carregar galeria
    loadGallery();
  }, [loadGallery]);

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
          body: { prompt, style: 'agenda', provider: 'gemini' },
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
          body: JSON.stringify({ prompt, style: 'agenda', provider: 'gemini' }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error || `Edge Function error: ${res.status}`);
        }
        publicUrl = body?.publicUrl || null;
      }

      if (!publicUrl) throw new Error('IA não retornou URL da imagem.');
      
      // Apenas mostra no preview temporário, não salva ainda na config do usuário
      setTempGeneratedUrl(publicUrl);
      
    } catch (e: any) {
      setBgGenError(e?.message || 'Falha ao gerar imagem');
    } finally {
      setBgGenerating(false);
    }
  };

  const handleDiscardBackground = async () => {
    if (!tempGeneratedUrl) return;
    
    // Tenta extrair o nome do arquivo da URL para deletar do storage
    try {
      const urlParts = tempGeneratedUrl.split('/');
      const imageName = urlParts[urlParts.length - 1];
      
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user?.id) {
        await supabase.storage
          .from('agenda-backgrounds')
          .remove([`users/${userData.user.id}/${imageName}`]);
      }
    } catch (e) {
      console.error('Erro ao limpar imagem descartada:', e);
    }
    
    setTempGeneratedUrl(null);
  };

  const handleConfirmBackground = async () => {
    if (!tempGeneratedUrl) return;
    
    setAppearanceSaving(true);
    try {
      await saveAppearance({ agenda_bg_url: tempGeneratedUrl, agenda_bg_preset: 'classic-dark' });
      // Agora sim, recarrega a galeria para mostrar a nova imagem escolhida
      await loadGallery();
      // Limpa o estado temporário pois já foi aplicado
      setTempGeneratedUrl(null);
    } catch (e: any) {
      setAppearanceError('Falha ao salvar imagem escolhida');
    } finally {
      setAppearanceSaving(false);
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

      {/* Atalho para Notificações Globais */}
      <Card className={cn('p-5 border-dashed border-violet-500/30 bg-violet-500/5', agendaCardClass)}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-left">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center text-violet-400">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="text-white font-black text-sm">Lembretes e Resumos</div>
              <div className="text-slate-500 text-xs font-bold mt-0.5">
                Configure seu WhatsApp e horários de resumos na Central de Notificações.
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              // Dispara um evento ou muda a aba global se necessário
              // Como estamos no Sidebar, podemos apenas mudar a rota
              window.location.hash = '#/notificacoes';
              // Força o reload se o router for baseado em hash simples
              window.dispatchEvent(new HashChangeEvent('hashchange'));
            }}
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-black rounded-xl transition-all shadow-lg shadow-violet-600/20"
          >
            Abrir Central de Notificações
          </button>
        </div>
      </Card>

      {/* Aparência */}
      <Card className={cn('p-0 overflow-hidden', agendaCardClass)}>
        <div className="px-6 py-5 border-b border-slate-700/50 bg-slate-900/30">
          <div className="text-white font-black">Aparência</div>
          <div className="text-xs text-slate-500 font-bold mt-1">Galeria pessoal + geração de imagens via IA para a Ana Paula</div>
        </div>
        <div className="p-6 space-y-4">
          {/* GALERIA PESSOAL - Meus Fundos da Ana Paula (sempre visível) */}
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Images className="w-5 h-5 text-violet-400" />
                <div className="text-sm font-black text-violet-200">Meus Fundos da Ana Paula</div>
                {galleryImages.length > 0 && <Badge variant="info">{galleryImages.length}</Badge>}
              </div>
              <div className="flex items-center gap-2">
                {appearanceSaving ? <Badge variant="info">Salvando…</Badge> : null}
                {appearanceSaved ? <Badge variant="success">Salvo</Badge> : null}
                {galleryLoading && <Loader2 className="w-4 h-4 animate-spin text-violet-400" />}
              </div>
            </div>
            
            {galleryImages.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                {galleryImages.map((img) => {
                  const isActive = config.agenda_bg_url === img.url;
                  const isDeleting = deletingImage === img.name;
                  return (
                    <Tooltip content="Clique para aplicar como fundo" side="top">
                      <div
                        key={img.name}
                        className={cn(
                          'relative group rounded-2xl border overflow-hidden transition-all cursor-pointer',
                          isActive ? 'border-violet-500/50 ring-2 ring-violet-500/20' : 'border-slate-800/60 hover:border-violet-500/30'
                        )}
                        onClick={() => applyGalleryImage(img.url)}
                      >
                        <div
                          className="h-20 w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${img.url})` }}
                        />
                      {/* Escurece levemente no hover (sem bloquear clique) */}
                      <div className="absolute inset-0 pointer-events-none bg-black/0 group-hover:bg-black/20 transition-all" />

                      {/* Delete discreto (canto) */}
                      <Tooltip content="Excluir da galeria" side="top">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteGalleryImage(img.name);
                          }}
                          disabled={isDeleting}
                          className={cn(
                            'absolute top-2 right-2 w-7 h-7 rounded-xl border border-slate-800/60 bg-slate-950/70 text-slate-300',
                            'opacity-0 group-hover:opacity-100 transition-all',
                            'hover:bg-rose-500/15 hover:border-rose-500/30 hover:text-rose-200',
                            isDeleting ? 'cursor-not-allowed opacity-100' : ''
                          )}
                          aria-label="Excluir da galeria"
                        >
                          {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : <Trash2 className="w-4 h-4 mx-auto" />}
                        </button>
                      </Tooltip>
                      {/* Badge de ativo */}
                      {isActive && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center">
                          <Eye className="w-3 h-3 text-white" />
                        </div>
                      )}
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6">
                <div className="text-slate-500 font-bold text-sm">Nenhuma imagem gerada ainda</div>
                <div className="text-slate-600 text-xs mt-1">Use o gerador abaixo para criar fundos personalizados</div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800/60 bg-slate-950/85 overflow-hidden p-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 text-white font-black">
                  <Bot className="w-4 h-4 text-violet-300" />
                  Gerador de Fundo por IA
                </div>
                <div className="text-xs text-slate-500 font-bold mt-1 mb-5">
                  Crie fundos personalizados e exclusivos usando inteligência artificial.
                </div>

                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Prompt</div>
                <textarea
                  value={bgPrompt}
                  onChange={(e) => setBgPrompt(e.target.value)}
                  placeholder="Ex.: Rua em Nova York à noite, neon roxo e azul, chuva leve, cinematográfico, sem pessoas, sem texto"
                  spellCheck={false}
                  className="w-full min-h-[100px] bg-slate-900/40 border border-slate-700/60 rounded-[1.5rem] px-5 py-4 text-slate-100 font-bold outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {[
                    { label: '🎹 Piano', prompt: 'Teclas de piano em iluminação dramática chiaroscuro, tons roxo e azul profundo, fumaça atmosférica criando camadas de profundidade, estética jazz club, cinematográfico' },
                    { label: '🎸 Guitarra', prompt: 'Cordas de guitarra vibrando em macro fotografia, ondas sonoras visíveis, iluminação âmbar quente e roxo frio, bokeh de luzes de palco, energia musical' },
                    { label: '🎵 Estúdio', prompt: 'Setup de estúdio de música profissional, luzes roxas e azuis com gel, fumaça revelando raios de luz, equipamentos em silhueta, atmosfera criativa' },
                    { label: '🎤 Palco', prompt: 'Palco de concerto vazio com holofotes dramáticos, fumaça e raios de luz roxos e azuis, microfone em destaque, atmosfera de show épico' },
                    { label: '🎧 DJ', prompt: 'Mesa de DJ com luzes neon pulsantes, equalizer visual abstrato, tons roxo e ciano, atmosfera de club noturno premium' },
                    { label: '🌊 Oceano', prompt: 'Raios de luz penetrando oceano profundo, partículas bioluminescentes flutuando, atmosfera misteriosa de mar profundo, calmo e meditativo' },
                    { label: '🏔️ Aurora', prompt: 'Aurora boreal dançando no céu noturno, cortinas de luz roxa verde e azul, silhueta de montanhas, estrelas cristalinas, mágico e inspirador' },
                    { label: '☕ Café', prompt: 'Macro de café sendo derramado criando padrões de redemoinho, tons âmbar quentes com iluminação roxa de destaque, vapor subindo, atmosfera aconchegante de café' },
                    { label: '🌸 Sakura', prompt: 'Pétalas de cerejeira caindo suavemente, luz dourada de amanhecer, tons rosa pastel e roxo suave, atmosfera zen japonesa, sem pessoas' },
                    { label: '🌌 Cosmos', prompt: 'Nebulosa colorida no espaço profundo, tons roxo e azul elétrico, estrelas brilhantes, galáxia espiral distante, infinito e contemplativo' },
                    { label: '🎼 Ondas', prompt: 'Ondas sonoras abstratas se transformando em luz, visualização de frequências musicais, neon roxo e azul, fundo escuro, energia pulsante' },
                    { label: '🌅 Sunset', prompt: 'Pôr do sol épico sobre silhueta de cidade, gradiente de roxo para dourado, nuvens dramáticas, luz dourada refletindo em arranha-céus' },
                    { label: '💎 Cristal', prompt: 'Cristais geométricos abstratos refletindo luz roxa e azul, superfície espelhada, prismas criando arco-íris, luxuoso e premium' },
                    { label: '🔮 Neon', prompt: 'Rua de Tokyo à noite com neon roxo e rosa, reflexos na chuva, atmosfera cyberpunk cinematográfica, sem pessoas, Blade Runner vibes' },
                  ].map((s) => (
                    <Tooltip key={s.label} content={<span className="block max-w-[360px]">{s.prompt}</span>} side="top">
                      <button
                        type="button"
                        onClick={() => setBgPrompt(s.prompt)}
                        className="px-3 py-2 rounded-2xl border border-slate-800 bg-slate-900/20 text-slate-300 font-black hover:bg-slate-900/40 hover:border-violet-500/20 transition-all text-xs"
                        aria-label={`Aplicar prompt ${s.label}`}
                      >
                        {s.label}
                      </button>
                    </Tooltip>
                  ))}
                </div>
                {bgGenError ? (
                  <div className="mt-4 text-sm text-rose-200 font-bold">{bgGenError}</div>
                ) : null}
                <div className="mt-5 flex items-center gap-3">
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
                </div>
              </div>

              <div className="flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Preview</div>
                  {config.agenda_bg_url ? (
                      <Tooltip content="Remover imagem gerada" side="top">
                        <button
                          type="button"
                          onClick={() => saveAppearance({ agenda_bg_url: null })}
                          disabled={appearanceSaving}
                          className="w-7 h-7 rounded-lg border border-slate-800/60 bg-slate-900/30 text-slate-500 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition-all flex items-center justify-center"
                          aria-label="Remover imagem gerada"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </Tooltip>
                  ) : null}
                </div>
                <div className="rounded-3xl border border-slate-800/60 bg-slate-950/40 overflow-hidden flex-1 flex flex-col shadow-2xl relative">
                  <div
                    className="flex-1 min-h-[280px] w-full"
                    style={{
                      backgroundImage: (tempGeneratedUrl || config.agenda_bg_url)
                        ? `linear-gradient(rgba(8,10,15,.35), rgba(8,10,15,.35)), url(${tempGeneratedUrl || config.agenda_bg_url})`
                        : `linear-gradient(rgba(8,10,15,.35), rgba(8,10,15,.35)), ${
                            (AGENDA_BG_PRESETS.find((x) => x.id === (config.agenda_bg_preset || 'classic-dark')) || AGENDA_BG_PRESETS[0]).backgroundImage
                          }`,
                      backgroundSize: (tempGeneratedUrl || config.agenda_bg_url) ? 'cover' : 'auto',
                      backgroundPosition: (tempGeneratedUrl || config.agenda_bg_url) ? 'center 45%' : 'center',
                    }}
                  />
                  
                  {/* Botão de Escolha (Aparece apenas quando gera algo novo) */}
                  {tempGeneratedUrl && (
                    <div className="absolute bottom-4 left-4 right-4 bg-slate-900/95 border border-slate-700/50 p-4 rounded-2xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4 transition-all">
                      <div className="flex items-center gap-3 text-left">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-white font-black text-sm">Imagem Gerada!</div>
                          <div className="text-slate-400 text-[11px] font-bold leading-tight">Salvar na galeria da Ana Paula?</div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={handleDiscardBackground}
                          className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all"
                        >
                          Descartar
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmBackground}
                          disabled={appearanceSaving}
                          className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
                        >
                          {appearanceSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Gostei, Salvar!
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="px-5 py-3 border-t border-slate-800/40 bg-slate-950/60">
                    <div className="text-white font-black text-sm">Agenda da Ana</div>
                    <div className="text-[11px] text-slate-500 font-bold mt-0.5">
                      {tempGeneratedUrl ? 'Visualizando nova geração…' : 'O fundo escolhido aparece aqui.'}
                    </div>
                  </div>
                </div>
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
                        <Tooltip content={col.visible ? 'Ocultar coluna' : 'Mostrar coluna'} side="top">
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
                          >
                            {col.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                        </Tooltip>

                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Status</div>
                          <div className="text-white font-black mt-0.5">{col.key.replace('_', ' ').toUpperCase()}</div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Tooltip content="Subir" side="top">
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
                              aria-label="Subir"
                            >
                              <ChevronUp className="w-4 h-4 mx-auto" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Descer" side="top">
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
                              aria-label="Descer"
                            >
                              <ChevronDown className="w-4 h-4 mx-auto" />
                            </button>
                          </Tooltip>
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

