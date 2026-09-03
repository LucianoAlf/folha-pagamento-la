import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Sincroniza o snapshot diário de Open Finance (Pluggy) para o Super Folha:
//  - conta corrente (accounts type BANK)  -> financeiro_conta_saldos_diarios (saldo + payload)
//  - cartão de crédito (accounts type CREDIT) -> financeiro_cartao_saldos_diarios (limite/
//    disponível/usado/vencimento/mínimo + payload)
// Captura TUDO que o /accounts entrega: os campos úteis viram colunas e o objeto bruto inteiro
// fica em payload (jsonb), para consulta futura sem migration nova.
// Uma chamada /accounts por item (não por conta) — banco e cartões de um item vêm juntos.
// Detalhe transação a transação (extrato/itens de fatura) é outra fatia (reconciliação).

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

async function getSecretFromVault(
  supabaseAdmin: ReturnType<typeof createClient>,
  name: string,
) {
  const { data, error } = await supabaseAdmin.rpc("get_vault_secret", {
    secret_name: name,
  });
  if (error) throw error;
  return (data as any) as string | null;
}

async function getSecret(
  supabaseAdmin: ReturnType<typeof createClient>,
  name: string,
) {
  const env = Deno.env.get(name);
  if (env && env.trim()) return env.trim();
  const fromVault = await getSecretFromVault(supabaseAdmin, name);
  if (fromVault && String(fromVault).trim()) return String(fromVault).trim();
  throw new Error(`${name} nao configurado (Secrets ou Vault).`);
}

// Cada item pertence a uma aplicação Pluggy (coluna pluggy_app). 'la_music' usa as credenciais
// do Santander; 'mercado_pago' usa as do cartão pessoal do Alf. Item só é legível pela app dona.
function credsSecretNames(app: string): { idName: string; secretName: string } {
  if (app === "mercado_pago") {
    return { idName: "PLUGGY_MP_CLIENT_ID", secretName: "PLUGGY_MP_CLIENT_SECRET" };
  }
  return { idName: "PLUGGY_CLIENT_ID", secretName: "PLUGGY_CLIENT_SECRET" };
}

function hojeSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function toNum(v: unknown): number | null {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

function toDateOnly(v: unknown): string | null {
  const s = String(v || "");
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

async function autenticarPluggy(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${PLUGGY_API_BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) throw new Error(`Pluggy /auth falhou: HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.apiKey) throw new Error("Pluggy /auth nao retornou apiKey.");
  return data.apiKey as string;
}

async function buscarAccountsDoItem(apiKey: string, itemId: string): Promise<any[]> {
  const res = await fetch(`${PLUGGY_API_BASE}/accounts?itemId=${encodeURIComponent(itemId)}`, {
    headers: { "X-API-KEY": apiKey },
  });
  if (!res.ok) throw new Error(`Pluggy /accounts falhou (itemId ${itemId}): HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.results || []);
}

function acharAccount(accounts: any[], accountId: string | null, tipo: "BANK" | "CREDIT") {
  if (accountId) {
    const exato = accounts.find((c) => c.id === accountId);
    if (exato) return exato;
  }
  return accounts.find((c) => c.type === tipo) || null;
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
      if (userErr || !userData?.user) {
        return json({ success: false, error: "JWT invalido." }, 401);
      }
    }

    // apiKey por aplicação Pluggy (cache dentro da requisição).
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

    const { data: contas, error: contasError } = await supabaseAdmin
      .from("financeiro_contas_bancarias")
      .select("id, apelido, pluggy_item_id, pluggy_account_id, pluggy_app")
      .not("pluggy_item_id", "is", null)
      .eq("ativo", true);
    if (contasError) throw contasError;

    const { data: cartoes, error: cartoesError } = await supabaseAdmin
      .from("financeiro_cartoes")
      .select("id, apelido, pluggy_item_id, pluggy_account_id, pluggy_app")
      .not("pluggy_account_id", "is", null)
      .eq("ativo", true);
    if (cartoesError) throw cartoesError;

    // Uma chamada /accounts por item distinto, usando a apiKey da app dona do item.
    const appPorItem = new Map<string, string>();
    for (const c of contas || []) if (c.pluggy_item_id) appPorItem.set(c.pluggy_item_id as string, (c.pluggy_app as string) || "la_music");
    for (const c of cartoes || []) if (c.pluggy_item_id) appPorItem.set(c.pluggy_item_id as string, (c.pluggy_app as string) || "la_music");

    const accountsPorItem = new Map<string, any[]>();
    const itensComErro: Array<{ item: string; erro: string }> = [];
    for (const [itemId, app] of appPorItem) {
      try {
        accountsPorItem.set(itemId, await buscarAccountsDoItem(await apiKeyDoApp(app), itemId));
      } catch (e: any) {
        itensComErro.push({ item: itemId, erro: e?.message || String(e) });
      }
    }

    const dataRef = hojeSaoPaulo();
    const capturadoEm = new Date().toISOString();
    const contasResultado: Array<{ conta: string; ok: boolean; saldo?: number; erro?: string }> = [];
    const cartoesResultado: Array<{ cartao: string; ok: boolean; usado?: number; limite?: number; erro?: string }> = [];

    for (const conta of contas || []) {
      try {
        const accounts = accountsPorItem.get(conta.pluggy_item_id as string);
        if (!accounts) throw new Error("item sem accounts (falha na busca).");
        const acc = acharAccount(accounts, conta.pluggy_account_id as string | null, "BANK");
        if (!acc) throw new Error("nenhuma account BANK no item.");
        const saldo = toNum(acc.balance);
        if (saldo == null) throw new Error("account BANK sem saldo numerico.");

        const { error: upErr } = await supabaseAdmin
          .from("financeiro_conta_saldos_diarios")
          .upsert(
            {
              conta_bancaria_id: conta.id,
              data_referencia: dataRef,
              saldo,
              origem: "openfinance",
              pluggy_item_id: conta.pluggy_item_id,
              pluggy_account_id: acc.id,
              payload: acc,
              capturado_em: capturadoEm,
            },
            { onConflict: "conta_bancaria_id,data_referencia" },
          );
        if (upErr) throw upErr;
        contasResultado.push({ conta: conta.apelido || conta.id, ok: true, saldo });
      } catch (e: any) {
        contasResultado.push({ conta: conta.apelido || conta.id, ok: false, erro: e?.message || String(e) });
      }
    }

    for (const cartao of cartoes || []) {
      try {
        const accounts = accountsPorItem.get(cartao.pluggy_item_id as string);
        if (!accounts) throw new Error("item sem accounts (falha na busca).");
        const acc = acharAccount(accounts, cartao.pluggy_account_id as string | null, "CREDIT");
        if (!acc) throw new Error("nenhuma account CREDIT correspondente no item.");
        const cd = acc.creditData || {};

        const { error: upErr } = await supabaseAdmin
          .from("financeiro_cartao_saldos_diarios")
          .upsert(
            {
              cartao_id: cartao.id,
              data_referencia: dataRef,
              limite: toNum(cd.creditLimit),
              disponivel: toNum(cd.availableCreditLimit),
              usado: toNum(acc.balance),
              vencimento: toDateOnly(cd.balanceDueDate),
              pagamento_minimo: toNum(cd.minimumPayment),
              marca: cd.brand ?? null,
              nivel: cd.level ?? null,
              moeda: acc.currencyCode ?? null,
              origem: "openfinance",
              pluggy_item_id: cartao.pluggy_item_id,
              pluggy_account_id: acc.id,
              payload: acc,
              capturado_em: capturadoEm,
            },
            { onConflict: "cartao_id,data_referencia" },
          );
        if (upErr) throw upErr;
        cartoesResultado.push({
          cartao: cartao.apelido || cartao.id,
          ok: true,
          usado: toNum(acc.balance) ?? undefined,
          limite: toNum(cd.creditLimit) ?? undefined,
        });
      } catch (e: any) {
        cartoesResultado.push({ cartao: cartao.apelido || cartao.id, ok: false, erro: e?.message || String(e) });
      }
    }

    return json({
      success: true,
      data_referencia: dataRef,
      contas: {
        sincronizadas: contasResultado.filter((r) => r.ok).length,
        total: contasResultado.length,
        resultados: contasResultado,
      },
      cartoes: {
        sincronizados: cartoesResultado.filter((r) => r.ok).length,
        total: cartoesResultado.length,
        resultados: cartoesResultado,
      },
      itens_com_erro: itensComErro,
    });
  } catch (e: any) {
    console.error("openfinance-sync-saldos:", e?.message || "Erro inesperado.");
    return json({ success: false, error: e?.message || "Erro inesperado." }, 500);
  }
});
