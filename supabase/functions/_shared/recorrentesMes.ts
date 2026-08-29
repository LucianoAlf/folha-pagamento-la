type SupabaseAdminLike = {
  from: (table: string) => any;
};

type ContaPagarRecorrente = Record<string, any> & {
  id: string;
  data_vencimento: string;
  competencia?: string | null;
  status?: string | null;
};

function toDateOnly(value?: string | null): string {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

export function competenciaPrimeiroDia(ymOrDate: string): string {
  const ym = String(ymOrDate || '').trim().match(/^(\d{4})-(\d{2})$/);
  if (ym) return `${ym[1]}-${ym[2]}-01`;
  const d = toDateOnly(ymOrDate);
  if (!d) return '';
  return `${d.slice(0, 7)}-01`;
}

export function ymFromCompetencia(comp?: string | null): string {
  return competenciaPrimeiroDia(comp || '').slice(0, 7);
}

const DIA_MS = 86400000;
function pad2(n: number): string { return String(n).padStart(2, '0'); }
function ymdUTC(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Datas YYYY-MM-DD das ocorrencias semanais (a cada 7 dias a partir da ancora) que caem
 *  no mes alvoYM (YYYY-MM), EXCLUINDO a propria ancora (o modelo ja a representa). */
export function ocorrenciasSemanaisNoMes(anchorYmd: string, alvoYM: string): string[] {
  const a = toDateOnly(anchorYmd);
  const m = String(alvoYM || '').match(/^(\d{4})-(\d{2})$/);
  if (!a || !m) return [];
  const [ay, am, ad] = a.split('-').map(Number);
  const anchor = Date.UTC(ay, am - 1, ad);
  const ty = Number(m[1]);
  const tm = Number(m[2]);
  const monthStart = Date.UTC(ty, tm - 1, 1);
  const monthEnd = Date.UTC(ty, tm, 0); // ultimo dia do mes alvo
  let d = anchor;
  if (d < monthStart) {
    const steps = Math.ceil((monthStart - d) / (7 * DIA_MS));
    d = anchor + steps * 7 * DIA_MS;
  }
  const out: string[] = [];
  for (; d <= monthEnd; d += 7 * DIA_MS) {
    if (d <= anchor) continue; // exclui a ancora e datas anteriores
    out.push(ymdUTC(d));
  }
  return out;
}

function isMissingOnConflictConstraint(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || error || '');
  return message.includes('no unique or exclusion constraint matching the ON CONFLICT specification');
}

/** Gera instancias recorrentes para um mes (YYYY-MM), se aplicavel. */
export async function ensureRecorrentesInstancias(
  admin: SupabaseAdminLike,
  competenciaYM: string
): Promise<{ criadas: number }> {
  const alvo = competenciaPrimeiroDia(competenciaYM);
  if (!alvo) return { criadas: 0 };

  const [yyyy, mm] = alvo.split('-');
  const alvoYM = `${yyyy}-${mm}`;

  const { data: recorrentes, error: errRec } = await admin
    .from('contas_pagar')
    .select('*')
    .eq('tipo_lancamento', 'recorrente')
    .neq('status', 'cancelado')
    .neq('status', 'finalizado')
    .is('recorrente_modelo_id', null);

  if (errRec) throw errRec;
  if (!recorrentes?.length) return { criadas: 0 };

  const { data: existentes, error: errEx } = await admin
    .from('contas_pagar')
    .select('recorrente_modelo_id, data_vencimento')
    .eq('competencia', alvo)
    .not('recorrente_modelo_id', 'is', null);

  if (errEx) throw errEx;

  // Dedup por data: (modelo, data_vencimento). Serve mensal e semanal.
  const geradosPorData = new Set(
    (existentes || []).map((e: any) => `${e.recorrente_modelo_id}|${e.data_vencimento}`)
  );

  const makeInstancia = (modelo: ContaPagarRecorrente, venc: string) => {
    const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = modelo;
    return {
      ...rest,
      recorrente_modelo_id: modelo.id,
      competencia: competenciaPrimeiroDia(venc),
      data_vencimento: venc,
      status: 'pendente',
      data_pagamento: null,
      metodo_pagamento: null,
    };
  };

  const novos: any[] = [];
  for (const modelo of recorrentes as ContaPagarRecorrente[]) {
    const inicioYM = ymFromCompetencia(modelo.competencia);
    if (!inicioYM || alvoYM < inicioYM) continue;
    const freq = (modelo as any).recorrente_frequencia === 'semanal' ? 'semanal' : 'mensal';

    if (freq === 'semanal') {
      for (const venc of ocorrenciasSemanaisNoMes(modelo.data_vencimento, alvoYM)) {
        if (geradosPorData.has(`${modelo.id}|${venc}`)) continue;
        novos.push(makeInstancia(modelo, venc));
      }
    } else {
      // O registro modelo ja representa o mes de inicio - nao duplicar instancia.
      if (alvoYM === inicioYM) continue;
      const dataVencOriginal = new Date(`${modelo.data_vencimento}T00:00:00`);
      const dia = String(dataVencOriginal.getDate()).padStart(2, '0');
      const venc = `${yyyy}-${mm}-${dia}`;
      if (geradosPorData.has(`${modelo.id}|${venc}`)) continue;
      if (modelo.status === 'pago' && competenciaPrimeiroDia(modelo.competencia || '') === alvo) continue;
      novos.push(makeInstancia(modelo, venc));
    }
  }

  if (novos.length === 0) return { criadas: 0 };

  const { error: errIns } = await admin.from('contas_pagar').upsert(novos, {
    onConflict: 'recorrente_modelo_id,data_vencimento',
    ignoreDuplicates: true,
  });
  if (errIns) {
    if (!isMissingOnConflictConstraint(errIns)) throw errIns;

    const { error: errFallback } = await admin.from('contas_pagar').insert(novos);
    if (errFallback) throw errFallback;
  }

  return { criadas: novos.length };
}
