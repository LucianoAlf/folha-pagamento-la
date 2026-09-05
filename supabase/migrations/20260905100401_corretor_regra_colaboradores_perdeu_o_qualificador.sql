update public.maria_classificacao_regras
   set palavra_chave = 'UNIFORME',
       observacao = coalesce(observacao || ' | ', '')
                    || '05/09/2026: era COLABORADORES; generalizacao larga demais conflitava com '
                    || '"Caixas Colaboradores LA Culture" (5.3.13). Restrita ao qualificador.'
 where palavra_chave = 'COLABORADORES'
   and origem = 'corretor-v1';
