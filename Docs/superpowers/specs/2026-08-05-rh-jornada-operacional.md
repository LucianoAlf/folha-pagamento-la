# Jornada RH operacional para Ana

## Objetivo

Deixar a Jornada RH utilizável pela conta `rh@lamusicschool.com.br`, corrigindo autorização, carregamento de colaboradores e os fluxos operacionais sem ampliar permissões indevidas nem alterar dados reais de folha.

## Diagnóstico confirmado

- A conta da Ana existe em `auth.users`, mas não possui linha em `public.user_profiles`; `rh_current_role()` cai para `user` e as escritas RH retornam 403 por RLS.
- `user_profiles` permite hoje que qualquer usuário autenticado insira ou atualize a própria coluna `role`, o que permite elevação de privilégio fora da UI.
- RH só enxerga o próprio perfil em `user_profiles`; por isso responsáveis e participantes podem aparecer como “não identificados”.
- As abas Onboarding e Colaboradores dependem de `colaboradores?select=*`. Durante a auditoria, essa chamada apresentou timeout/falha e derrubou toda a aba.
- O erro de schema cache fotografado coincidiu com indisponibilidade/reinicialização do banco. O frontend precisa encerrar a espera e oferecer recuperação clara, mas não pode mascarar uma indisponibilidade real do Supabase.

## Solução aprovada

### 1. Identidade e autorização

- Criar perfil padrão `user` automaticamente para novos `auth.users`.
- Fazer backfill idempotente dos usuários atuais sem perfil.
- Promover explicitamente apenas `rh@lamusicschool.com.br` para `rh` nesta migration.
- Permitir que `admin`/`rh` leiam perfis operacionais para montar seletores de responsáveis.
- Remover INSERT/UPDATE direto de `authenticated` em `user_profiles`.
- Expor RPC restrita para o próprio usuário alterar somente `nome` e `avatar_url`; `role` nunca será recebido do navegador.

### 2. Carregamento do RH

- Criar leitura dedicada e estreita para colaboradores do RH, sem `select=*` e sem campos pessoais/financeiros desnecessários.
- Usar timeout explícito e uma repetição automática apenas para GETs transitórios; 4xx, especialmente 403, não serão repetidos.
- Exibir erro acionável após o limite em vez de spinner indefinido.
- Manter o botão de repetição manual existente.

### 3. Testes e dados

- Testes automatizados cobrem o contrato SQL de menor privilégio, o backfill da Ana, o RPC de perfil, a leitura estreita e a política de retry.
- QA no Simple Browser cobre todas as oito abas, todos os modais alcançáveis e os botões habilitados.
- Escritas de recrutamento usam registros prefixados `TESTE CODEX RH`; nenhuma mensagem de WhatsApp é enviada.
- Fluxos que exigem colaborador usam fixture transacional ou registro HML já destinado a homologação; nenhum colaborador produtivo é alterado.
- Todo artefato de teste persistente criado durante o QA será arquivado/limpo ao final.

## Limites

- Sem merge e sem deploy do frontend nesta entrega; será feito commit e push somente da branch.
- A migration poderá ser aplicada ao projeto Supabase após validação local porque a autorização da Ana depende dela e foi explicitamente confirmada.
- Não alterar folha, férias, rateios, pagamentos ou cadastros produtivos de colaboradores.
