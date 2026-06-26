import { Colaborador, FolhaMensal, Lancamento, UserProfile } from '../types';
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  // Cache curto para evitar chamar getSession em toda requisição.
  // Reduz overhead perceptível quando várias chamadas partem em sequência.
  if (authHeadersCache && Date.now() < authHeadersCache.expiresAt) {
    return authHeadersCache.headers;
  }

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    // With RLS hardened to authenticated, any anonymous request will fail.
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  authHeadersCache = {
    headers,
    expiresAt: Date.now() + 30_000, // 30s é suficiente para bursts de chamadas.
  };

  return headers;
}

let authHeadersCache: { headers: Record<string, string>; expiresAt: number } | null = null;

export const api = {
  async fetchUserProfile(userId: string): Promise<UserProfile | null> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=*&id=eq.${userId}&limit=1`, { headers });
    if (!res.ok) throw new Error('Erro ao buscar perfil do usuário');
    const rows = await res.json();
    return Array.isArray(rows) && rows.length ? (rows[0] as UserProfile) : null;
  },

  async upsertUserProfile(profile: Pick<UserProfile, 'id' | 'nome' | 'avatar_url' | 'role'>): Promise<UserProfile> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?on_conflict=id`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(profile),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[avatar-save] FALHOU', res.status, res.statusText, '| body:', text, '| payloadKB:', Math.round(JSON.stringify(profile).length / 1024));
      throw new Error(`Erro ${res.status} ao salvar perfil. ${text || res.statusText}`.trim());
    }
    const rows = await res.json();
    return rows[0] as UserProfile;
  },

  async fetchFolhaAiInsights(input: { folhaId: number; force?: boolean }): Promise<any> {
    const { data, error } = await supabase.functions.invoke('ai-payroll-insights', {
      body: input
    });

    if (error) {
      // Tenta extrair mensagem amigável do erro da função
      const msg = error.message || 'Erro desconhecido';
      throw new Error(`Erro ao gerar insights IA: ${msg}`);
    }

    return data;
  },

  async upsertColaboradorVariacaoNota(input: { folhaId: number; colaboradorId: number; nota: string }): Promise<void> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_colaborador_variacao_nota`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_folha_id: input.folhaId,
        p_colaborador_id: input.colaboradorId,
        p_nota: input.nota,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Erro ao salvar motivo${text ? `: ${text}` : ''}`);
    }
  },

  async fetchColaboradorVariacaoNotas(folhaId: number): Promise<Array<{ colaborador_id: number; nota: string | null }>> {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/colaborador_variacao_notas?select=colaborador_id,nota&folha_id=eq.${folhaId}`,
      { headers }
    );
    if (!res.ok) throw new Error('Erro ao buscar motivos');
    return res.json();
  },

  async fetchColaboradores(): Promise<Colaborador[]> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/colaboradores?select=*&arquivado_em=is.null&order=nome`, { headers });
    if (!res.ok) throw new Error('Erro ao buscar colaboradores');
    return res.json();
  },

  async createColaborador(input: Partial<Colaborador>): Promise<Colaborador> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/colaboradores`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...input,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error('Erro ao criar colaborador');
    const rows = await res.json();
    return rows[0];
  },

  async updateColaborador(id: number, patch: Partial<Colaborador>): Promise<Colaborador> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/colaboradores?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error('Erro ao atualizar colaborador');
    const rows = await res.json();
    return rows[0];
  },

  async deleteColaborador(id: number): Promise<void> {
    const headers = await getAuthHeaders();
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/colaboradores?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        ativo: false,
        status: 'inactive',
        arquivado_em: new Date().toISOString(),
        ...(userId ? { arquivado_por: userId } : {}),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Erro ao excluir colaborador${text ? `: ${text}` : ''}`);
    }
  },

  async fetchFolhasMensais(): Promise<FolhaMensal[]> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/folhas_mensais?select=*&order=ano.desc,mes.desc`, { headers });
    if (!res.ok) throw new Error('Erro ao buscar folhas');
    return res.json();
  },

  async createFolhaMensal(input: { ano: number; mes: number }): Promise<FolhaMensal> {
    // Avoid duplicates: if month already exists, return it
    const headers = await getAuthHeaders();
    const check = await fetch(
      `${SUPABASE_URL}/rest/v1/folhas_mensais?select=*&ano=eq.${input.ano}&mes=eq.${input.mes}&limit=1`,
      { headers }
    );
    if (!check.ok) throw new Error('Erro ao verificar folha existente');
    const existing = await check.json();
    if (Array.isArray(existing) && existing.length > 0) return existing[0];

    const res = await fetch(`${SUPABASE_URL}/rest/v1/folhas_mensais`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ano: input.ano,
        mes: input.mes,
        status: 'rascunho',
        total_geral: 0,
        total_cg: 0,
        total_rec: 0,
        total_bar: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error('Erro ao criar folha mensal');
    const rows = await res.json();
    return rows[0];
  },

  async deleteFolhaMensal(folhaId: number): Promise<void> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/folhas_mensais?id=eq.${folhaId}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error('Erro ao excluir folha mensal');
  },

  async updateFolhaMensal(id: number, patch: Partial<FolhaMensal>): Promise<FolhaMensal> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/folhas_mensais?id=eq.${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error('Erro ao atualizar folha mensal');
    const rows = await res.json();
    return rows[0];
  },

  async fetchLancamentos(folhaId: number): Promise<Lancamento[]> {
    const headers = await getAuthHeaders();
    // Evita payload gigante no bootstrap: só os campos realmente usados na UI.
    // Antes: colaboradores(*) repetia colunas pesadas para cada lançamento.
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/lancamentos_folha?select=*,colaboradores(id,nome,funcao)&folha_id=eq.${folhaId}&order=categoria,colaborador_id`,
      { headers }
    );
    if (!res.ok) throw new Error('Erro ao buscar lançamentos');
    return res.json();
  },

  async createLancamento(input: Omit<Lancamento, 'id' | 'total' | 'colaboradores'>): Promise<Lancamento> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lancamentos_folha`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...input,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error('Erro ao criar lançamento');
    const rows = await res.json();
    return rows[0];
  },

  async updateLancamento(lancamentoId: number, patch: Partial<Lancamento>): Promise<Lancamento> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lancamentos_folha?id=eq.${lancamentoId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Erro ao atualizar lançamento${text ? `: ${text}` : ''}`);
    }
    const rows = await res.json();
    return rows[0];
  },

  async duplicateLancamentos(input: { fromFolhaId: number; toFolhaId: number; unidade: 'cg' | 'rec' | 'bar' }): Promise<number> {
    const headers = await getAuthHeaders();
    const [sourceRes, targetRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/lancamentos_folha?select=colaborador_id,unidade,categoria,salario,bonus,comissao,reembolso,passagem,inss,descontos&folha_id=eq.${input.fromFolhaId}&unidade=eq.${input.unidade}`,
        { headers }
      ),
      fetch(
        `${SUPABASE_URL}/rest/v1/lancamentos_folha?select=colaborador_id,unidade,categoria&folha_id=eq.${input.toFolhaId}&unidade=eq.${input.unidade}`,
        { headers }
      ),
    ]);

    if (!sourceRes.ok) throw new Error('Erro ao buscar lançamentos de origem');
    if (!targetRes.ok) throw new Error('Erro ao buscar lançamentos de destino');

    const source = await sourceRes.json();
    const target = await targetRes.json();

    const key = (r: any) => `${r.colaborador_id}|${r.unidade}|${r.categoria}`;
    const targetKeys = new Set((target || []).map(key));

    const toInsert = (source || [])
      .filter((s: any) => !targetKeys.has(key(s)))
      .map((s: any) => ({
        folha_id: input.toFolhaId,
        colaborador_id: s.colaborador_id,
        unidade: s.unidade,
        categoria: s.categoria,
        salario: Number(s.salario) || 0,
        bonus: Number(s.bonus) || 0,
        comissao: Number(s.comissao) || 0,
        reembolso: Number(s.reembolso) || 0,
        passagem: Number(s.passagem) || 0,
        inss: Number(s.inss) || 0,
        descontos: Number(s.descontos) || 0,
        alert_checked: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

    if (toInsert.length === 0) return 0;

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/lancamentos_folha`, {
      method: 'POST',
      headers,
      body: JSON.stringify(toInsert),
    });
    if (!insertRes.ok) throw new Error('Erro ao duplicar lançamentos');

    return toInsert.length;
  },

  async updateFolhaStatus(folhaId: number, status: string): Promise<FolhaMensal[]> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/folhas_mensais?id=eq.${folhaId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error('Erro ao atualizar status');
    return res.json();
  },

  async markAlertAsChecked(colaboradorId: number, folhaId: number): Promise<void> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lancamentos_folha?colaborador_id=eq.${colaboradorId}&folha_id=eq.${folhaId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ alert_checked: true })
    });
    if (!res.ok) throw new Error('Erro ao confirmar alerta');
  },

  async deleteLancamento(lancamentoId: number): Promise<void> {
    const headers = await getAuthHeaders();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lancamentos_folha?id=eq.${lancamentoId}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error('Erro ao excluir lançamento');
  }
};

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
};

export const getMesNome = (mes: number) => {
  const meses = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  return meses[mes] || '';
};
