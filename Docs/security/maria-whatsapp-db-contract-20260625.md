# Maria WhatsApp DB Contract - 2026-06-25

Este contrato cobre apenas o lado Super Folha/Supabase. A bridge inbound da Maria vive fora deste repo e deve rotear cada sender para o perfil correto.

## Perfis de conexao

| Perfil Maria | Papel | Caminho |
| --- | --- | --- |
| `maria-owner` | `owner_full` | Supabase `service_role` existente. Somente Alf. |
| `maria-operacional` | `finance_ops_write_safe` / `finance_assistant_write_safe` | Postgres role `maria_operacional`. SELECT + RPCs allowlisted. |
| `maria-leitura` | `strategic_read_prepare` | Postgres role `maria_leitura`. SELECT-only. |

As roles `maria_operacional` e `maria_leitura` sao criadas sem senha versionada. Defina as senhas fora do git/chat, por exemplo pelo SQL editor/admin:

```sql
alter role maria_operacional with password '<guardar-somente-na-vps-ou-vault>';
alter role maria_leitura with password '<guardar-somente-na-vps-ou-vault>';
```

Depois configure a bridge/OpenClaw com essas credenciais no mecanismo de segredo da VPS. Nao commitar `.env`, tokens, dumps, SQLite, logs ou media inbound.

## Identidade obrigatoria por chamada operacional

Toda RPC operacional recebe a identidade real do WhatsApp:

- `p_ator_numero`: numero bruto do sender vindo da UAZAPI.
- `p_papel`: papel injetado pela bridge.
- `p_canal`: origem/canal, por exemplo `whatsapp:grupo-financeiro`.
- `p_texto_original`: texto original recebido.
- `p_motivo`: motivo normalizado, quando a Maria tiver.

A RPC valida o sender contra `maria_whatsapp_atores` por hash do numero e registra `maria_audit_log` com ator, papel, canal, antes/depois e texto original.

## Allowlist de sender

| Pessoa | Papel esperado |
| --- | --- |
| Alf | `owner_full` |
| Rose | `finance_ops_write_safe` |
| Ana | `finance_assistant_write_safe` |
| Anne | `strategic_read_prepare` |

A bridge deve ignorar mensagens de outros remetentes em grupos. Mensagens de terceiros podem entrar como contexto/passive inbox, mas nao acionam resposta nem ferramenta.

## RPCs operacionais allowlisted

Todas rodam como `SECURITY DEFINER`, validam input, escrevem audit log e sao executaveis por `maria_operacional` e `service_role`. `maria_leitura` nao recebe `EXECUTE`.

| RPC | Escopo estreito |
| --- | --- |
| `maria_contas_corrigir_valor` | Atualiza somente `contas_pagar.valor`. |
| `maria_contas_alterar_vencimento` | Atualiza somente `data_vencimento` e `competencia`. |
| `maria_contas_atualizar_status` | Atualiza somente `status` para `pendente`, `pago`, `cancelado` ou `finalizado`. Nao executa pagamento. |
| `maria_contas_registrar_observacao` | Substitui somente `observacoes`. |
| `maria_contas_definir_plano_conta` | Atualiza somente `plano_conta_id`, validando folha ativa de saida. |
| `maria_contas_definir_centro_custo` | Atualiza `centro_custo_id` e sincroniza `unidade` pelo codigo da unidade ativa. |
| `maria_contas_codigo_mes_registrar` | Registra codigo/chave/payload de pagamento mensal. Nao paga. |
| `maria_contas_codigo_mes_marcar_indisponivel` | Marca o codigo mensal como indisponivel. |

Se a Maria precisar de uma mutacao que nao esteja nesta lista, a resposta deve ser:

> Consigo preparar/conferir, mas essa alteracao ainda nao tem ferramenta segura. Preciso que o Alf libere ou que criemos a funcao.

## Grants esperados

`maria_operacional`:

- `USAGE` em schema `public`.
- `SELECT` nas tabelas operacionais necessarias.
- `EXECUTE` somente nas RPCs listadas acima.
- Sem `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` ou `TRIGGER` direto nas tabelas.

`maria_leitura`:

- `USAGE` em schema `public`.
- `SELECT` nas tabelas operacionais necessarias.
- Sem `EXECUTE` nas RPCs de escrita.
- Sem escrita direta.

`service_role`:

- Continua sendo o caminho owner/admin, reservado ao Alf.

## Linha vermelha

Nenhum perfil da Maria executa PIX, transferencia, pagamento ou debito bancario automatico. As RPCs apenas preparam, classificam, corrigem dados operacionais e registram status/codigos.
