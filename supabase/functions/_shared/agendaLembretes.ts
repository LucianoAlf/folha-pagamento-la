// Planejamento puro dos pings individuais (spec §6.2, §6.4). Sem I/O: testavel com node --test.

export type LinhaDevida = {
  tarefa_id: string;
  titulo: string;
  descricao: string | null;
  prioridade: string | null;
  categoria: string | null;
  vencimento_em: string;
  momento: string | null;            // ja passou por agenda_momento_lembrete (janela de silencio)
  user_id: string;
  nome: string;
  whatsapp_numero: string | null;
  whatsapp_ativo: boolean;
  agenda_lembrete_tarefas_ativo: boolean;
};

export type EnvioPlanejado = {
  tarefa_id: string;
  user_id: string;
  numero: string;
  scheduled_for: string;             // ISO do momento (deterministico -> chave de idempotencia)
  mensagem: string;
};

const TZ = 'America/Sao_Paulo';

const prioridadeEmoji: Record<string, string> = { baixa: '⬇️', media: '➡️', alta: '⚠️', urgente: '🔴' };
const categoriaEmoji: Record<string, string> = { financeiro: '💵', rh: '👩‍💼', administrativo: '📋', pessoal: '🏠', geral: '📌' };

export function horaSp(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function soDigitos(numero: string | null | undefined): string {
  return String(numero || '').replace(/\D/g, '');
}

export function formatLembrete(t: Pick<LinhaDevida, 'titulo' | 'descricao' | 'prioridade' | 'categoria' | 'vencimento_em'>, agora: Date): string {
  const p = String(t.prioridade || 'media');
  const c = String(t.categoria || 'geral');
  const hora = horaSp(t.vencimento_em);
  const passou = new Date(t.vencimento_em).getTime() < agora.getTime();
  let msg = `🔔 *LEMBRETE*\n\n${prioridadeEmoji[p] || '📋'} *${t.titulo || 'Tarefa'}*\n\n`;
  msg += `${categoriaEmoji[c] || '📌'} ${c.toUpperCase()}\n`;
  msg += `⏰ ${hora ? `${passou ? 'Venceu' : 'Vence'} às ${hora}` : 'Hoje'}\n`;
  if (t.descricao) msg += `\n📝 ${t.descricao}\n`;
  msg += `\n_LA Music - Agenda_`;
  return msg;
}

/** Decide quem recebe o que agora. Uma linha por (tarefa, destinatario). */
export function planejarEnvios(linhas: LinhaDevida[], agora: Date, force: boolean): { envios: EnvioPlanejado[]; skipped: number } {
  const envios: EnvioPlanejado[] = [];
  let skipped = 0;
  for (const l of linhas) {
    if (!l.momento) { skipped++; continue; }                                  // dia inteiro: sem ping
    const numero = soDigitos(l.whatsapp_numero);
    if (!numero || !l.whatsapp_ativo || l.agenda_lembrete_tarefas_ativo === false) { skipped++; continue; }
    const momento = new Date(l.momento);
    if (!force && agora.getTime() < momento.getTime()) { skipped++; continue; }
    envios.push({
      tarefa_id: l.tarefa_id,
      user_id: l.user_id,
      numero,
      scheduled_for: momento.toISOString(),
      mensagem: formatLembrete(l, agora),
    });
  }
  return { envios, skipped };
}
