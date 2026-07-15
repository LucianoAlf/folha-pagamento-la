# Rateio Lote 1 - Folha 17 - Julho/2026

> Escrita controlada executada exclusivamente por `public.folha_rateio_contas_salvar`, uma chamada por colaborador. Nenhum `INSERT` ou `UPDATE` direto, migration ou alteração dos valores da folha foi executado.

## Resultado executivo

- Colaboradores solicitados: **57**.
- RPCs concluídas: **57 com sucesso, 0 erros**.
- Fatias rateadas no subconjunto: **116**, todas com conta pagadora.
- Total rateado no subconjunto: **R$ 147.032,08**.
- Total geral da folha antes e depois: **R$ 170.859,46**.
- Auditorias `RATEIO_CONTAS`: **57**.
- Os nove divergentes e Jeyson Gaia permaneceram sem conta pagadora.

## Preflight antes e depois

| Indicador | Antes | Depois |
|---|---:|---:|
| Pessoas pendentes | 67 | 10 |
| Fatias sem conta | 138 | 25 |
| Incoerências fiscais | 0 | 0 |
| Conflitos de chave | 0 | 0 |
| Diferença | R$ 0,00 | R$ 0,00 |
| Total da folha | R$ 170.859,46 | R$ 170.859,46 |

## Totais por conta no Lote 1

| Conta | Esperado pelo extrato | Gravado na folha | Diferença |
|---|---:|---:|---:|
| Kids CG | R$ 20.809,88 | R$ 20.809,88 | R$ 0,00 |
| EMLA CG | R$ 29.433,88 | R$ 29.433,88 | R$ 0,00 |
| Recreio | R$ 53.970,79 | R$ 53.970,79 | R$ 0,00 |
| Barra | R$ 42.817,53 | R$ 42.817,53 | R$ 0,00 |

## Fabiola Valdevino - exceção operacional conhecida

- Todo o pagamento de **R$ 4.859,20** foi atribuído à conta Recreio.
- As linhas CG e Barra foram consolidadas na unidade derivada `rec`, conforme o caixa real.
- O detalhamento `PG RESCISÃO` permaneceu preservado na linha de origem.
- Resultado final: 2 fatias, ambas na conta Recreio.

## Resultado por colaborador

| Colaborador | Total | Kids CG | EMLA CG | Recreio | Barra | Status | Audit ID |
|---|---:|---:|---:|---:|---:|---|---|
| Alan Samico | R$ 240,00 | R$ 240,00 | R$ 0,00 | R$ 0,00 | R$ 0,00 | SUCESSO | `91a79814-c1ea-4ec5-8b42-6725f2a5d498` |
| Alexandre Sá | R$ 3.336,90 | R$ 1.419,90 | R$ 0,00 | R$ 1.917,00 | R$ 0,00 | SUCESSO | `71ad48b8-174d-480c-9054-c427f039b847` |
| Ana Beatriz Paz de Almeida | R$ 906,30 | R$ 0,00 | R$ 0,00 | R$ 906,30 | R$ 0,00 | SUCESSO | `3dfe186e-e0e9-4343-92a9-0de5f99798ab` |
| Anne Krissya | R$ 5.801,37 | R$ 0,00 | R$ 200,00 | R$ 150,00 | R$ 5.451,37 | SUCESSO | `806f58fa-9dc2-4505-9944-861dc73cde35` |
| Arthur Côrtes | R$ 2.325,82 | R$ 0,00 | R$ 0,00 | R$ 0,00 | R$ 2.325,82 | SUCESSO | `11468029-afb8-4ea5-b3b4-736500096158` |
| Clayton Queiroz | R$ 4.703,06 | R$ 0,00 | R$ 0,00 | R$ 4.703,06 | R$ 0,00 | SUCESSO | `0afa6e41-ed45-443c-b1b3-86e95cb2f194` |
| Daiana Amorim | R$ 2.130,82 | R$ 0,00 | R$ 0,00 | R$ 2.130,82 | R$ 0,00 | SUCESSO | `77330a49-d20e-4433-9f01-8963e71f7362` |
| Eduarda Bonfim | R$ 2.066,82 | R$ 0,00 | R$ 0,00 | R$ 0,00 | R$ 2.066,82 | SUCESSO | `34cdb2d8-584c-4c2b-81c7-6385de7dd625` |
| Eduardo Teixeira | R$ 704,79 | R$ 704,79 | R$ 0,00 | R$ 0,00 | R$ 0,00 | SUCESSO | `aa692adb-3e14-4853-89d0-22ddb32028c6` |
| Erick Cosme da Silva | R$ 2.935,00 | R$ 0,00 | R$ 0,00 | R$ 1.873,00 | R$ 1.062,00 | SUCESSO | `dc3554a6-ea57-4a50-a21f-709d390829ff` |
| Fabiola Valdevino | R$ 4.859,20 | R$ 0,00 | R$ 0,00 | R$ 4.859,20 | R$ 0,00 | SUCESSO | `34ce6102-0ea7-4513-8e1a-1707fc7844b3` |
| Fabricio Costa de Oliveira (Fafá) | R$ 902,10 | R$ 0,00 | R$ 902,10 | R$ 0,00 | R$ 0,00 | SUCESSO | `25db4cd4-c0ec-4fe6-b474-71d9ecf5eecd` |
| Fernanda Silva | R$ 2.663,07 | R$ 0,00 | R$ 0,00 | R$ 2.663,07 | R$ 0,00 | SUCESSO | `30ed2b7f-7981-4413-b0fb-fcfcc1e79a85` |
| Gabriel Anthony | R$ 2.640,82 | R$ 0,00 | R$ 0,00 | R$ 0,00 | R$ 2.640,82 | SUCESSO | `f9027569-e78c-4234-8a5e-1fd633b4e971` |
| Gabriel Leão | R$ 2.522,99 | R$ 1.000,00 | R$ 316,49 | R$ 0,00 | R$ 1.206,50 | SUCESSO | `bde29b0e-1201-475e-b5ca-44cad559dcec` |
| Gabriel Otávio | R$ 2.028,90 | R$ 2.028,90 | R$ 0,00 | R$ 0,00 | R$ 0,00 | SUCESSO | `7e092ff1-5d8e-44e9-a8cf-24f8875fb30f` |
| Gabriela Vitória | R$ 1.402,57 | R$ 0,00 | R$ 1.402,57 | R$ 0,00 | R$ 0,00 | SUCESSO | `6ca7be63-bce3-4489-b959-705985ac4794` |
| Isaque Mendes | R$ 4.265,20 | R$ 0,00 | R$ 0,00 | R$ 1.033,20 | R$ 3.232,00 | SUCESSO | `ab9aa8c7-2591-41ae-84e8-80ee49e82c23` |
| Israel Rocha | R$ 2.610,00 | R$ 0,00 | R$ 1.275,00 | R$ 1.335,00 | R$ 0,00 | SUCESSO | `d1ba25d6-3ca3-4e18-b570-80bf51f9f989` |
| Jeremias Junior | R$ 4.151,12 | R$ 2.075,56 | R$ 2.075,56 | R$ 0,00 | R$ 0,00 | SUCESSO | `f6be980f-d8e5-4cfc-a75e-126f4d359749` |
| Jéssica Viana | R$ 1.500,00 | R$ 0,00 | R$ 600,00 | R$ 500,00 | R$ 400,00 | SUCESSO | `dbebc90c-6696-406d-bfae-f0303fc503fb` |
| Joel Filho | R$ 3.154,91 | R$ 0,00 | R$ 1.599,71 | R$ 1.383,20 | R$ 172,00 | SUCESSO | `8e7d5776-5253-4762-a13b-796b7e3e0857` |
| Jordan Barbosa | R$ 2.940,36 | R$ 2.340,36 | R$ 0,00 | R$ 350,00 | R$ 250,00 | SUCESSO | `050f348e-01d1-4651-b0a1-59e9f887bbe0` |
| Juliana Baltazar | R$ 2.842,85 | R$ 0,00 | R$ 1.042,85 | R$ 1.000,00 | R$ 800,00 | SUCESSO | `f994a462-17b7-4b89-8cdb-cf50ff43aed5` |
| Kailane Marcos | R$ 3.160,82 | R$ 0,00 | R$ 0,00 | R$ 0,00 | R$ 3.160,82 | SUCESSO | `b3d69c46-8435-4d78-8da8-c4f6157d7c14` |
| Kaio Felipe | R$ 3.221,12 | R$ 1.632,12 | R$ 1.000,00 | R$ 589,00 | R$ 0,00 | SUCESSO | `4487ad82-87d2-4032-809d-74a576ca1d08` |
| Larissa Bheatriz | R$ 2.601,82 | R$ 0,00 | R$ 0,00 | R$ 1.275,00 | R$ 1.326,82 | SUCESSO | `47a1b14f-11cf-4f7f-aea5-94187cb750f3` |
| Léo Castro | R$ 4.720,00 | R$ 400,00 | R$ 0,00 | R$ 250,00 | R$ 4.070,00 | SUCESSO | `e4b6a817-16ac-401d-b747-2984f80bc277` |
| Lohana Leopoldo | R$ 3.108,47 | R$ 411,47 | R$ 0,00 | R$ 1.937,00 | R$ 760,00 | SUCESSO | `4fb944dc-5416-43e6-9a94-9375d37c81a9` |
| Lucas Guimarães | R$ 3.410,80 | R$ 0,00 | R$ 0,00 | R$ 3.410,80 | R$ 0,00 | SUCESSO | `53c1dd16-0848-4d91-b849-698b581ec041` |
| Lucas Souza | R$ 900,00 | R$ 0,00 | R$ 900,00 | R$ 0,00 | R$ 0,00 | SUCESSO | `365d7998-ddf1-457d-9482-3e87e987f467` |
| Lúcia Helena | R$ 1.800,00 | R$ 1.800,00 | R$ 0,00 | R$ 0,00 | R$ 0,00 | SUCESSO | `44d51bcb-3c2e-4d03-9b20-b92f195a12af` |
| Marcos Ângelo | R$ 149,10 | R$ 149,10 | R$ 0,00 | R$ 0,00 | R$ 0,00 | SUCESSO | `10a887c9-b75d-42a8-aaed-4df35435ddad` |
| Marcos Delfino Serafim | R$ 1.163,60 | R$ 0,00 | R$ 896,00 | R$ 267,60 | R$ 0,00 | SUCESSO | `879488ad-93f7-4651-870c-6238ac3229f2` |
| Marcos Quintela | R$ 3.220,00 | R$ 1.420,00 | R$ 0,00 | R$ 1.000,00 | R$ 800,00 | SUCESSO | `2b6229a6-c305-4312-a4f1-e70f585edc9a` |
| Mariana Carneiro | R$ 555,00 | R$ 0,00 | R$ 0,00 | R$ 0,00 | R$ 555,00 | SUCESSO | `a25f7719-49be-447d-b7c7-603dad69c7e2` |
| Matheus Felipe Lourenço | R$ 2.901,79 | R$ 1.161,79 | R$ 0,00 | R$ 1.490,00 | R$ 250,00 | SUCESSO | `4d9f45cc-e21a-4e40-9417-39ee014f0494` |
| Matheus Lana | R$ 4.215,07 | R$ 0,00 | R$ 0,00 | R$ 200,00 | R$ 4.015,07 | SUCESSO | `ac998a22-2497-4dd8-a56b-5e79933c2bc0` |
| Matheus Reis | R$ 995,00 | R$ 0,00 | R$ 0,00 | R$ 0,00 | R$ 995,00 | SUCESSO | `bf8bd73d-2a4a-4fda-8773-55101aec8894` |
| Matheus Santos | R$ 1.984,80 | R$ 0,00 | R$ 875,00 | R$ 1.109,80 | R$ 0,00 | SUCESSO | `21f8f45e-c773-4a96-9e28-032771d4f9c2` |
| Matheus Sterque | R$ 661,60 | R$ 0,00 | R$ 661,60 | R$ 0,00 | R$ 0,00 | SUCESSO | `ad1fd4e3-975c-414d-b372-53e68f08c932` |
| Neuza Martins | R$ 2.078,43 | R$ 0,00 | R$ 2.078,43 | R$ 0,00 | R$ 0,00 | SUCESSO | `e0d5d517-36c1-46a4-82db-a6ee3f8e0ae0` |
| Paula de Jesus Bastos | R$ 330,85 | R$ 0,00 | R$ 0,00 | R$ 330,85 | R$ 0,00 | SUCESSO | `62bd2606-b689-4651-b8bf-5116740a1066` |
| Peterson Biancamano | R$ 4.746,65 | R$ 0,00 | R$ 2.986,65 | R$ 350,00 | R$ 1.410,00 | SUCESSO | `48e35889-24c4-4173-bcb5-7a1be0e8e278` |
| Rafael Alves (Akeem) | R$ 5.335,00 | R$ 0,00 | R$ 0,00 | R$ 5.335,00 | R$ 0,00 | SUCESSO | `993a8964-7ab4-44a5-b536-574df7d7ac6d` |
| Rafael Henrique de Oliveira Tavares | R$ 3.263,39 | R$ 263,39 | R$ 0,00 | R$ 1.000,00 | R$ 2.000,00 | SUCESSO | `296ef390-48b3-4484-8ac1-eb807e072ae6` |
| Ramon Pina | R$ 2.905,00 | R$ 580,00 | R$ 0,00 | R$ 2.325,00 | R$ 0,00 | SUCESSO | `3bfe8acc-b157-4882-96a3-34b1e30ae2d0` |
| Renan Amorim | R$ 2.133,78 | R$ 0,00 | R$ 913,78 | R$ 1.220,00 | R$ 0,00 | SUCESSO | `50625e84-bab7-4928-9769-d42fb0178b14` |
| Rodrigo Pinheiro | R$ 3.193,18 | R$ 0,00 | R$ 2.593,18 | R$ 350,00 | R$ 250,00 | SUCESSO | `612c5c82-4e6c-4de2-bdcd-6b02e90b62ec` |
| Roseane Alves | R$ 3.850,00 | R$ 0,00 | R$ 1.650,00 | R$ 1.420,00 | R$ 780,00 | SUCESSO | `4e3e7546-0f9b-4ffc-b116-c0d090ccc2ef` |
| Valdo Delfino | R$ 3.942,00 | R$ 0,00 | R$ 2.801,00 | R$ 1.141,00 | R$ 0,00 | SUCESSO | `dead51b4-3728-4dd8-883e-9d80db443848` |
| Vicente Pinheiro | R$ 1.042,40 | R$ 0,00 | R$ 0,00 | R$ 1.042,40 | R$ 0,00 | SUCESSO | `1a5a06f8-1c01-4e3c-99ec-e57e578d4f54` |
| Vitória Vivian | R$ 2.365,00 | R$ 1.182,50 | R$ 1.182,50 | R$ 0,00 | R$ 0,00 | SUCESSO | `4385a895-0f85-433d-8d4f-99a0fb45aefa` |
| Willer Arruda | R$ 2.233,12 | R$ 0,00 | R$ 451,30 | R$ 1.231,82 | R$ 550,00 | SUCESSO | `e9b448d4-abf0-4ef0-a078-c5c5e15ec887` |
| William Andrade | R$ 2.345,82 | R$ 0,00 | R$ 0,00 | R$ 925,00 | R$ 1.420,82 | SUCESSO | `08d6a0d8-ff24-44cc-a4a3-d8a52f635e64` |
| Willian Luiz Barros Ribeiro | R$ 1.526,00 | R$ 1.000,00 | R$ 526,00 | R$ 0,00 | R$ 0,00 | SUCESSO | `72dfccb0-0144-4cdd-be66-e3db48a2f09d` |
| Yuri Stanzi | R$ 3.337,50 | R$ 1.000,00 | R$ 504,16 | R$ 966,67 | R$ 866,67 | SUCESSO | `f9ecbbd7-89fd-444d-ac16-7ba1f851fe7b` |

## Pendências preservadas para o próximo ticket

| Colaborador | Fatias sem conta | Total atual |
|---|---:|---:|
| Ana Paula | 3 | R$ 3.499,32 |
| Caio Araujo | 2 | R$ 3.730,60 |
| Daiana Pacífico | 5 | R$ 3.405,99 |
| Jeyson Gaia | 2 | R$ 360,50 |
| Jhonatan Samuel | 1 | R$ 1.887,61 |
| Johnatan Gomes | 3 | R$ 2.681,83 |
| Jonathan Santos | 1 | R$ 60,00 |
| Letícia Palmeira | 2 | R$ 2.177,70 |
| Marcos Saturnino | 4 | R$ 3.368,01 |
| Pedro Glória | 2 | R$ 2.655,82 |

## Guardrails confirmados

- Gravação somente via RPC, com ator de sistema `codex-lote1-folha17-2026-07-11`.
- Totais por categoria e componente preservados pela validação da RPC.
- Total geral da folha imutável.
- Nenhum dos nove divergentes foi rateado.
- Jeyson Gaia continua pendente e sem conta pagadora.
- O processo parou neste checkpoint para auditoria do Claude.
