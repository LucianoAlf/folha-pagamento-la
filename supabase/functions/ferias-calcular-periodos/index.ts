import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, prefer",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    // Criar cliente Supabase com service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validar token do usuário
    const { data: { user }, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userErr || !user) {
      return jsonResponse({ error: "Invalid token or user not found" }, 401);
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const colaboradorId = body?.colaboradorId ? Number(body.colaboradorId) : null;

    console.log(`[ferias-calcular-periodos] User: ${user.id}, ColaboradorId: ${colaboradorId || "ALL"}`);

    // Se colaboradorId foi fornecido, calcular apenas para esse colaborador
    if (colaboradorId) {
      console.log(`[ferias-calcular-periodos] Calculando períodos para colaborador ${colaboradorId}`);

      const { data, error } = await supabase.rpc("calcular_periodos_aquisitivos", {
        p_colaborador_id: colaboradorId,
      });

      if (error) {
        console.error(`[ferias-calcular-periodos] Erro ao calcular períodos:`, error);
        return jsonResponse({ error: error.message }, 500);
      }

      console.log(`[ferias-calcular-periodos] ${data} período(s) criado(s)/atualizado(s)`);

      return jsonResponse({
        success: true,
        colaboradorId,
        periodosGerados: data,
        message: `${data} período(s) aquisitivo(s) criado(s)/atualizado(s) para o colaborador ${colaboradorId}`,
      });
    }

    // Se não foi fornecido colaboradorId, calcular para todos os CLT ativos
    console.log(`[ferias-calcular-periodos] Calculando períodos para TODOS os CLT ativos`);

    // Buscar todos os colaboradores CLT ativos
    const { data: colaboradores, error: colabErr } = await supabase
      .from("colaboradores")
      .select("id, nome, data_admissao")
      // No schema atual, o vínculo CLT é armazenado em `tipo_contrato`
      .eq("tipo_contrato", "clt")
      .eq("status", "active")
      .not("data_admissao", "is", null);

    if (colabErr) {
      console.error(`[ferias-calcular-periodos] Erro ao buscar colaboradores:`, colabErr);
      return jsonResponse({ error: colabErr.message }, 500);
    }

    if (!colaboradores || colaboradores.length === 0) {
      console.log(`[ferias-calcular-periodos] Nenhum colaborador CLT ativo encontrado`);
      return jsonResponse({
        success: true,
        colaboradoresProcessados: 0,
        periodosGerados: 0,
        message: "Nenhum colaborador CLT ativo com data de admissão encontrado",
      });
    }

    console.log(`[ferias-calcular-periodos] ${colaboradores.length} colaborador(es) CLT encontrado(s)`);

    // Calcular períodos para cada colaborador
    let totalPeriodosGerados = 0;
    const resultados: Array<{ colaboradorId: number; nome: string; periodos: number; erro?: string }> = [];

    for (const c of colaboradores) {
      try {
        const { data: periodos, error: periodoErr } = await supabase.rpc("calcular_periodos_aquisitivos", {
          p_colaborador_id: c.id,
        });

        if (periodoErr) {
          console.error(`[ferias-calcular-periodos] Erro ao calcular períodos para ${c.nome} (${c.id}):`, periodoErr);
          resultados.push({
            colaboradorId: c.id,
            nome: c.nome,
            periodos: 0,
            erro: periodoErr.message,
          });
        } else {
          totalPeriodosGerados += (periodos || 0);
          resultados.push({
            colaboradorId: c.id,
            nome: c.nome,
            periodos: periodos || 0,
          });
          console.log(`[ferias-calcular-periodos] ${c.nome}: ${periodos} período(s)`);
        }
      } catch (err: any) {
        console.error(`[ferias-calcular-periodos] Exceção ao processar ${c.nome}:`, err);
        resultados.push({
          colaboradorId: c.id,
          nome: c.nome,
          periodos: 0,
          erro: err.message || "Erro desconhecido",
        });
      }
    }

    console.log(`[ferias-calcular-periodos] TOTAL: ${totalPeriodosGerados} período(s) gerado(s) para ${colaboradores.length} colaborador(es)`);

    return jsonResponse({
      success: true,
      colaboradoresProcessados: colaboradores.length,
      periodosGerados: totalPeriodosGerados,
      resultados,
      message: `${totalPeriodosGerados} período(s) aquisitivo(s) criado(s)/atualizado(s) para ${colaboradores.length} colaborador(es) CLT`,
    });

  } catch (error: any) {
    console.error(`[ferias-calcular-periodos] Erro geral:`, error);
    return jsonResponse({
      error: error.message || "Erro desconhecido",
      stack: error.stack,
    }, 500);
  }
});
