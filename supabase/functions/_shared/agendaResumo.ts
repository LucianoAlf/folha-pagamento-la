// Resumo individual completo (spec §6.5): rotinas/manuais uma a uma, "Pagar:" agregadas.

export type ResumoItem = { id: string; titulo: string; prioridade: string | null; vencimento_em: string; dia_inteiro?: boolean | null; parent_id?: string | null };
export type ResumoPayload = {
  nome: string | null;
  itens: ResumoItem[];
  atrasadas: ResumoItem[];
  /** Total de atrasadas sem o piso de 30 dias (R19); ausente = payload antigo. */
  atrasadas_total?: number;
  pagar: { n: number; total: number };
  pagar_atrasadas: { n: number; total: number };
};
export type ResumoOpts = { tipo: 'diario' | 'semanal'; dataLabel: string };

const TZ = 'America/Sao_Paulo';

/* ------------------------------------------------------------------ */
/* Decisao de envio (I-5): estava inline no edge, sem teste. Puro.     */
/* ------------------------------------------------------------------ */

export function parseTimeToHHMM(value: any) {
  const s = String(value || "").trim();
  // time columns may come as "08:00:00"
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return { hh: 8, mm: 0 };
  return { hh: Number(m[1]), mm: Number(m[2]) };
}

export function scheduledForIsoSp(dateStr: string, hh: number, mm: number) {
  // SP sem DST atualmente; usamos offset -03:00
  const iso = `${dateStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00-03:00`;
  return new Date(iso).toISOString();
}

export function withinWindow(now: Date, targetIso: string, minutesWindow = 10) {
  const target = new Date(targetIso).getTime();
  const t0 = target;
  const t1 = target + minutesWindow * 60 * 1000;
  const n = now.getTime();
  return n >= t0 && n <= t1;
}

/** Escolhe o candidato (ISO) que está dentro da janela [t, t+janelaMin] agora; null se nenhum. */
export function escolherDisparo(now: Date, candidatosIso: Array<string | null | undefined>, janelaMin = 12): string | null {
  for (const c of candidatosIso) {
    if (!c) continue;
    if (withinWindow(now, c, janelaMin)) return new Date(c).toISOString();
  }
  return null;
}

export function brl(v: number): string {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  const [i, d] = n.toFixed(2).split('.');
  return `R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}`;
}

function icone(p: string | null | undefined): string {
  return p === 'urgente' ? '🔴' : p === 'alta' ? '⚠️' : '•';
}

function horaSp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch { return ''; }
}

function diaSp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(new Date(iso));
  } catch { return ''; }
}

/** Pais primeiro, cada filha logo abaixo do seu pai com "↳". Filha orfã (pai fora da lista) vira linha normal. */
function ordenarComFilhas(itens: ResumoItem[]): Array<ResumoItem & { filha: boolean }> {
  const ids = new Set(itens.map((i) => i.id));
  const raiz = itens.filter((i) => !i.parent_id || !ids.has(i.parent_id));
  const out: Array<ResumoItem & { filha: boolean }> = [];
  for (const r of raiz) {
    out.push({ ...r, filha: false });
    for (const f of itens.filter((i) => i.parent_id === r.id)) out.push({ ...f, filha: true });
  }
  return out;
}

export function montarResumo(p: ResumoPayload, opts: ResumoOpts): string {
  const nome = (p.nome || '').trim().toUpperCase() || 'EQUIPE';
  const semanal = opts.tipo === 'semanal';
  let msg = semanal ? `📊 *RESUMO SEMANAL — AGENDA*\n` : `☀️ *BOM DIA, ${nome}!*\n`;
  msg += `📅 ${opts.dataLabel}\n\n`;
  msg += semanal ? `📊 *SUA SEMANA:*\n` : `📊 *SEU DIA:*\n`;
  msg += `• ${p.itens.length} tarefas ${semanal ? 'nos próximos 7 dias' : 'para hoje'}\n`;
  const atrasadasTotal = p.atrasadas_total ?? p.atrasadas.length;
  msg += `• ${atrasadasTotal} atrasadas\n`;
  if (p.pagar.n > 0) msg += `• ${p.pagar.n} contas vencendo\n`;
  msg += `\n`;

  if (p.itens.length) {
    msg += semanal ? `📋 *PRÓXIMAS TAREFAS:*\n` : `📋 *TAREFAS (HOJE):*\n`;
    for (const t of ordenarComFilhas(p.itens)) {
      const quando = semanal ? diaSp(t.vencimento_em) : (t.dia_inteiro ? '' : horaSp(t.vencimento_em));
      msg += `${t.filha ? '   ↳' : icone(t.prioridade)} ${quando ? `${quando} - ` : ''}${t.titulo}\n`;
    }
    msg += `\n`;
  }

  if (p.atrasadas.length) {
    msg += atrasadasTotal > p.atrasadas.length
      ? `⚠️ *ATRASADAS (${p.atrasadas.length} mais recentes de ${atrasadasTotal}):*\n`
      : `⚠️ *ATRASADAS:*\n`;
    for (const t of p.atrasadas) msg += `• ${diaSp(t.vencimento_em)} - ${t.titulo}\n`;
    msg += `\n`;
  }

  if (p.pagar.n > 0) msg += `💵 *CONTAS:* ${p.pagar.n} contas ${semanal ? 'na semana' : 'hoje'} — ${brl(p.pagar.total)} (detalhe no laudo)\n`;
  if (p.pagar_atrasadas.n > 0) msg += `💵 *CONTAS ATRASADAS:* ${p.pagar_atrasadas.n} contas atrasadas — ${brl(p.pagar_atrasadas.total)}\n`;
  if (p.pagar.n > 0 || p.pagar_atrasadas.n > 0) msg += `\n`;

  msg += `_LA Music - Agenda_`;
  return msg;
}
