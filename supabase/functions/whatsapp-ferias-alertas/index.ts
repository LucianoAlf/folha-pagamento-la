// =====================================================
// EDGE FUNCTION - ALERTAS DE FÉRIAS VIA WHATSAPP
// Data: 2026-02-07
// Descrição: Envia alertas automáticos sobre férias CLT
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface NotificacaoConfig {
  whatsapp_numero: string;
  ferias_alerta_vencimento_multa: boolean;
  ferias_alerta_concessivo_critico: boolean;
  ferias_alerta_concessivo_dias: number;
  ferias_alerta_pagamento_pendente: boolean;
  ferias_alerta_aquisitivo_prox: boolean;
  ferias_alerta_aquisitivo_dias: number;
  ferias_resumo_mensal_ativo: boolean;
  ferias_resumo_mensal_dia: number;
  ferias_resumo_mensal_hora: number;
}

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function getSecretFromVault(
  supabaseAdmin: ReturnType<typeof createClient>,
  name: string
) {
  const { data, error } = await supabaseAdmin.rpc('get_vault_secret', {
    secret_name: name,
  });
  if (error) throw error;
  return (data as any) as string | null;
}

async function getSecret(
  supabaseAdmin: ReturnType<typeof createClient>,
  name: string
) {
  const env = Deno.env.get(name);
  if (env && env.trim()) return env.trim();
  const fromVault = await getSecretFromVault(supabaseAdmin, name);
  if (fromVault && String(fromVault).trim()) return String(fromVault).trim();
  throw new Error(`${name} não configurado (Secrets ou Vault).`);
}

interface FeriasVencido {
  colaborador_id: number;
  nome: string;
  dias_saldo: number;
  concessivo_fim: string;
  dias_vencidos: number;
}

interface FeriasProximoVencer {
  colaborador_id: number;
  nome: string;
  dias_saldo: number;
  concessivo_fim: string;
  dias_restantes: number;
}

interface FeriasPagamentoPendente {
  colaborador_id: number;
  colaborador_nome: string;
  data_inicio: string;
  data_fim: string;
  dias_corridos: number;
  data_limite_pagamento: string;
  dias_ate_limite: number;
  valor_estimado: number;
}

/**
 * Envia mensagem via UAZAPI
 */
async function sendWhatsApp(
  numero: string,
  mensagem: string,
  uazapiUrl: string,
  uazapiToken: string
): Promise<boolean> {
  try {
    const response = await fetch(`${uazapiUrl}/chat/send/text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${uazapiToken}`,
      },
      body: JSON.stringify({
        number: numero,
        message: mensagem,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro ao enviar WhatsApp:', errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro ao enviar WhatsApp:', error);
    return false;
  }
}

/**
 * Verifica se lembrete já foi enviado (idempotência)
 */
async function jaEnviado(
  supabase: any,
  userId: string,
  tipo: string,
  referencia: string
): Promise<boolean> {
  const { data } = await supabase
    .from('lembretes_log')
    .select('id')
    .eq('user_id', userId)
    .eq('tipo_lembrete', tipo)
    .eq('referencia', referencia)
    .gte('enviado_em', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Últimas 24h
    .single();

  return !!data;
}

/**
 * Registra lembrete enviado
 */
async function registrarLembrete(
  supabase: any,
  userId: string,
  tipo: string,
  referencia: string,
  mensagem: string
): Promise<void> {
  const agora = new Date().toISOString();
  await supabase.from('lembretes_log').insert({
    user_id: userId,
    canal: 'whatsapp',
    // `tipo` possui CHECK no schema atual; usar um valor permitido
    tipo: 'lembrete',
    scheduled_for: agora,
    status: 'enviado',
    enviado_em: agora,
    destinatario: null,
    mensagem,
    // Campos extras (adicionados via migration) para idempotência
    tipo_lembrete: tipo,
    referencia,
    mensagem_enviada: mensagem,
  });
}

/**
 * Busca férias vencidas
 */
async function buscarFeriasVencidas(
  supabase: any,
  userId: string
): Promise<FeriasVencido[]> {
  const { data, error } = await supabase.rpc('get_ferias_vencidas', {
    p_user_id: userId,
  });

  if (error) {
    console.error('Erro ao buscar férias vencidas:', error);
    return [];
  }

  return data || [];
}

/**
 * Busca férias próximas de vencer
 */
async function buscarFeriasProximasVencer(
  supabase: any,
  userId: string,
  diasAntes: number
): Promise<FeriasProximoVencer[]> {
  const hoje = new Date();
  const dataLimite = new Date(hoje.getTime() + diasAntes * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('ferias_periodos_aquisitivos')
    .select('id, colaborador_id, dias_saldo, concessivo_fim, colaboradores(nome)')
    .eq('status', 'ativo')
    .gt('dias_saldo', 0)
    .lte('concessivo_fim', dataLimite.toISOString())
    .gte('concessivo_fim', hoje.toISOString());

  if (error) {
    console.error('Erro ao buscar férias próximas:', error);
    return [];
  }

  return (
    data?.map((p: any) => {
      const diasRestantes = Math.ceil(
        (new Date(p.concessivo_fim).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        colaborador_id: p.colaborador_id,
        nome: p.colaboradores.nome,
        dias_saldo: p.dias_saldo,
        concessivo_fim: p.concessivo_fim,
        dias_restantes: diasRestantes,
      };
    }) || []
  );
}

/**
 * Busca pagamentos pendentes
 */
async function buscarPagamentosPendentes(
  supabase: any,
  userId: string
): Promise<FeriasPagamentoPendente[]> {
  const hoje = new Date();
  const doisDiasDepois = new Date(hoje.getTime() + 2 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('ferias_programacoes')
    .select(
      `
      id,
      colaborador_id,
      data_inicio,
      data_fim,
      dias_corridos,
      data_limite_pagamento,
      valor_pagamento,
      colaboradores(nome)
    `
    )
    .in('status', ['aprovado', 'em_gozo'])
    .eq('pagamento_efetuado', false)
    .lte('data_limite_pagamento', doisDiasDepois.toISOString());

  if (error) {
    console.error('Erro ao buscar pagamentos pendentes:', error);
    return [];
  }

  return (
    data?.map((p: any) => {
      const diasAteLimite = Math.ceil(
        (new Date(p.data_limite_pagamento).getTime() - hoje.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return {
        colaborador_id: p.colaborador_id,
        colaborador_nome: p.colaboradores.nome,
        data_inicio: p.data_inicio,
        data_fim: p.data_fim,
        dias_corridos: p.dias_corridos,
        data_limite_pagamento: p.data_limite_pagamento,
        dias_ate_limite: diasAteLimite,
        valor_estimado: p.valor_pagamento || 0,
      };
    }) || []
  );
}

/**
 * Gera mensagem de férias vencidas
 */
function gerarMensagemVencido(ferias: FeriasVencido): string {
  return `🚨 *CRÍTICO — MULTA DE FÉRIAS*

*Colaborador:* ${ferias.nome}
*Situação:* Férias VENCIDAS

• Dias em aberto: ${ferias.dias_saldo} dias
• Venceu em: ${new Date(ferias.concessivo_fim).toLocaleDateString('pt-BR')} (há ${
    ferias.dias_vencidos
  } dias)

💰 *MULTA:* Férias devem ser pagas em DOBRO!

⚠️ *Ação IMEDIATA:* Programe e pague as férias urgentemente para evitar passivo trabalhista.

_LA Music - Gestão de Férias CLT_`;
}

/**
 * Gera mensagem de concessivo próximo
 */
function gerarMensagemConcessivo(ferias: FeriasProximoVencer): string {
  const emoji = ferias.dias_restantes <= 30 ? '🚨' : '⏰';
  const urgencia = ferias.dias_restantes <= 30 ? 'URGENTE' : 'ALERTA';

  return `${emoji} *${urgencia} — FÉRIAS CLT*

*Colaborador:* ${ferias.nome}
*Situação:* Período concessivo próximo de vencer

• Dias disponíveis: ${ferias.dias_saldo} dias
• Vencimento: ${new Date(ferias.concessivo_fim).toLocaleDateString('pt-BR')} (faltam ${
    ferias.dias_restantes
  } dias)

⚠️ *ATENÇÃO:* Após vencimento = MULTA em DOBRO!

🎯 *Ação:* Programe as férias urgentemente.

_LA Music - Gestão de Férias CLT_`;
}

/**
 * Gera mensagem de pagamento pendente
 */
function gerarMensagemPagamento(pag: FeriasPagamentoPendente): string {
  const emoji = pag.dias_ate_limite <= 0 ? '🚨' : '💳';
  const status = pag.dias_ate_limite <= 0 ? 'ATRASADO' : 'PENDENTE';

  return `${emoji} *PAGAMENTO DE FÉRIAS ${status}*

*Colaborador:* ${pag.colaborador_nome}
*Período:* ${new Date(pag.data_inicio).toLocaleDateString('pt-BR')} a ${new Date(
    pag.data_fim
  ).toLocaleDateString('pt-BR')}

• Prazo: até ${new Date(pag.data_limite_pagamento).toLocaleDateString('pt-BR')} ${
    pag.dias_ate_limite <= 0 ? `(${Math.abs(pag.dias_ate_limite)} dias de atraso!)` : `(${pag.dias_ate_limite} dias)`
  }
• Dias: ${pag.dias_corridos} dias corridos
${pag.valor_estimado > 0 ? `• Valor estimado: R$ ${pag.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}

⚠️ *LEMBRETE:* Pagar até 2 dias antes do início das férias (CLT Art. 145).

_LA Music - Gestão de Férias CLT_`;
}

/**
 * Gera resumo mensal
 */
async function gerarResumoMensal(
  supabase: any,
  userId: string
): Promise<string | null> {
  const hoje = new Date();
  const mes = hoje.toLocaleDateString('pt-BR', { month: 'long' });
  const ano = hoje.getFullYear();

  // Buscar estatísticas
  const { data: status } = await supabase
    .from('v_ferias_colaboradores_status')
    .select('*');

  if (!status || status.length === 0) {
    return null;
  }

  const total = status.length;
  const vencidos = status.filter((s: any) => s.tem_ferias_vencidas).length;
  const proximosVencer = status.filter(
    (s: any) =>
      !s.tem_ferias_vencidas &&
      s.proxima_expiracao &&
      new Date(s.proxima_expiracao).getTime() - Date.now() <= 60 * 24 * 60 * 60 * 1000
  ).length;

  // Buscar programações futuras
  const { data: programacoes } = await supabase
    .from('ferias_programacoes')
    .select('data_inicio, dias_corridos, colaboradores(nome)')
    .in('status', ['programado', 'aprovado'])
    .gte('data_inicio', hoje.toISOString())
    .lte('data_inicio', new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('data_inicio', { ascending: true })
    .limit(5);

  const totalProgramadas = programacoes?.length || 0;

  let mensagem = `📊 *RESUMO MENSAL — FÉRIAS CLT*
📅 ${mes.charAt(0).toUpperCase() + mes.slice(1)}/${ano}

*Situação Geral:*
• Colaboradores CLT: ${total}
• Férias vencidas: ${vencidos} ${vencidos > 0 ? '🚨 (CRÍTICO!)' : ''}
• Próximas a vencer (60d): ${proximosVencer}
• Férias programadas: ${totalProgramadas}`;

  // Situações críticas
  const criticos = status.filter((s: any) => s.tem_ferias_vencidas);
  if (criticos.length > 0) {
    mensagem += '\n\n🚨 *Ações Urgentes:*';
    criticos.slice(0, 3).forEach((s: any) => {
      const diasVencidos = Math.ceil(
        (Date.now() - new Date(s.proxima_expiracao).getTime()) / (1000 * 60 * 60 * 24)
      );
      mensagem += `\n• ${s.nome} — ${s.total_dias_saldo} dias (vencido há ${diasVencidos} dias)`;
    });
    if (criticos.length > 3) {
      mensagem += `\n• + ${criticos.length - 3} colaborador(es)`;
    }
  }

  // Próximas férias
  if (programacoes && programacoes.length > 0) {
    mensagem += '\n\n📅 *Próximas Férias (30 dias):*';
    programacoes.forEach((p: any) => {
      mensagem += `\n• ${new Date(p.data_inicio).toLocaleDateString('pt-BR')} — ${
        p.colaboradores.nome
      } (${p.dias_corridos} dias)`;
    });
  }

  mensagem += '\n\n_LA Music - Gestão de Férias CLT_';

  return mensagem;
}

/**
 * Handler principal
 */
serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const uazapiUrl = await getSecret(supabase, 'UAZAPI_URL');
    const uazapiToken = await getSecret(supabase, 'UAZAPI_TOKEN');
    const cronSecret = await getSecret(supabase, 'WHATSAPP_CRON_SECRET');

    // Validar cron secret
    const headerSecret = req.headers.get('x-cron-secret') || '';
    if (headerSecret !== cronSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // Buscar configurações de notificação
    const { data: configs, error: configError } = await supabase
      .from('notificacao_config')
      .select('*')
      .not('whatsapp_numero', 'is', null);

    if (configError) {
      throw new Error(`Erro ao buscar configs: ${configError.message}`);
    }

    if (!configs || configs.length === 0) {
      return json({
        success: true,
        message: 'Nenhuma configuração de notificação encontrada',
        enviados: 0,
      });
    }

    let totalEnviados = 0;
    let totalIgnorados = 0;
    const erros: string[] = [];

    // Processar cada usuário
    for (const config of configs as NotificacaoConfig[]) {
      const userId = (config as any).user_id;
      const whatsapp = config.whatsapp_numero;

      // 1. Alertas de férias vencidas
      if (config.ferias_alerta_vencimento_multa) {
        const vencidos = await buscarFeriasVencidas(supabase, userId);

        for (const vencido of vencidos) {
          const ref = `ferias-vencido-${vencido.colaborador_id}`;
          if (await jaEnviado(supabase, userId, 'ferias_vencido', ref)) {
            totalIgnorados++;
            continue;
          }

          const mensagem = gerarMensagemVencido(vencido);
          const enviado = await sendWhatsApp(whatsapp, mensagem, uazapiUrl, uazapiToken);

          if (enviado) {
            await registrarLembrete(supabase, userId, 'ferias_vencido', ref, mensagem);
            totalEnviados++;
          } else {
            erros.push(`Erro ao enviar alerta vencido: ${vencido.nome}`);
          }
        }
      }

      // 2. Alertas de concessivo próximo
      if (config.ferias_alerta_concessivo_critico) {
        const diasAntes = config.ferias_alerta_concessivo_dias || 60;
        const proximos = await buscarFeriasProximasVencer(supabase, userId, diasAntes);

        for (const proximo of proximos) {
          const ref = `ferias-concessivo-${proximo.colaborador_id}`;
          if (await jaEnviado(supabase, userId, 'ferias_concessivo', ref)) {
            totalIgnorados++;
            continue;
          }

          const mensagem = gerarMensagemConcessivo(proximo);
          const enviado = await sendWhatsApp(whatsapp, mensagem, uazapiUrl, uazapiToken);

          if (enviado) {
            await registrarLembrete(
              supabase,
              userId,
              'ferias_concessivo',
              ref,
              mensagem
            );
            totalEnviados++;
          } else {
            erros.push(`Erro ao enviar alerta concessivo: ${proximo.nome}`);
          }
        }
      }

      // 3. Alertas de pagamento pendente
      if (config.ferias_alerta_pagamento_pendente) {
        const pendentes = await buscarPagamentosPendentes(supabase, userId);

        for (const pendente of pendentes) {
          const ref = `ferias-pagamento-${pendente.colaborador_id}-${pendente.data_inicio}`;
          if (await jaEnviado(supabase, userId, 'ferias_pagamento', ref)) {
            totalIgnorados++;
            continue;
          }

          const mensagem = gerarMensagemPagamento(pendente);
          const enviado = await sendWhatsApp(whatsapp, mensagem, uazapiUrl, uazapiToken);

          if (enviado) {
            await registrarLembrete(
              supabase,
              userId,
              'ferias_pagamento',
              ref,
              mensagem
            );
            totalEnviados++;
          } else {
            erros.push(`Erro ao enviar alerta pagamento: ${pendente.colaborador_nome}`);
          }
        }
      }

      // 4. Resumo mensal
      if (config.ferias_resumo_mensal_ativo) {
        const hoje = new Date();
        const diaHoje = hoje.getDate();
        const horaHoje = hoje.getHours();
        const diaConfig = config.ferias_resumo_mensal_dia || 1;
        const horaConfig = config.ferias_resumo_mensal_hora || 8;

        if (diaHoje === diaConfig && horaHoje === horaConfig) {
          const mesAno = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
          const ref = `ferias-resumo-${mesAno}`;

          if (!(await jaEnviado(supabase, userId, 'ferias_resumo', ref))) {
            const mensagem = await gerarResumoMensal(supabase, userId);

            if (mensagem) {
              const enviado = await sendWhatsApp(whatsapp, mensagem, uazapiUrl, uazapiToken);

              if (enviado) {
                await registrarLembrete(
                  supabase,
                  userId,
                  'ferias_resumo',
                  ref,
                  mensagem
                );
                totalEnviados++;
              } else {
                erros.push('Erro ao enviar resumo mensal');
              }
            }
          } else {
            totalIgnorados++;
          }
        }
      }
    }

    return json({
      success: true,
      enviados: totalEnviados,
      ignorados: totalIgnorados,
      erros: erros.length > 0 ? erros : undefined,
    });
  } catch (error: any) {
    console.error('Erro no handler:', error);
    return json({ error: error.message }, 500);
  }
});
