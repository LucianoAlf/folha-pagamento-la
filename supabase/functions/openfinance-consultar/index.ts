import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Ponte AO VIVO com o Open Finance (Pluggy) para consulta sob demanda da Maria.
// Diferente do snapshot diário (openfinance-sync-saldos, que grava a tabela para o relatório
// das 08:00): esta função NÃO grava nada — autentica na Pluggy, busca na hora e devolve.
// A Maria chama sob demanda ("quanto tem na conta agora?", "últimas compras do cartão?"),
// mesmo padrão de auth (x-cron-secret ou JWT) que ela já usa em contas-pagar-dia-gerar.
//
// Credencial NUNCA na VPS: fica no Vault do Supabase. Roteamento por aplicação Pluggy
// (coluna pluggy_app): 'la_music' (Santander) x 'mercado_pago' — item só é legível pela app
// que o criou.
//
// Ações:
//   { acao: "contas" }                       -> saldo ao vivo das contas correntes mapeadas
//   { acao: "cartoes" }                       -> limite/disponível/usado ao vivo dos cartões
//   { acao: "transacoes", alvo, tipo, pageSize, from } -> últimas transações (v2)
//   { acao: "probe", itemId, app }            -> /accounts cru de um item (debug/mapeamento)
//
// /transactions v1 está DEPRECADO (410). Usar /v2/transactions (cursor pagination).
// Conta corrente costuma voltar vazia sem from=YYYY-MM-DD; cartão vem direto.

const PLUGGY_API_BASE = "https://api.pluggy.ai";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getSecretFromVault(supabaseAdmin: ReturnType<typeof createClient>, name: string) {
  const { data, error } = await supabaseAdmin.rpc("get_vault_secret", { secret_name: name });
  if (error) throw error;
  return (data as any) as string | null;
}

async function getSecret(supabaseAdmin: ReturnType<typeof createClient>, name: string) {
  const env = Deno.env.get(name);
  if (env && env.trim()) return env.trim();
  const fromVault = await getSecretFromVault(supabaseAdmin, name);
  if (fromVault && String(fromVault).trim()) return String(fromVault).trim();
  throw new Error(`${name} nao configurado (Secrets ou Vault).`);
}

function credsSecretNames(app: string): { idName: string; secretName: string } {
  if (app === "mercado_pago") {
    return { idName: "PLUGGY_MP_CLIENT_ID", secretName: "PLUGGY_MP_CLIENT_SECRET" };
  }
  return { idName: "PLUGGY_CLIENT_ID", secretName: "PLUGGY_CLIENT_SECRET" };
}

async function autenticarPluggy(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${PLUGGY_API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) throw new Error(`Pluggy /auth (app) falhou: HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.apiKey) throw new Error("Pluggy /auth nao retornou apiKey.");
  return data.apiKey as string;
}

async function accountsDoItem(apiKey: string, itemId: string): Promise<any[]> {
  const res = await fetch(`${PLUGGY_API_BASE}/accounts?itemId=${encodeURIComponent(itemId)}`, {
    headers: { "X-API-KEY": apiKey },
  });
  if (!res.ok) throw new Error(`Pluggy /accounts (item ${itemId}) falhou: HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.results || []);
}

// O /v2/transactions devolve { results, next }. `next` pode ser URL absoluta/relativa de
// api.pluggy.ai ou um token de cursor. Retorna { url } (para buscar direto) ou { cursor }
// (para mandar como ?cursor=), ou null quando não há mais página.
function extrairProxima(data: any): { url?: string; cursor?: string } | null {
  const next = data?.next ?? data?.nextCursor ?? data?.cursor ?? data?.paging?.next ?? null;
  if (!next) return null;
  if (typeof next === "string") {
    if (/^https?:\/\//i.test(next)) {
      try {
        if (new URL(next).host === "api.pluggy.ai") return { url: next };
      } catch { /* cai para token abaixo */ }
      return null; // URL de host inesperado: não seguir
    }
    // Query relativa pronta (ex.: "?accountId=...&after=<token>"): usar verbatim no endpoint.
    if (next.startsWith("?")) return { url: `${PLUGGY_API_BASE}/v2/transactions${next}` };
    if (next.startsWith("/")) return { url: `${PLUGGY_API_BASE}${next}` };
    return { cursor: next };
  }
  return null;
}

// Busca transações de uma account no /v2/transactions, paginando por cursor até cobrir o
// período/limite pedido. O v2 usa cursor (rejeita pageSize e from), e vem ordenado do mais
// recente. Modos:
//   - desde=YYYY-MM-DD: acumula páginas até a mais antiga da página passar de `desde`, depois
//     filtra por data >= desde (janela de mês inteiro para conciliação).
//   - senão: acumula até atingir `limite` transações.
// Guarda contra loop (cursor errado que devolve a mesma página) e cap de páginas.
async function transacoesDaConta(
  apiKey: string,
  accountId: string,
  opts: { limite?: number; desde?: string | null; maxPaginas?: number },
): Promise<{ transacoes: any[]; _debug: Record<string, unknown> }> {
  const limite = Math.min(Math.max(opts.limite ?? 50, 1), 1000);
  const desde = opts.desde ?? null;
  const maxPaginas = opts.maxPaginas ?? 25;

  const acumulado: any[] = [];
  let proxima: { url?: string; cursor?: string } | null = null;
  let paginas = 0;
  let primeiroIdAnterior: string | null = null;
  let envelopeKeys: string[] = [];
  let nextRaw: string | null = null;
  let paradaPor = "sem_mais_paginas";

  while (paginas < maxPaginas) {
    let url: string;
    if (proxima?.url) {
      url = proxima.url;
    } else {
      const params = new URLSearchParams({ accountId });
      if (proxima?.cursor) params.set("cursor", proxima.cursor);
      url = `${PLUGGY_API_BASE}/v2/transactions?${params.toString()}`;
    }
    const res = await fetch(url, { headers: { "X-API-KEY": apiKey } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (paginas === 0) throw new Error(`Pluggy /v2/transactions HTTP ${res.status}: ${body.slice(0, 400)}`);
      paradaPor = `erro_pagina_${paginas + 1}_http_${res.status}`;
      break;
    }
    const data = await res.json();
    paginas++;
    envelopeKeys = data && typeof data === "object" && !Array.isArray(data) ? Object.keys(data) : ["<array>"];
    const rawNext = data?.next ?? null;
    nextRaw = rawNext == null ? null : (typeof rawNext === "string" ? rawNext.slice(0, 160) : JSON.stringify(rawNext).slice(0, 160));
    const lista = data?.results || data?.data || (Array.isArray(data) ? data : []);

    // Guarda anti-loop: se a página repete o 1º id da anterior, a paginação não avançou.
    const primeiroId = lista.length ? String(lista[0]?.id ?? "") : "";
    if (paginas > 1 && primeiroId && primeiroId === primeiroIdAnterior) {
      paradaPor = "pagina_nao_avancou";
      break;
    }
    primeiroIdAnterior = primeiroId;
    acumulado.push(...lista);

    proxima = extrairProxima(data);

    if (!proxima) { paradaPor = "sem_mais_paginas"; break; }
    if (desde) {
      const maisAntiga = lista.length ? String(lista[lista.length - 1]?.date || "").slice(0, 10) : null;
      if (maisAntiga && maisAntiga < desde) { paradaPor = "cobriu_periodo"; break; }
    } else if (acumulado.length >= limite) {
      paradaPor = "atingiu_limite";
      break;
    }
  }
  if (paginas >= maxPaginas) paradaPor = "cap_de_paginas";

  let transacoes = acumulado;
  if (desde) transacoes = transacoes.filter((t) => String(t?.date || "").slice(0, 10) >= desde);
  else transacoes = transacoes.slice(0, limite);

  return {
    transacoes,
    _debug: { paginas, bruto: acumulado.length, retornado: transacoes.length, parada_por: paradaPor, envelope_keys: envelopeKeys, next_raw: nextRaw },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return json({ success: false, error: "Supabase env vars ausentes." }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Auth: x-cron-secret (serviço/Maria) OU JWT de usuário autenticado.
    const cronSecretHeader = (req.headers.get("x-cron-secret") || "").trim();
    let chamadaServico = false;
    if (cronSecretHeader) {
      const cronSecret = await getSecret(supabaseAdmin, "WHATSAPP_CRON_SECRET");
      if (cronSecretHeader !== cronSecret) {
        return json({ success: false, error: "cron secret invalido." }, 401);
      }
      chamadaServico = true;
    }
    if (!chamadaServico) {
      const authHeader = req.headers.get("authorization") || "";
      if (!authHeader) return json({ success: false, error: "Authorization ausente." }, 401);
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
      if (userErr || !userData?.user) return json({ success: false, error: "JWT invalido." }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    const acao = String(payload?.acao || "").trim();

    // Cache de apiKey por app dentro desta requisição.
    const apiKeyPorApp = new Map<string, string>();
    async function apiKeyDoApp(app: string): Promise<string> {
      if (apiKeyPorApp.has(app)) return apiKeyPorApp.get(app)!;
      const { idName, secretName } = credsSecretNames(app);
      const clientId = await getSecret(supabaseAdmin, idName);
      const clientSecret = await getSecret(supabaseAdmin, secretName);
      const apiKey = await autenticarPluggy(clientId, clientSecret);
      apiKeyPorApp.set(app, apiKey);
      return apiKey;
    }

    if (acao === "probe") {
      const itemId = String(payload?.itemId || "").trim();
      const app = String(payload?.app || "la_music").trim();
      if (!itemId) return json({ success: false, error: "probe exige itemId." }, 400);
      try {
        const apiKey = await apiKeyDoApp(app);
        const accounts = await accountsDoItem(apiKey, itemId);
        return json({
          success: true,
          acao,
          app,
          itemId,
          total: accounts.length,
          accounts: accounts.map((a) => ({
            id: a.id,
            type: a.type,
            subtype: a.subtype,
            name: a.name,
            number: a.number,
            balance: a.balance,
            currencyCode: a.currencyCode,
            creditData: a.creditData
              ? {
                  creditLimit: a.creditData.creditLimit,
                  availableCreditLimit: a.creditData.availableCreditLimit,
                  balanceDueDate: a.creditData.balanceDueDate,
                  minimumPayment: a.creditData.minimumPayment,
                  brand: a.creditData.brand,
                  level: a.creditData.level,
                }
              : null,
          })),
        });
      } catch (e: any) {
        return json({ success: true, acao, app, itemId, erro: e?.message || String(e) });
      }
    }

    if (acao === "contas") {
      const { data: contas, error } = await supabaseAdmin
        .from("financeiro_contas_bancarias")
        .select("id, apelido, pluggy_item_id, pluggy_account_id, pluggy_app, empresa:financeiro_empresas(label_operacional)")
        .not("pluggy_item_id", "is", null)
        .eq("ativo", true);
      if (error) throw error;

      const accountsCache = new Map<string, any[]>();
      const resultados: any[] = [];
      for (const conta of contas || []) {
        try {
          const app = (conta.pluggy_app as string) || "la_music";
          const cacheKey = `${app}:${conta.pluggy_item_id}`;
          if (!accountsCache.has(cacheKey)) {
            accountsCache.set(cacheKey, await accountsDoItem(await apiKeyDoApp(app), conta.pluggy_item_id as string));
          }
          const accounts = accountsCache.get(cacheKey)!;
          const acc = (conta.pluggy_account_id && accounts.find((a) => a.id === conta.pluggy_account_id))
            || accounts.find((a) => a.type === "BANK");
          if (!acc) throw new Error("account BANK nao encontrada.");
          resultados.push({
            unidade: (conta as any)?.empresa?.label_operacional ?? conta.apelido,
            conta: conta.apelido,
            saldo: acc.balance,
            atualizado_em: acc.updatedAt ?? null,
          });
        } catch (e: any) {
          resultados.push({ conta: conta.apelido, erro: e?.message || String(e) });
        }
      }
      return json({ success: true, acao, ao_vivo: true, resultados });
    }

    if (acao === "cartoes") {
      const { data: cartoes, error } = await supabaseAdmin
        .from("financeiro_cartoes")
        .select("id, apelido, final, pluggy_item_id, pluggy_account_id, pluggy_app, empresa:financeiro_empresas(label_operacional)")
        .not("pluggy_account_id", "is", null)
        .eq("ativo", true);
      if (error) throw error;

      const accountsCache = new Map<string, any[]>();
      const resultados: any[] = [];
      for (const cartao of cartoes || []) {
        try {
          const app = (cartao.pluggy_app as string) || "la_music";
          const cacheKey = `${app}:${cartao.pluggy_item_id}`;
          if (!accountsCache.has(cacheKey)) {
            accountsCache.set(cacheKey, await accountsDoItem(await apiKeyDoApp(app), cartao.pluggy_item_id as string));
          }
          const accounts = accountsCache.get(cacheKey)!;
          const acc = accounts.find((a) => a.id === cartao.pluggy_account_id);
          if (!acc) throw new Error("account CREDIT nao encontrada.");
          const cd = acc.creditData || {};
          resultados.push({
            unidade: (cartao as any)?.empresa?.label_operacional ?? cartao.apelido,
            cartao: cartao.apelido,
            final: cartao.final,
            limite: cd.creditLimit ?? null,
            disponivel: cd.availableCreditLimit ?? null,
            usado: acc.balance ?? null,
            vencimento: cd.balanceDueDate ?? null,
            pagamento_minimo: cd.minimumPayment ?? null,
            atualizado_em: acc.updatedAt ?? null,
          });
        } catch (e: any) {
          resultados.push({ cartao: cartao.apelido, erro: e?.message || String(e) });
        }
      }
      return json({ success: true, acao, ao_vivo: true, resultados });
    }

    if (acao === "transacoes") {
      const alvo = String(payload?.alvo || "").trim(); // apelido/final do cartão ou conta
      const tipo = String(payload?.tipo || "cartao").trim(); // 'cartao' | 'conta'
      // limite = total máximo de transações (default 50, até 1000). desde = janela YYYY-MM-DD
      // (mês inteiro p/ conciliação); a paginação por cursor acumula até cobrir o período.
      const limite = Math.min(Math.max(Number(payload?.limite ?? payload?.pageSize) || 50, 1), 1000);
      const desde = payload?.desde ? String(payload.desde).slice(0, 10) : null;
      if (!alvo) return json({ success: false, error: "transacoes exige 'alvo' (apelido ou final)." }, 400);
      if (desde && !/^\d{4}-\d{2}-\d{2}$/.test(desde)) {
        return json({ success: false, error: "desde invalido: use YYYY-MM-DD." }, 400);
      }
      // Sanitiza 'alvo' antes de entrar no filtro .or() do PostgREST: só letras (com acento),
      // dígitos, espaço e hífen. Bloqueia vírgula/parênteses/ponto/%/*/aspas — os metacaracteres
      // que permitiriam manipular a expressão de filtro. Defesa em profundidade: o chamador já é
      // autenticado, mas o valor não deve poder alterar a lógica da consulta.
      if (!/^[\p{L}\p{N}\s-]{1,60}$/u.test(alvo)) {
        return json({ success: false, error: "alvo invalido: use apenas letras, numeros, espaco ou hifen." }, 400);
      }

      let row: any = null;
      let app = "la_music";
      let accountId: string | null = null;
      if (tipo === "conta") {
        const { data } = await supabaseAdmin
          .from("financeiro_contas_bancarias")
          .select("apelido, pluggy_account_id, pluggy_app")
          .not("pluggy_account_id", "is", null)
          .or(`apelido.ilike.%${alvo}%,conta.ilike.%${alvo}%`)
          .limit(1);
        row = data?.[0];
      } else {
        // final é numérico; só faz o eq exato quando alvo é só dígitos.
        const condicoes = /^\d+$/.test(alvo)
          ? `apelido.ilike.%${alvo}%,final.eq.${alvo}`
          : `apelido.ilike.%${alvo}%`;
        const { data } = await supabaseAdmin
          .from("financeiro_cartoes")
          .select("apelido, final, pluggy_account_id, pluggy_app")
          .not("pluggy_account_id", "is", null)
          .or(condicoes)
          .limit(1);
        row = data?.[0];
      }
      if (!row) return json({ success: false, error: `Nada encontrado para '${alvo}' (tipo ${tipo}).` }, 404);
      app = (row.pluggy_app as string) || "la_music";
      accountId = row.pluggy_account_id as string;

      const apiKey = await apiKeyDoApp(app);
      const { transacoes, _debug } = await transacoesDaConta(apiKey, accountId, { limite, desde });
      return json({
        success: true,
        acao,
        ao_vivo: true,
        alvo: row.apelido,
        tipo,
        desde,
        total: transacoes.length,
        // Visibilidade operacional: se parada_por vier 'cap_de_paginas', a janela foi grande
        // demais e pode ter truncado — aumentar maxPaginas ou estreitar 'desde'.
        paginacao: { paginas: _debug.paginas, bruto: _debug.bruto, parada_por: _debug.parada_por },
        transacoes: transacoes.map((t: any) => ({
          descricao: t.description ?? t.descriptionRaw ?? null,
          valor: t.amount ?? null,
          moeda: t.currencyCode ?? null,
          data: t.date ?? null,
          categoria: t.category ?? null,
          status: t.status ?? null,
        })),
      });
    }

    return json({ success: false, error: `acao desconhecida: '${acao}'. Use contas|cartoes|transacoes|probe.` }, 400);
  } catch (e: any) {
    console.error("openfinance-consultar:", e?.message || "Erro inesperado.");
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});
