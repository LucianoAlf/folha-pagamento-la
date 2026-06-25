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
    .select('recorrente_modelo_id')
    .eq('competencia', alvo)
    .not('recorrente_modelo_id', 'is', null);

  if (errEx) throw errEx;

  const geradosSet = new Set((existentes || []).map((e: any) => e.recorrente_modelo_id));

  const faltantes = (recorrentes as ContaPagarRecorrente[]).filter((modelo) => {
    const inicioYM = ymFromCompetencia(modelo.competencia);
    if (!inicioYM) return false;
    // So gera a partir do mes de inicio do modelo (ex.: julho -> nao aparece em junho).
    if (alvoYM < inicioYM) return false;
    // O registro modelo ja representa o primeiro mes - nao duplicar instancia.
    if (alvoYM === inicioYM) return false;
    if (geradosSet.has(modelo.id)) return false;
    if (modelo.status === 'pago' && competenciaPrimeiroDia(modelo.competencia) === alvo) return false;
    return true;
  });

  if (faltantes.length === 0) return { criadas: 0 };

  const novos = faltantes.map((modelo) => {
    const dataVencOriginal = new Date(`${modelo.data_vencimento}T00:00:00`);
    const dia = String(dataVencOriginal.getDate()).padStart(2, '0');
    const novoVencimento = `${yyyy}-${mm}-${dia}`;
    const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = modelo;
    return {
      ...rest,
      recorrente_modelo_id: modelo.id,
      competencia: alvo,
      data_vencimento: novoVencimento,
      status: 'pendente',
      data_pagamento: null,
      metodo_pagamento: null,
    };
  });

  const { error: errIns } = await admin.from('contas_pagar').upsert(novos, {
    onConflict: 'recorrente_modelo_id,competencia',
    ignoreDuplicates: true,
  });
  if (errIns) {
    if (!isMissingOnConflictConstraint(errIns)) throw errIns;

    const { error: errFallback } = await admin.from('contas_pagar').insert(novos);
    if (errFallback) throw errFallback;
  }

  return { criadas: novos.length };
}
