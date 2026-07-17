# Bistrô Mobile e Contraste Dark

## Objetivo

Melhorar a leitura da aba Bistrô em telas pequenas e no tema escuro sem alterar dados, cálculos ou ações existentes.

## Design aprovado

- O cabeçalho continua no `Card` do kit, com `bg-surface-2`, `border-line-strong` e sombra discreta para criar hierarquia no dark mode.
- No mobile, as ações formam uma grade: a ação principal ocupa a largura toda; as ações secundárias ficam abaixo e continuam legíveis quando desabilitadas.
- A tabela permanece no desktop.
- No mobile, cada colaborador vira um item próprio com nome, valor e ações de toque estáveis. Não haverá rolagem horizontal.
- A lista extensa de colaboradores começa recolhida e pode ser expandida pelo chevron no cabeçalho. O total e a conciliação permanecem sempre visíveis.
- Os valores de Luciano, Anne Susan e Marcos Delfino serão apresentados como pagos diretamente ao Bistrô, não como pendência da folha.
- Somente tokens semânticos do tema serão usados.

## Limites

- Nenhuma escrita ou migration no Supabase.
- Nenhuma alteração em valores de consumo, folha ou DRE.
- Os handlers de editar/excluir e os modais permanecem os mesmos.
- O desktop mantém a densidade atual.

## Validação

- Testes do modelo de reconciliação.
- Testes estáticos garantindo as duas apresentações responsivas.
- `node --test`, `npm run typecheck`, `npm run build` e `git diff --check`.
- Agent Browser em desktop/mobile e claro/escuro.
