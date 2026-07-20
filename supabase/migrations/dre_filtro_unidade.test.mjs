import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const migrationUrl = new URL('./20260720_2_dre_filtro_unidade.sql', import.meta.url);
const migrationPath = fileURLToPath(migrationUrl);
const migrationExists = existsSync(migrationPath);

test('the DRE operational-unit migration exists', () => {
  assert.ok(
    migrationExists,
    `expected the DRE operational-unit migration at ${migrationPath}`,
  );
});

if (migrationExists) {
  const sql = readFileSync(migrationUrl, 'utf8');

  const functionBody = (name) => {
    const match = sql.match(new RegExp(
      `create\\s+or\\s+replace\\s+function\\s+public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
      'i',
    ));
    assert.ok(match, `function ${name} must exist`);
    return match[0];
  };

  const parenthesizedBody = (body, openIndex, label) => {
    let depth = 0;
    let inString = false;

    for (let index = openIndex; index < body.length; index += 1) {
      const character = body[index];

      if (character === "'") {
        if (inString && body[index + 1] === "'") {
          index += 1;
          continue;
        }
        inString = !inString;
        continue;
      }

      if (inString) continue;
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      if (depth === 0) return body.slice(openIndex + 1, index);
    }

    assert.fail(`${label} must have balanced parentheses`);
  };

  const cteBody = (body, name) => {
    const match = new RegExp(
      `\\b${name}\\s+as\\s+(?:materialized\\s+)?\\(`,
      'i',
    ).exec(body);
    assert.ok(match, `CTE ${name} must exist`);

    const openIndex = match.index + match[0].lastIndexOf('(');
    return parenthesizedBody(body, openIndex, `CTE ${name}`);
  };

  const jsonbObjectValue = (body, key) => {
    const match = new RegExp(
      `'${key}'\\s*,\\s*jsonb_build_object\\s*\\(`,
      'i',
    ).exec(body);
    assert.ok(match, `JSON field ${key} must contain an object`);

    const openIndex = match.index + match[0].lastIndexOf('(');
    return parenthesizedBody(body, openIndex, `JSON object ${key}`);
  };

  const normalizadas = functionBody('dre_linhas_normalizadas');
  const consultar = functionBody('dre_consultar');
  const detalhes = functionBody('dre_detalhes');

  test('publishes the approved function signatures and normalized unit fields', () => {
    const normalizerReturn = normalizadas.match(
      /returns\s+table\s*\(([\s\S]*?)\)\s*language/i,
    );
    assert.ok(normalizerReturn, 'dre_linhas_normalizadas must return a table');

    assert.match(
      normalizadas,
      /dre_linhas_normalizadas\s*\(\s*p_competencia\s+date\s*,\s*p_regime\s+text\s*\)/i,
    );
    assert.match(
      consultar,
      /p_competencia\s+date\s*,\s*p_regime\s+text\s*,\s*p_unidade\s+text\s+default\s+'consolidado'\s*\)/i,
    );
    assert.match(
      detalhes,
      /p_competencia\s+date\s*,\s*p_regime\s+text\s*,\s*p_plano_codigo\s+text\s+default\s+null\s*,\s*p_fonte\s+text\s+default\s+null\s*,\s*p_unidade\s+text\s+default\s+'consolidado'\s*,\s*p_cursor\s+jsonb\s+default\s+null\s*,\s*p_limite\s+integer\s+default\s+50\s*\)/i,
    );
    assert.match(normalizerReturn[1], /colaborador_id\s+integer/i);
    assert.match(normalizerReturn[1], /unidade_operacional\s+text/i);
    assert.match(normalizerReturn[1], /qualidade_unidade\s+text/i);
    assert.match(normalizerReturn[1], /motivo_sem_unidade\s+text/i);
  });

  test('selects distinct cash payrolls and resolves their economic allocation laterally', () => {
    const folhasAlvo = cteBody(normalizadas, 'folhas_alvo');

    assert.match(
      folhasAlvo,
      /select\s+distinct[\s\S]*fonte_identificador[\s\S]*from\s+public\.contas_pagar[\s\S]*p_regime\s*=\s*'caixa'/i,
    );
    assert.match(folhasAlvo, /fonte_tipo\s*=\s*'folha_pagamento'/i);
    assert.match(folhasAlvo, /status\s*=\s*'pago'/i);
    assert.match(
      folhasAlvo,
      /data_pagamento::date\s*>=\s*p\.inicio[\s\S]*data_pagamento::date\s*<\s*p\.fim/i,
    );
    assert.match(
      normalizadas,
      /join\s+lateral\s+public\.folha_alocacao_dre_resolver\s*\(/i,
    );
  });

  test('rejoins each resolved payroll slice and filters its cash payable before limit 1', () => {
    const folha = cteBody(normalizadas, 'folha_raw');
    const payableLateralMatch = /left\s+join\s+lateral\s*\(/i.exec(folha);
    assert.ok(payableLateralMatch, 'folha_raw must have an exact payable lateral');

    const payableOpenIndex = payableLateralMatch.index
      + payableLateralMatch[0].lastIndexOf('(');
    const payableLateral = parenthesizedBody(
      folha,
      payableOpenIndex,
      'payroll payable lateral',
    );
    const parametrosIndex = folha.search(/cross\s+join\s+parametros\s+p/i);

    assert.ok(parametrosIndex >= 0, 'folha_raw must expose parametros as p');
    assert.ok(
      parametrosIndex < payableLateralMatch.index,
      'parametros p must be visible before the payable lateral',
    );

    assert.match(
      normalizadas,
      /join\s+public\.folha_classificacao_dre\s+d\s+on\s+d\.folha_id\s*=\s*r\.folha_id[\s\S]*?d\.lancamento_folha_id\s*=\s*r\.lancamento_folha_id[\s\S]*?d\.componente\s*=\s*r\.componente[\s\S]*?d\.sequencia\s*=\s*r\.sequencia/i,
    );
    assert.match(normalizadas, /cp_folha\.fonte_tipo\s*=\s*'folha_pagamento'/i);
    assert.match(normalizadas, /cp_folha\.fonte_identificador\s*=\s*d\.folha_id::text/i);
    assert.match(
      normalizadas,
      /cp_folha\.conta_pagadora_id\s*=\s*d\.conta_pagadora_id_usada/i,
    );
    assert.match(
      payableLateral,
      /and\s*\(\s*p_regime\s*=\s*'competencia'\s+or\s*\(\s*p_regime\s*=\s*'caixa'\s+and\s+cp_folha\.status\s*=\s*'pago'\s+and\s+cp_folha\.data_pagamento::date\s*>=\s*p\.inicio\s+and\s+cp_folha\.data_pagamento::date\s*<\s*p\.fim\s*\)\s*\)\s*order\s+by/i,
    );
    assert.match(
      folha,
      /where\s*\(\s*p_regime\s*=\s*'competencia'[\s\S]*?r\.competencia\s*>=\s*p\.inicio[\s\S]*?r\.competencia\s*<\s*p\.fim\s*\)\s*or\s*\(\s*p_regime\s*=\s*'caixa'\s+and\s+cp_folha\.status\s*=\s*'pago'\s+and\s+cp_folha\.data_pagamento::date\s*>=\s*p\.inicio\s+and\s+cp_folha\.data_pagamento::date\s*<\s*p\.fim\s*\)/i,
    );
    assert.match(
      normalizadas,
      /valor_assinado_rateado\s+as\s+valor_origem/i,
    );
  });

  test('reports every fixed reason for rows without an operational unit', () => {
    assert.match(consultar, /linhas_base\s+as\s+materialized/i);
    assert.match(consultar, /linhas_filtradas\s+as\s+materialized/i);
    assert.match(consultar, /'sem_unidade_operacional'/i);

    const semUnidade = cteBody(consultar, 'sem_unidade_operacional');
    assert.match(
      semUnidade,
      /from\s+linhas_base\s+l\s+where\s+l\.unidade_operacional\s+is\s+null/i,
    );
    const summaryFields = [
      'valor_origem',
      'valor_resultado',
      'linhas',
      'colaboradores_folha',
    ];

    for (const field of [...summaryFields, 'por_motivo']) {
      assert.match(semUnidade, new RegExp(`'${field}'`, 'i'));
    }

    const porMotivo = jsonbObjectValue(semUnidade, 'por_motivo');
    for (const reason of [
      'folha_sem_alocacao',
      'folha_desatualizada',
      'cartao_nao_confirmado',
      'fonte_sem_unidade',
    ]) {
      const reasonObject = jsonbObjectValue(porMotivo, reason);
      for (const field of summaryFields) {
        assert.match(reasonObject, new RegExp(`'${field}'`, 'i'));
      }

      const reasonFilter = `l\\.motivo_sem_unidade\\s*=\\s*'${reason}'`;
      assert.match(
        reasonObject,
        new RegExp(`'valor_origem'\\s*,\\s*coalesce\\s*\\(\\s*sum\\s*\\(\\s*l\\.valor_origem\\s*\\)\\s*filter\\s*\\(\\s*where\\s+${reasonFilter}\\s*\\)`, 'i'),
      );
      assert.match(
        reasonObject,
        new RegExp(`'valor_resultado'\\s*,\\s*coalesce\\s*\\(\\s*sum\\s*\\(\\s*l\\.valor_resultado\\s*\\)\\s*filter\\s*\\(\\s*where\\s+${reasonFilter}\\s*\\)`, 'i'),
      );
      assert.match(
        reasonObject,
        new RegExp(`'linhas'\\s*,\\s*count\\s*\\(\\s*\\*\\s*\\)\\s*filter\\s*\\(\\s*where\\s+${reasonFilter}\\s*\\)`, 'i'),
      );
      assert.match(
        reasonObject,
        new RegExp(`'colaboradores_folha'\\s*,\\s*count\\s*\\(\\s*distinct\\s+l\\.colaborador_id\\s*\\)\\s*filter\\s*\\(\\s*where\\s+l\\.fonte\\s*=\\s*'folha'\\s+and\\s+${reasonFilter}\\s*\\)`, 'i'),
      );
    }
  });

  test('derives units only from each approved source and limits them to cg, rec or bar', () => {
    const folha = cteBody(normalizadas, 'folha_raw');
    const cartao = cteBody(normalizadas, 'cartao_raw');
    const contasPagar = cteBody(normalizadas, 'contas_pagar_raw');
    const contasReceber = cteBody(normalizadas, 'contas_receber_raw');
    const allowlist = `\\s+in\\s*\\(\\s*'cg'\\s*,\\s*'rec'\\s*,\\s*'bar'\\s*\\)`;
    const notAllowlist = `\\s+not\\s+in\\s*\\(\\s*'cg'\\s*,\\s*'rec'\\s*,\\s*'bar'\\s*\\)`;
    const centerUnit = (alias) => (
      `lower\\s*\\(\\s*nullif\\s*\\(\\s*trim\\s*\\(\\s*${alias}\\.codigo\\s*\\)\\s*,\\s*''\\s*\\)\\s*\\)`
    );
    const fallbackUnit = (centerAlias, sourceAlias) => (
      `lower\\s*\\(\\s*coalesce\\s*\\(\\s*nullif\\s*\\(\\s*trim\\s*\\(\\s*${centerAlias}\\.codigo\\s*\\)\\s*,\\s*''\\s*\\)\\s*,\\s*nullif\\s*\\(\\s*trim\\s*\\(\\s*${sourceAlias}\\.unidade\\s*\\)\\s*,\\s*''\\s*\\)\\s*\\)\\s*\\)`
    );
    const cardUnit = centerUnit('cc_cartao');
    const payableUnit = fallbackUnit('cc_cp', 'cp');
    const receivableUnit = fallbackUnit('cc_cr', 'cr');

    assert.match(
      folha,
      new RegExp(`case\\s+when\\s+r\\.estado_alocacao\\s*=\\s*'pronto'\\s+and\\s+r\\.unidade_dre${allowlist}\\s+then\\s+r\\.unidade_dre\\s+else\\s+null\\s+end\\s+as\\s+unidade_operacional`, 'i'),
    );
    assert.match(
      folha,
      new RegExp(`case\\s+when\\s+r\\.estado_alocacao\\s*=\\s*'pronto'\\s+and\\s+r\\.unidade_dre${allowlist}\\s+then\\s+'exata'[\\s\\S]*?end\\s+as\\s+qualidade_unidade`, 'i'),
    );
    assert.match(
      folha,
      /when\s+r\.estado_alocacao\s*=\s*'sem_alocacao'\s+then\s+'folha_sem_alocacao'/i,
    );
    assert.match(
      folha,
      /when\s+r\.estado_alocacao\s*=\s*'desatualizada'\s+then\s+'folha_desatualizada'/i,
    );
    assert.match(
      folha,
      new RegExp(`when\\s+r\\.estado_alocacao\\s*=\\s*'pronto'\\s+and\\s*\\(\\s*r\\.unidade_dre\\s+is\\s+null\\s+or\\s+r\\.unidade_dre${notAllowlist}\\s*\\)\\s+then\\s+'fonte_sem_unidade'`, 'i'),
    );

    assert.match(
      cartao,
      /left\s+join\s+public\.centros_custo\s+cc_cartao\s+on\s+cc_cartao\.id\s*=\s*t\.centro_custo_id/i,
    );
    assert.match(
      cartao,
      new RegExp(`case\\s+when\\s+t\\.classificacao_status\\s*=\\s*'confirmada'\\s+and\\s+${cardUnit}${allowlist}\\s+then\\s+${cardUnit}\\s+else\\s+null\\s+end\\s+as\\s+unidade_operacional`, 'i'),
    );
    assert.match(
      cartao,
      new RegExp(`case\\s+when\\s+t\\.classificacao_status\\s*=\\s*'confirmada'\\s+and\\s+${cardUnit}${allowlist}\\s+then\\s+'exata'[\\s\\S]*?end\\s+as\\s+qualidade_unidade`, 'i'),
    );
    assert.match(
      cartao,
      /when\s+t\.classificacao_status\s+is\s+distinct\s+from\s+'confirmada'\s+then\s+'cartao_nao_confirmado'/i,
    );
    assert.match(
      cartao,
      new RegExp(`when\\s+t\\.classificacao_status\\s*=\\s*'confirmada'\\s+and\\s*\\(\\s*${cardUnit}\\s+is\\s+null\\s+or\\s+${cardUnit}${notAllowlist}\\s*\\)\\s+then\\s+'fonte_sem_unidade'`, 'i'),
    );

    assert.match(
      contasPagar,
      /left\s+join\s+public\.centros_custo\s+cc_cp\s+on\s+cc_cp\.id\s*=\s*cp\.centro_custo_id/i,
    );
    assert.match(
      contasPagar,
      new RegExp(`case\\s+when\\s+${payableUnit}${allowlist}\\s+then\\s+${payableUnit}\\s+else\\s+null\\s+end\\s+as\\s+unidade_operacional`, 'i'),
    );
    assert.match(
      contasPagar,
      new RegExp(`case\\s+when\\s+${payableUnit}${allowlist}\\s+then\\s+'aproximada_conta_pagadora'[\\s\\S]*?end\\s+as\\s+qualidade_unidade`, 'i'),
    );
    assert.match(
      contasPagar,
      new RegExp(`case\\s+when\\s+${payableUnit}\\s+is\\s+null\\s+or\\s+${payableUnit}${notAllowlist}\\s+then\\s+'fonte_sem_unidade'[\\s\\S]*?end\\s+as\\s+motivo_sem_unidade`, 'i'),
    );

    assert.match(
      contasReceber,
      /left\s+join\s+public\.centros_custo\s+cc_cr\s+on\s+cc_cr\.id\s*=\s*cr\.centro_custo_id/i,
    );
    assert.match(
      contasReceber,
      new RegExp(`case\\s+when\\s+${receivableUnit}${allowlist}\\s+then\\s+${receivableUnit}\\s+else\\s+null\\s+end\\s+as\\s+unidade_operacional`, 'i'),
    );
    assert.match(
      contasReceber,
      new RegExp(`case\\s+when\\s+${receivableUnit}${allowlist}\\s+then\\s+'exata'[\\s\\S]*?end\\s+as\\s+qualidade_unidade`, 'i'),
    );
    assert.match(
      contasReceber,
      new RegExp(`case\\s+when\\s+${receivableUnit}\\s+is\\s+null\\s+or\\s+${receivableUnit}${notAllowlist}\\s+then\\s+'fonte_sem_unidade'[\\s\\S]*?end\\s+as\\s+motivo_sem_unidade`, 'i'),
    );

    assert.match(
      normalizadas,
      /case[\s\S]*?when\s+(?:raw\.)?unidade_operacional\s+in\s*\(\s*'cg'\s*,\s*'rec'\s*,\s*'bar'\s*\)[\s\S]*?then\s+(?:raw\.)?unidade_operacional[\s\S]*?else\s+null[\s\S]*?end\s+as\s+unidade_operacional/i,
    );
  });

  test('uses the operational unit in every details cursor direction and ordering', () => {
    assert.match(
      detalhes,
      /\(\s*coalesce\s*\(\s*l\.plano_codigo\s*,\s*'~'\s*\)\s*,\s*l\.fonte\s*,\s*l\.origem_id\s*,\s*l\.origem_sequencia\s*,\s*coalesce\s*\(\s*l\.unidade_operacional\s*,\s*'~'\s*\)\s*\)\s*>\s*\(\s*coalesce\s*\(\s*p_cursor->>'plano_codigo'\s*,\s*'~'\s*\)\s*,\s*coalesce\s*\(\s*p_cursor->>'fonte'\s*,\s*''\s*\)\s*,\s*coalesce\s*\(\s*p_cursor->>'origem_id'\s*,\s*''\s*\)\s*,\s*coalesce\s*\(\s*p_cursor->>'origem_sequencia'\s*,\s*''\s*\)\s*,\s*coalesce\s*\(\s*p_cursor->>'unidade_operacional'\s*,\s*'~'\s*\)\s*\)/i,
    );

    for (const name of ['ordenadas', 'pagina']) {
      assert.match(
        cteBody(detalhes, name),
        /order\s+by\s+coalesce\s*\(\s*(?:[a-z]+\.)?plano_codigo\s*,\s*'~'\s*\)(?:\s+asc)?\s*,\s*(?:[a-z]+\.)?fonte(?:\s+asc)?\s*,\s*(?:[a-z]+\.)?origem_id(?:\s+asc)?\s*,\s*(?:[a-z]+\.)?origem_sequencia(?:\s+asc)?\s*,\s*coalesce\s*\(\s*(?:[a-z]+\.)?unidade_operacional\s*,\s*'~'\s*\)(?:\s+asc)?/i,
      );
    }

    assert.match(
      cteBody(detalhes, 'ultimo'),
      /order\s+by\s+coalesce\s*\(\s*(?:[a-z]+\.)?plano_codigo\s*,\s*'~'\s*\)\s+desc\s*,\s*(?:[a-z]+\.)?fonte\s+desc\s*,\s*(?:[a-z]+\.)?origem_id\s+desc\s*,\s*(?:[a-z]+\.)?origem_sequencia\s+desc\s*,\s*coalesce\s*\(\s*(?:[a-z]+\.)?unidade_operacional\s*,\s*'~'\s*\)\s+desc/i,
    );
    assert.match(
      detalhes,
      /jsonb_agg\s*\([\s\S]*?order\s+by\s+coalesce\s*\(\s*p\.plano_codigo\s*,\s*'~'\s*\)(?:\s+asc)?\s*,\s*p\.fonte(?:\s+asc)?\s*,\s*p\.origem_id(?:\s+asc)?\s*,\s*p\.origem_sequencia(?:\s+asc)?\s*,\s*coalesce\s*\(\s*p\.unidade_operacional\s*,\s*'~'\s*\)(?:\s+asc)?/i,
    );
    assert.match(
      detalhes,
      /'unidade_operacional'\s*,\s*u\.unidade_operacional/i,
    );
  });

  test('drops legacy functions safely and reapplies exact privileges and security', () => {
    const drops = sql.match(
      /drop\s+function(?:\s+if\s+exists)?\s+public\.dre_(?:detalhes|consultar|linhas_normalizadas)\s*\([^;]+;/gi,
    ) ?? [];

    assert.equal(drops.length, 3, 'migration must contain exactly the three legacy DRE drops');
    assert.match(
      drops[0],
      /public\.dre_detalhes\s*\(\s*date\s*,\s*text\s*,\s*text\s*,\s*text\s*,\s*jsonb\s*,\s*integer\s*\)\s*;/i,
    );
    assert.match(
      drops[1],
      /public\.dre_consultar\s*\(\s*date\s*,\s*text\s*\)\s*;/i,
    );
    assert.match(
      drops[2],
      /public\.dre_linhas_normalizadas\s*\(\s*date\s*,\s*text\s*\)\s*;/i,
    );
    assert.doesNotMatch(drops.join('\n'), /\bcascade\b/i);

    for (const body of [normalizadas, consultar, detalhes]) {
      assert.match(body, /\bstable\b/i);
      assert.match(body, /security\s+definer/i);
      assert.match(body, /set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
    }

    assert.match(
      sql,
      /revoke\s+all\s+on\s+function\s+public\.dre_linhas_normalizadas\(date,\s*text\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*maria_operacional\s*,\s*maria_leitura\s*;/i,
    );

    const normalizerGrants = sql.match(
      /grant\s+(?:execute|all(?:\s+privileges)?)\s+on\s+function\s+public\.dre_linhas_normalizadas\(date,\s*text\)[^;]*;/gi,
    ) ?? [];
    assert.equal(
      normalizerGrants.length,
      1,
      'normalizer must have exactly one grant statement',
    );
    assert.match(normalizerGrants[0], /\bto\s+service_role\s*;/i);

    assert.match(
      sql,
      /revoke\s+all\s+on\s+function\s+public\.dre_consultar\(date,\s*text,\s*text\)\s+from\s+public\s*,\s*anon\s*;/i,
    );
    assert.match(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.dre_consultar\(date,\s*text,\s*text\)\s+to\s+authenticated\s*,\s*service_role\s*;/i,
    );
    assert.match(
      sql,
      /revoke\s+all\s+on\s+function\s+public\.dre_detalhes\(date,\s*text,\s*text,\s*text,\s*text,\s*jsonb,\s*integer\)\s+from\s+public\s*,\s*anon\s*;/i,
    );
    assert.match(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.dre_detalhes\(date,\s*text,\s*text,\s*text,\s*text,\s*jsonb,\s*integer\)\s+to\s+authenticated\s*,\s*service_role\s*;/i,
    );
  });

  test('filters only presentation data while preserving consolidated diagnostics', () => {
    for (const body of [consultar, detalhes]) {
      assert.match(
        body,
        /p_unidade\s+not\s+in\s*\(\s*'consolidado'\s*,\s*'cg'\s*,\s*'rec'\s*,\s*'bar'\s*\)/i,
      );
    }

    const detalhesFiltradas = cteBody(detalhes, 'filtradas');
    assert.match(
      detalhesFiltradas,
      /p_unidade\s*=\s*'consolidado'[\s\S]*?l\.unidade_operacional\s*=\s*p_unidade/i,
    );

    const linhasFiltradas = cteBody(consultar, 'linhas_filtradas');
    assert.match(linhasFiltradas, /from\s+linhas_base/i);
    assert.match(
      linhasFiltradas,
      /p_unidade\s*=\s*'consolidado'[\s\S]*unidade_operacional\s*=\s*p_unidade/i,
    );

    for (const name of ['kpis', 'grupos', 'planos']) {
      assert.match(cteBody(consultar, name), /\blinhas_filtradas\b/i);
    }

    for (const name of ['cobertura', 'reconciliacao', 'sem_unidade_operacional']) {
      assert.match(cteBody(consultar, name), /\blinhas_base\b/i);
    }
  });
}
