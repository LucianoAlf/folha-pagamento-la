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

  const cteBody = (body, name) => {
    const match = new RegExp(
      `\\b${name}\\s+as\\s+(?:materialized\\s+)?\\(`,
      'i',
    ).exec(body);
    assert.ok(match, `CTE ${name} must exist`);

    const openIndex = match.index + match[0].lastIndexOf('(');
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

    assert.fail(`CTE ${name} must have balanced parentheses`);
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

  test('rejoins each resolved payroll slice to its exact classification and payable', () => {
    assert.match(normalizadas, /d\.folha_id\s*=\s*r\.folha_id/i);
    assert.match(normalizadas, /d\.lancamento_folha_id\s*=\s*r\.lancamento_folha_id/i);
    assert.match(normalizadas, /d\.componente\s*=\s*r\.componente/i);
    assert.match(normalizadas, /d\.sequencia\s*=\s*r\.sequencia/i);
    assert.match(normalizadas, /cp_folha\.fonte_tipo\s*=\s*'folha_pagamento'/i);
    assert.match(normalizadas, /cp_folha\.fonte_identificador\s*=\s*d\.folha_id::text/i);
    assert.match(
      normalizadas,
      /cp_folha\.conta_pagadora_id\s*=\s*d\.conta_pagadora_id_usada/i,
    );
    assert.match(normalizadas, /cp_folha\.status\s*=\s*'pago'/i);
    assert.match(
      normalizadas,
      /cp_folha\.data_pagamento::date\s*>=\s*p\.inicio[\s\S]*cp_folha\.data_pagamento::date\s*<\s*p\.fim/i,
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

    for (const reason of [
      'folha_sem_alocacao',
      'folha_desatualizada',
      'cartao_nao_confirmado',
      'fonte_sem_unidade',
    ]) {
      assert.match(consultar, new RegExp(`'${reason}'`, 'i'));
    }
  });

  test('derives units only from each approved source and limits them to cg, rec or bar', () => {
    const cartao = cteBody(normalizadas, 'cartao_raw');
    const contasPagar = cteBody(normalizadas, 'contas_pagar_raw');
    const contasReceber = cteBody(normalizadas, 'contas_receber_raw');

    assert.match(cartao, /t\.centro_custo_id/i);
    assert.match(
      cartao,
      /case\s+when\s+t\.classificacao_status\s*=\s*'confirmada'[\s\S]*?\.codigo[\s\S]*?else\s+null[\s\S]*?end\s+as\s+unidade_operacional/i,
    );
    assert.doesNotMatch(cartao, /\.codigo\s+as\s+unidade_operacional/i);

    assert.match(contasPagar, /cp\.centro_custo_id/i);
    assert.match(contasPagar, /cp\.unidade/i);
    assert.match(contasPagar, /'aproximada_fiscal_pagadora'/i);

    assert.match(contasReceber, /cr\.centro_custo_id/i);
    assert.match(contasReceber, /cr\.unidade/i);
    assert.match(
      contasReceber,
      /coalesce\s*\([\s\S]*?\.codigo[\s\S]*?cr\.unidade[\s\S]*?\)/i,
    );
    assert.match(contasReceber, /'exata'/i);
    assert.match(contasReceber, /unidade_operacional/i);

    assert.match(
      normalizadas,
      /case[\s\S]*?when\s+(?:raw\.)?unidade_operacional\s+in\s*\(\s*'cg'\s*,\s*'rec'\s*,\s*'bar'\s*\)[\s\S]*?then\s+(?:raw\.)?unidade_operacional[\s\S]*?else\s+null[\s\S]*?end\s+as\s+unidade_operacional/i,
    );
  });

  test('uses the operational unit in every details cursor direction and ordering', () => {
    assert.match(detalhes, /p_cursor->>'unidade_operacional'/i);
    assert.match(
      detalhes,
      /order\s+by[\s\S]*origem_sequencia[\s\S]*unidade_operacional/i,
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
      /revoke\s+all\s+on\s+function\s+public\.dre_linhas_normalizadas\(date,\s*text\)[\s\S]*?from\s+[^;]*\bpublic\b[^;]*\banon\b[^;]*\bauthenticated\b[^;]*;/i,
    );
    assert.match(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.dre_linhas_normalizadas\(date,\s*text\)\s+to\s+service_role\s*;/i,
    );
    assert.doesNotMatch(
      sql,
      /grant\s+execute\s+on\s+function\s+public\.dre_linhas_normalizadas\(date,\s*text\)\s+to\s+[^;]*\bauthenticated\b/i,
    );

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
