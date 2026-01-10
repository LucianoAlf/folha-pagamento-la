# Relatório Executivo: Sistema de Gestão de Folha de Pagamento - LA Music Group

## 1. Visão Geral do Sistema
O Sistema de Gestão de Folha de Pagamento da LA Music Group é uma plataforma analítica e operacional avançada, desenvolvida para centralizar, automatizar e auditar os pagamentos de colaboradores em múltiplas unidades (Campo Grande, Recreio e Barra). O diferencial competitivo do sistema é a integração de **Inteligência Artificial (Gemini 3-Flash-Preview)** para análise de sazonalidade e um motor de **Memória Organizacional** que permite ao RH registrar justificativas que alimentam o aprendizado da máquina.

---

## 2. Arquitetura de Dados (Supabase & PostgreSQL)

O sistema utiliza o Supabase como backend-as-a-service, aproveitando recursos avançados do PostgreSQL para garantir integridade e performance.

### 2.1. Tabelas do Banco de Dados
- **`folhas_mensais`**: Entidade mestre que agrupa os lançamentos por período.
  - Campos: `id`, `ano`, `mes`, `status` (rascunho, pendente, aprovada), `total_geral`, `total_cg`, `total_rec`, `total_bar`, `notas_rh`.
- **`colaboradores`**: Cadastro central de pessoas.
  - Campos: Mais de 30 campos incluindo `foto_url`, `salario_base`, `departamento`, `tipo_contrato`, `instrumentos`, e dados bancários/PIX.
- **`lancamentos_folha`**: Itens individuais de pagamento.
  - Campos: `salario`, `bonus`, `comissao`, `reembolso`, `passagem`, `inss`, `descontos`.
  - **Coluna Gerada (`total`)**: O banco calcula automaticamente o líquido: `((salario + bonus + comissao + passagem + reembolso) - inss - descontos)`.
- **`colaborador_variacao_notas`**: A "Memória da Ana". Armazena justificativas por colaborador/mês.
- **`folha_ai_insights`**: Cache de análises geradas pela IA para evitar custos redundantes.

### 2.2. Inteligência em Banco (RPCs & Triggers)
- **`compare_folhas_colaborador`**: RPC complexa que realiza um Full Outer Join entre dois meses, calculando variações percentuais agregadas por colaborador, mesmo que ele tenha lançamentos em múltiplas unidades.
- **`recalc_folha_totais`**: Função acionada por Trigger que garante que os totais por unidade na tabela `folhas_mensais` estejam sempre sincronizados com os itens da `lancamentos_folha`.
- **`upsert_colaborador_variacao_nota`**: Procedimento com `SECURITY DEFINER` para garantir o registro seguro das anotações do RH.

### 2.3. Edge Functions
- **`ai-payroll-insights`**: Função em TypeScript (Deno) que:
  1. Coleta dados macro do mês.
  2. Busca variações acima de 10% via RPC.
  3. Recupera a "Memória da Ana".
  4. Consulta o Gemini 3-Flash-Preview para gerar um relatório executivo estruturado.

---

## 3. Funcionalidades por Página

### 3.1. Dashboard (Visão Macro)
A porta de entrada para a gestão financeira.
- **KPI Cards**: Quatro indicadores principais (Folha Total, Qtd. Lançamentos, Qtd. Colaboradores, Média por Pessoa). Exibem tendências (setas verdes/vermelhas) comparando com o mês anterior.
- **Gráfico Donut (Distribuição)**: Mostra visualmente o peso financeiro de cada unidade (CG, REC, BAR). O número central é dinâmico e responsivo.
- **Gráfico de Evolução Histórica**: Um gráfico de área (Recharts) que mostra o comportamento da folha nos últimos 7 meses, facilitando a identificação de picos de gasto.

### 3.2. Lançamentos (Operacional)
Onde o trabalho pesado acontece. É uma interface estilo "planilha inteligente".
- **Filtro de Unidade**: Altera toda a página (KPIs, Alertas e Tabela) para focar apenas em uma unidade ou no Consolidado.
- **Seletor de Mês**: Componente Radix UI personalizado que permite navegar pelo histórico ou criar novos períodos.
- **Inline Editing (MusiClass Pattern)**: Ana pode clicar em qualquer valor (Salário, Bônus, etc.) e editar. O salvamento é automático ao sair do campo (`onBlur`) com feedback visual de "Salvando" e "Salvo".
- **Botão "Criar Próximo Mês"**: Duplica a estrutura de meses anteriores para ganhar tempo.
- **Botão "Duplicar Mês (Avançado)"**: Abre um modal para escolher de qual mês e de qual unidade deseja importar os dados.

### 3.3. Comparativo (Inteligência)
A página de auditoria e análise de IA.
- **Insights de IA**: Dividido em Resumo Executivo (análise fluida), Ocorrências e Padrões (cards com impacto em R$) e Sugestões de Ajuste.
- **Sugestão da Ana**: Bloco lateral com avatar onde a gestora registra percepções macro do mês. Possui salvamento automático na nuvem.
- **Tabela de Variações**: Lista todos os colaboradores que tiveram mudança de valor.
  - **Coluna "Motivo (Ana)"**: Campo de texto para justificar a variação (ex: "Férias"). Este campo alimenta o aprendizado da IA.

### 3.4. Colaboradores (Gestão de Pessoas)
Cadastro completo integrado.
- **Toggle View**: Alterna entre visualização de Cards (visual) e Tabela (compacta).
- **Filtros Avançados**: Busca por nome, departamento ou status (Ativo/Inativo).
- **Modal Wizard (6 Passos)**: 
  1. Dados Pessoais (com upload e crop de foto).
  2. Endereço.
  3. Contrato (Tipo, Admissão, Função).
  4. Remuneração (Salário Base).
  5. Alocação (Unidade Fixa, Rateio, Instrumentos).
  6. Dados Bancários (Banco, Conta, PIX).

---

## 4. Guia Passo a Passo para a Ana (Fechamento de Mês)

Para realizar um fechamento de folha sem erros, siga este fluxo:

1.  **Criação do Período**: No topo da página, clique no seletor de meses e use a opção para criar o próximo mês (ou duplicar de um anterior para carregar a base).
2.  **Ajustes Operacionais**: Na aba **Lançamentos**, use o filtro de unidade para revisar unidade por unidade. Altere valores de comissões e bônus diretamente na tabela.
3.  **Auditoria de Alertas**: No topo da aba Lançamentos, verifique o card de Alertas. Clique em "Anotar" em cada variação alta para registrar o motivo (ex: "Bônus batimento de meta"). Isso "acalma" a IA.
4.  **Análise de IA**: Vá para a aba **Comparativo** e clique em "Atualizar" nos Insights de IA. Leia a análise para ver se a IA detectou algo que você esqueceu.
5.  **Registro de Percepções**: No card "Sugestão da Ana", escreva um resumo de como foi o mês financeiro.
6.  **Aprovação**: Se tudo estiver correto, use a barra de ação flutuante no rodapé para mudar o status de "Rascunho" para "Aprovada". Isso congela os dados para histórico.

---

## 5. Auditoria de Segurança e Vulnerabilidades

### 5.1. Row Level Security (RLS)
- **Status Atual**: O RLS está habilitado em todas as tabelas. 
- **Vulnerabilidade Identificada**: As políticas atuais para a role `anon` permitem `INSERT`, `UPDATE` e `DELETE` público sem autenticação forte (JWT de usuário logado). Isso foi configurado para agilizar o desenvolvimento, mas em produção, qualquer pessoa com a URL do projeto pode alterar dados via API se não houver um middleware de autenticação (Supabase Auth).
- **Recomendação**: Implementar o Supabase Auth e alterar as políticas de `TO anon` para `TO authenticated`.

### 5.2. Dados Sensíveis
- **Risco**: CPF, RG e Dados Bancários estão trafegando em texto claro.
- **Vulnerabilidade**: Se o frontend for acessado em um ambiente não seguro, esses dados podem ser expostos.
- **Recomendação**: Aplicar máscaras de dados no banco ou usar criptografia a nível de coluna (pgsodium) para dados bancários e documentos.

### 5.3. Frontend
- **Risco**: Armazenamento de segredos no `.env.local`.
- **Vulnerabilidade**: A `SUPABASE_ANON_KEY` é exposta no bundle do navegador por design, mas a `GEMINI_API_KEY` **nunca** deve estar no frontend. 
- **Status**: Atualmente a chave do Gemini está protegida dentro da Edge Function (lado do servidor), o que é a prática correta de segurança.

---

## 6. Conclusão do Negócio
O sistema LA Music Payroll v1.2.0 é uma ferramenta de produtividade que transforma o fechamento de folha de uma tarefa de 2 dias em uma tarefa de 2 horas. A união entre a agilidade operacional do MusiClass e a inteligência analítica do Gemini cria um ambiente de decisão baseada em dados, reduzindo erros de pagamento e aumentando a transparência na gestão de pessoas.

---
*Gerado em: 10 de Janeiro de 2026*
*Versão do Relatório: 1.0 - Executiva*
