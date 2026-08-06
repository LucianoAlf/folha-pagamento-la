# Guia de Entrevista para impressao

## Objetivo

Permitir que RH imprima um guia A4 a partir do roteiro de entrevista salvo no candidato, sem gerar ou persistir PDF, sem expor perfil comportamental e sem colocar dados operacionais em URLs.

## Dados e seguranca

`RhInterviewQuestion` passa a aceitar `titulo_curto`, `sinal_consistencia` e `sinal_atencao`. Os tres campos sao opcionais na leitura para que roteiros historicos continuem imprimiveis. O gerador exige os campos nos novos roteiros, limita sinais a 90 caracteres no servidor e nunca inclui ancora, perfil, codinome, valores, nota, score ou fit no documento.

A modal cria um payload operacional efemero (data, horario, local e ate tres condutores) em `sessionStorage` sob uma chave aleatoria. Ela abre a rota do guia, remove a chave da aba de origem e a nova aba consome e remove sua copia. A rota recebe apenas o UUID do candidato, exige a sessao/RH ja existente e busca o candidato por ID.

## Impressao

A rota independente renderiza somente o documento em modo claro. A primeira pagina tem cabecalho completo; as paginas seguintes usam faixa fixa curta com identificacao e numero de pagina. O layout e fluido: nao ha total de paginas fixo; blocos de pergunta usam regras de nao quebra. A impressao automatica ocorre uma vez somente depois de fontes e logo carregarem; o documento mantem botao de reimpressao.

## Estados

Sem perguntas, nao ha botao. Perguntas historicas sem sinais preservam as linhas de anotacao e omitem os textos dos dois quadros. Se `perguntas_desatualizadas` for verdadeiro, a modal exibe o aviso e exige confirmacao para imprimir. Falta de payload apos refresh mostra instrucao para voltar, sem imprimir um documento em branco.

## Validacao

Testes cobrem normalizacao e limites do contrato, payload efemero e mapeamento de pilares. QA em Chrome deve verificar roteiro longo com cinco ou seis paginas, faixa e numero repetidos, nenhum bloco quebrado e ausencia de ancora/perfil no DOM impresso.
