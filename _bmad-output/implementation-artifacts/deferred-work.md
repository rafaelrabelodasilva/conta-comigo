# Trabalho adiado
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-criar-o-projeto-e-publica-lo-na-vercel.md`
  summary: Estender o lint do núcleo (AD-1) para proibir rede, relógio, DOM e APIs só de Node (`fetch`, `Date.now`, `new Date()` sem argumento, `window`, `document`, `node:*`, `fs`) em `src/domain`.
  evidence: AD-1 proíbe esses usos, mas a regra da 1.1 cobre só imports de camadas, Next, React e Supabase.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-criar-o-projeto-e-publica-lo-na-vercel.md`
  summary: Proteger `src/server` com `import "server-only"` (ou regra de lint) antes de a primeira história colocar segredos lá (1.2 ou 2.1).
  evidence: Hoje nada impede um componente cliente de importar `src/server/*`; a guarda exige a dependência `server-only`.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-criar-o-projeto-e-publica-lo-na-vercel.md`
  summary: Na História 1.2, desligar `enable_signup` em `[auth]` e `[auth.email]` de `supabase/config.toml` para o Supabase local se comportar como produção (cadastro público desligado).
  evidence: `supabase init` gerou `enable_signup = true`, contrário ao requisito de acesso só do Rafael.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-criar-o-projeto-e-publica-lo-na-vercel.md`
  summary: Trocar a `SUPABASE_SECRET_KEY` antes do primeiro uso real: criar chave secreta nova no Supabase, atualizar na Vercel (Production, sensitive) e apagar a antiga.
  evidence: A chave atual foi colada no chat com o agente durante a 1.1 e ficou no histórico da conversa.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-entrar-com-e-mail-e-senha.md`
  summary: Provar automaticamente que importar `src/server/*` ou `src/data/supabase/servidor.ts` num Client Component falha (regra de lint para arquivos `"use client"` ou build de fixture no CI).
  evidence: A guarda `server-only` foi verificada só à mão na 1.2; o Vitest troca o pacote por módulo vazio e o CI não builda uma violação, então remover o import não falha nada.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-visual-base-e-menu-lateral.md`
  summary: Montar um ambiente de teste com DOM (happy-dom ou jsdom) e testar o comportamento dos componentes da 1.3: `ConfirmarAcao` foca o botão destrutivo (Enter confirma), `ToastProvider` fecha em 6 s e roda "Desfazer" uma vez, `MenuAcoes` engole o clique depois do toque longo, e o adaptador de teclado do `NavRail`.
  evidence: Vitest roda com `environment: "node"`; só as funções puras (`toast.ts`, `toque-longo.ts`, `navegacao.ts`) têm teste, e trocar a ligação nos componentes não quebra nenhum teste. Fazer quando o primeiro uso real chegar (Épicos 2 e 3).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-visual-base-e-menu-lateral.md`
  summary: Confirmar se `<Botao asChild>` funciona dentro de um Server Component (o `Slot` do Radix usa `useComposedRefs` e não tem "use client").
  evidence: Não verificado (maybe-false); se quebrar, seria medium. Resolve-se renderizando uma página servidor com `<Botao asChild><Link …/></Botao>` no build. Nenhum uso hoje.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-cadastrar-responsaveis-com-cor-sincronizados-entre-aparelhos.md`
  summary: Permitir mais de 8 Responsáveis com cor própria: ampliar as cores fixas do DESIGN.md (com pares claro/escuro medidos) ou oferecer paleta personalizada com etiqueta calculada pelo app.
  evidence: Na 1.4 o Rafael escolheu bloquear o "＋ Novo" quando as 8 cores estão em uso (arquivados incluídos) e ampliar depois; hoje ele usa 5 Responsáveis.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-cadastrar-responsaveis-com-cor-sincronizados-entre-aparelhos.md`
  summary: Zerar o estado do gerenciador de Realtime (`gerenciadores`, canais e o `repo` de Responsáveis) ao Sair e ao mudar a sessão.
  evidence: maybe-false, medium não verificado. Os módulos vivem a página toda e o "Sair" é Server Action com redirect. Resolve-se saindo e entrando sem recarregar e conferindo se o canal continua recebendo eventos com o token novo e se não sobra dado de outra sessão.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-cadastrar-responsaveis-com-cor-sincronizados-entre-aparelhos.md`
  summary: Testar com DOM os componentes de Responsáveis (`SecaoResponsaveis`, `LinhaResponsavel`, `SeletorCor`): renomear ao sair do campo e com Enter, Esc cancela, erro em `aria-describedby`, "＋ Novo" desativado com 8 cores, erro de carga chama `recarregar`.
  evidence: Vitest roda em `node`; as regras estão no núcleo com teste, mas a ligação nos componentes não tem teste. Junta-se ao item de ambiente com DOM da 1.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-cadastrar-responsaveis-com-cor-sincronizados-entre-aparelhos.md`
  summary: Renomear `src/ui/toast.ts` (ou `Toast.tsx`) para nomes que não difiram só em maiúsculas.
  evidence: No macOS (sistema de arquivos sem diferenciar maiúsculas) `tsc` e `vitest` falham ao confundir `src/ui/Toast.tsx` com `src/ui/toast.ts`; no CI (Linux) passa. Vem da 1.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-gerenciar-status-e-substituir-cadastros-em-uso.md`
  summary: Testar o reabrir da janela de substituto quando a RPC recusar por uso.
  evidence: A parte jsonb desta pendência foi fechada na 3.1 (`spec-3-1-regras-que-aprendem-com-a-classificacao.md`): `test/integracao/substituir-cadastro.test.ts` prova a troca do id na contagem das Regras e em `revisao_dados`, a anulação do id sem substituto e que a contagem de usos não muda. O ramo jsonb com `conta_uso` de `contar_usos_cadastro` só roda quando uma referência jsonb contar uso (Fórmulas, Épico 4). Falta o reabrir da janela, que é da tela.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-configurar-o-ciclo-do-cartao-e-a-aparencia.md`
  summary: Testes de componente (jsdom) para `SecaoCiclo`, `SecaoConferencia` e `SecaoAparencia`: dias passados na ordem certa a `planejarMudancaCiclo`, nada gravado com plano `null`, mensagem no campo e rascunho mantido após recusa.
  evidence: Medium não verificado: nenhuma seção tem teste de componente (Vitest em `node`); um erro de fiação inseriria uma linha errada em `config_ciclo`, que só pode ser superada, nunca corrigida.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-10-backup-semanal-fora-do-supabase.md`
  summary: Alertar quando o último backup bem-sucedido tiver mais de ~8 dias (agenda desativada pelo GitHub após 60 dias sem atividade ou falhas repetidas).
  evidence: O GitHub desativa workflows agendados em repositórios sem atividade por 60 dias; hoje só docs/backup.md avisa e o e-mail de falha vai para quem editou o cron.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-prova-tecnica-ler-a-fatura-de-outubro-no-ipad.md`
  summary: Antes da 2.3, avaliar subir o `pdfjs-dist` para a 6.x (a arquitetura fixa 5.6.x) e conferir se o `getTextContent` volta a funcionar no Safari.
  evidence: `npm audit` acusa GHSA-hq66-cqwq-w95j (alta) na 5.6.x, corrigido na 6.2.108; só afeta `enableScripting` do visualizador, que não é usado. A 5.6 também exigiu ler o texto por `getReader()` no Safari 18 (PR #21).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-prova-tecnica-ler-a-fatura-de-outubro-no-ipad.md`
  summary: O plano gratuito do Gemini respondeu 503 ("alta demanda") várias vezes em 03/11/2026; acompanhar na 2.3 e, se continuar, considerar a chave paga (AD-7 item 7) ou outro modelo.
  evidence: `gemini-3.8-flash` deu 503 em todas as tentativas; `gemini-3.6-flash` alternou. A rota já tenta de novo até 2 vezes (PR #22).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-importar-a-fatura-do-mes.md`
  summary: Decidir o ano das parcelas compradas há mais de 12 meses, hoje gravadas com o ano do fechamento (ou do vencimento) ou o anterior.
  evidence: A regra da 2.3 (`dataDoLancamento`) só conhece DD/MM e o corte (fechamento, senão vencimento): a "SHOPEE *CELLSOLUTIONS 12/12" de 01/10 já vai para 2025-10-01, mas uma parcela 13/18 comprada há mais de um ano fica com o ano errado. Afeta só a exibição da data e, no Épico 3, a chave da Série (`mes_primeira_parcela` pode ser calculada pela parcela e pelo Mês, sem a data).
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-painel-do-mes-com-a-grade-de-lancamentos.md`
  summary: Confirmar no Safari do iPad que o VoiceOver lê a linha da grade como "Nome, Valor, Parcela, Responsável, Status" (e, nas linhas marcadas, "verificar este lançamento" no fim), tanto pelo `aria-label` do `<tr>` quanto célula a célula.
  evidence: Medium, não verificado. Atualizado na 2.5 (`spec-2-5-conferencia-e-marca-verificar.md`): além do `aria-label` no `<tr>`, a célula do Nome agora leva um resumo oculto (`sr-only`) com a mesma frase, e o Nome visível (com a bolinha) é `aria-hidden`. O jsdom só confere o DOM; falta a conferência manual no iPad (Rafael nunca usou o VoiceOver, decisão de 08/11/2026), que fecha esta pendência. A decidir nessa conferência: o resumo oculto repete a linha inteira, então quem ouve célula a célula escuta Valor, Parcela, Responsável e Status duas vezes (no resumo e nas próprias células); se incomodar, o resumo pode ficar só com o Nome e "verificar este lançamento".
- source_spec: `_bmad-output/implementation-artifacts/spec-2-8-ajustes-de-centavos.md`
  summary: Testar a falha do "Desfazer" do "Desvincular" (religar que falha mostra o toast; mãe excluída não chama `religar`).
  evidence: Low; `PainelLancamento.test.tsx` cobre só o Desfazer que dá certo e a falha do próprio Desvincular; tirar o `if (!d.ok) toast…` ou a guarda de `excluido_em` não quebra nenhum teste.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-regras-que-aprendem-com-a-classificacao.md`
  summary: Na 3.4, decidir se `regras.ultimo_uso` também muda quando a importação aplica a Regra (hoje só `regrasRepo.aprender()` grava, e a Regra que classifica sozinha todo Mês mostra um "último uso" antigo).
  evidence: Definição da 3.1 ("só `aprender` grava em `regras`"); a tela de Regras aprendidas (3.4) mostra "última vez usada".
- source_spec: `_bmad-output/implementation-artifacts/spec-3-11-reimportar-um-mes.md`
  summary: Testar a tradução do ramo `unique_violation` de `importar_fatura` (o `sqlerrm like '%faturas_owner_id_mes_key%'` devolve `fatura.mes_ja_importado` em vez do erro cru).
  evidence: Low. A 3.11 fixou o nome da restrição (teste do insert direto repetido) e o resultado de duas importações em paralelo, mas a trava `pg_advisory_xact_lock` faz a segunda cair na checagem explícita, não no ramo; um erro de digitação no padrão `like` passaria no CI. Só se alcança o ramo contornando a trava.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-classificar-em-lote.md`
  summary: Rodar no CI (ou no Supabase local) a migração `20261113120000_classificar_em_lote.sql` e `test/integracao/lote.test.ts`, e conferir `database.types.ts` com `supabase gen types`.
  evidence: Medium não verificado. Esta máquina não tem Docker nem a CLI do Supabase: a RPC foi exercitada só num Postgres em memória (pglite) com uma tabela simplificada (tudo ou nada, recusas, `null`, lista vazia, 1001 itens), e a entrada de `classificar_em_lote` em `database.types.ts` foi escrita à mão no formato do gerado. RLS e Realtime só o teste de integração prova.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-classificar-em-lote.md`
  summary: Conferir no iPad a barra de lote (altura, toast acima dela, caixas de 44 pt) e se o VoiceOver anuncia a contagem `role="status"` quando a barra aparece já com "1 selecionado".
  evidence: Low. O jsdom só confere o DOM e as classes; uma região `role="status"` que nasce junto com a barra pode não ser anunciada na primeira marcação (só nas mudanças seguintes). Junta-se à pendência do VoiceOver da 2.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-classificar-em-lote.md`
  summary: Se o Realtime trouxer, durante o lote, uma versão mais nova de uma linha do lote, o `Desfazer` (valores de antes das colunas mudadas) a sobrescreve por coluna.
  evidence: Low. Segue o AD-3 (vale a última gravação por coluna): o retrato guarda só as colunas que o lote mudou, então o Desfazer não toca nas outras, mas desfaz também a mudança de outro aparelho nessas colunas feita dentro dos 6 s.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-gerenciar-regras-aprendidas.md`
  summary: Conferir no iPad se o VoiceOver lê a linha da lista de Regras aprendidas com sentido (chave, Responsável, Tipo, Divisão, última vez usada), já que o cabeçalho das colunas é `aria-hidden`; se ler solto, dar rótulos ocultos por célula.
  evidence: Low, não verificado. Junta-se à pendência do VoiceOver da 2.4 e da 3.3; o jsdom só confere o DOM.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-gerenciar-regras-aprendidas.md`
  summary: Rodar no CI os testes novos de `test/integracao/regras.test.ts` (editar, excluir com DELETE no Realtime e `marcarUso`).
  evidence: Medium não verificado. Esta máquina não tem Docker: os repositórios foram provados só com cliente falso (Vitest) e a tela com jsdom; RLS e Realtime só o teste de integração prova.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-series-e-parcelas-previstas.md`
  summary: Rodar no CI a migração `20261114120000_series_previstos.sql`, `test/integracao/series.test.ts` e a comparação de `database.types.ts` com `supabase gen types`.
  evidence: Medium não verificado. Esta máquina não tem Docker: a migração e a RPC `importar_fatura` foram provadas num Postgres em memória (pglite) com todas as migrações em ordem e os cenários do teste de integração (Série, previstos, duas compras idênticas, recusa sem casamento, Mês com Fatura, reimportação). RLS, Realtime e o formato exato dos tipos gerados só o CI prova; as entradas de `series` e das colunas novas em `database.types.ts` foram escritas à mão no formato do gerado.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-series-e-parcelas-previstas.md`
  summary: Decidir se o "Desfazer" do Confirmar/lote do Revisar também devolve os previstos que a classificação preencheu, e se o lote deve perguntar quando um previsto tem outro valor.
  evidence: Low. Hoje o "Desfazer" devolve só as linhas da fila (como a Regra, que também não é desfeita) e o lote só preenche previstos vazios, sem perguntar; previstos preenchidos continuam como estão e Rafael corrige abrindo o previsto.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-series-e-parcelas-previstas.md`
  summary: Dar um caminho curto para os Meses futuros além de "Mês atual + 1" (o seletor só lista até o mês seguinte; os previstos de jan/27 em diante só aparecem pelas setas).
  evidence: Low. `mesesDaLista` termina em atual + 1 e "as setas andam sem limite" (2.4); os previstos vão até o último mês da Série.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-series-e-parcelas-previstas.md`
  summary: Rever se a barra por Responsável do Painel deve incluir os previstos (hoje inclui, como o resto do Mês) quando os Blocos e a Previsão chegarem (Épico 4/7).
  evidence: Low. O "Total a pagar", a Conferência e o "verificar" filtram por `fatura_id` e ignoram os previstos; a barra por Responsável e a contagem da grade usam todas as linhas do Mês aberto (`linhasDoMes`). Decidido na 4.2: a barra continua incluindo os previstos, como os Blocos (o Bloco "Todos" e a soma das barras batem); reabrir só se a Previsão (Épico 7) pedir.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-series-e-parcelas-previstas.md`
  summary: Conferir no iPad se o VoiceOver lê "Nome, previsto, Valor, Parcela, Responsável, Status" na linha de um previsto.
  evidence: Low, não verificado. Junta-se à pendência do VoiceOver da 2.4; o jsdom só confere o `aria-label`.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-casar-os-previstos-com-a-fatura-real.md`
  summary: Conferir o casamento de verdade na primeira Fatura que tenha previstos no Mês (dez/26, com 21 previstos): os previstos viram a linha real com o mesmo `id`, "Valor mudou" e "Não veio na fatura" aparecem na fila, o resumo do passo 3 conta os casados e reimportar essa Fatura é recusada.
  evidence: Medium não verificado em produção. Hoje out/26 e nov/26 não têm previstos para casar (decisão Q4-A da 3.6): a migração e a RPC foram provadas só no Postgres em memória (pglite) e no Vitest. O que o Rafael pode ver no iPad antes de dez/26 é a regressão (Painel, Revisar, reimportar nov/26).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-casar-os-previstos-com-a-fatura-real.md`
  summary: Rodar no CI a migração `20261115120000_casar_previstos.sql`, `test/integracao/casamento.test.ts` e a comparação de `database.types.ts` com `supabase gen types`.
  evidence: Medium não verificado. Esta máquina não tem Docker: a migração (valores novos do enum, `casado_em`, RPC de 7 argumentos) e os cenários da matriz rodaram no pglite com todas as migrações em ordem; RLS, Realtime e o formato exato dos tipos só o CI prova (as entradas de `casado_em`, do enum e de `previstos_sem_par` foram escritas à mão no formato do gerado).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-casar-os-previstos-com-a-fatura-real.md`
  summary: Decidir se o Valor novo de um casado com "Valor mudou" deve atualizar os previstos seguintes da Série (hoje cada Mês avisa "Valor mudou" de novo, decisão Q3-A).
  evidence: Low. O casamento só toca o Mês importado; a parcela 05/10 com Valor diferente deixa 06/10…10/10 com o Valor antigo, e cada um avisa quando a Fatura chegar.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-casar-os-previstos-com-a-fatura-real.md`
  summary: Tratar a parcela que chega num Mês diferente do previsto (a Fatura atrasa ou adianta uma parcela).
  evidence: Low. O previsto casa só com a Fatura do próprio Mês (`mes` fixo, AD-9); a parcela fora do Mês vira linha nova com Série nova (a chave usa o Mês da Fatura) e o previsto original fica "Não veio na fatura" até Rafael remover.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-casar-os-previstos-com-a-fatura-real.md`
  summary: Conferir no iPad se o VoiceOver lê com sentido as variantes "Valor mudou" ("Antes → agora") e "Não veio na fatura" ("Remover previsto" / "Manter") do Revisar.
  evidence: Low, não verificado. Junta-se à pendência do VoiceOver da 2.4; o jsdom só confere o DOM e os nomes acessíveis.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-herdar-parcelas-sem-previsto.md`
  summary: Rodar no CI a migração `20261116120000_herdar_parcelas.sql` (a RPC `importar_fatura` passa a gravar `apelido` e `observacao`) e `test/integracao/heranca.test.ts`.
  evidence: Medium não verificado. Esta máquina não tem Docker: a migração e os cenários (herdeiras com e sem Série, compras idênticas, previsto excluído, reimportação, casado mantendo o Apelido) rodaram só no Postgres em memória (pglite) com todas as migrações em ordem; RLS e Realtime só o CI prova. A assinatura da RPC não mudou, então `database.types.ts` não muda.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-herdar-parcelas-sem-previsto.md`
  summary: Conferir a herança de verdade na primeira Fatura em que ela aparece: classificar parcelas de out/26 e reimportar nov/26 (ou importar dez/26) e ver "N parcelas herdaram a classificação da parcela anterior" no passo 3, o contador do Revisar menor e a classificação certa na grade.
  evidence: Medium não verificado em produção. Hoje nenhuma linha está classificada, então reimportar nov/26 agora não herda nada (a candidata não tem classificação). Na importação mensal normal quase toda parcela n > 1 já chega com previsto (3.6); a herança vale para a primeira importação com histórico, para a 3.10 (planilha) e para a 3.12 (reimportar mantendo a classificação).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-herdar-parcelas-sem-previsto.md`
  summary: Acrescentar a Divisão à lista de campos herdados (`CAMPOS_HERDADOS` em `src/domain/heranca.ts`) e aos previstos seguintes quando a 3.8 criar a coluna `divisao`.
  evidence: A 3.7 herda Responsável, Tipo, Apelido e Observação; a Divisão não tem coluna até a 3.8 (AC da 3.7 e AD-8 pedem que ela também seja herdada). Sem isso, uma parcela dividida herdaria só Responsável e Tipo.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-herdar-parcelas-sem-previsto.md`
  summary: Decidir o que fazer com a parcela cujo Valor mudou entre n−1 e n (juros, reajuste): hoje não herda e não entra na Série da anterior (a chave da Série inclui o Valor), então segue as Regras e a fila.
  evidence: Low. Decisão Q4-A da 3.7 (FR-8 pede o mesmo Valor). O "Valor mudou" só existe para previsto casado (3.6); a parcela real com Valor novo vira Série nova e o previsto dela, se houver, fica "Não veio".
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-herdar-parcelas-sem-previsto.md`
  summary: Herdar "para trás" (importar um Mês mais antigo que a parcela já gravada, ex.: out/26 depois de nov/26) ou de mais de um Mês antes (n−2 quando falta o Mês anterior).
  evidence: Low. A 3.7 só olha a n−1 do Mês imediatamente anterior (decisão Q5-A). Importar fora de ordem entra na Série pela chave (sem previsto, pois o Mês seguinte já tem Fatura, decisão 1-A), mas só com as Regras.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-herdar-parcelas-sem-previsto.md`
  summary: `regrasUsadas`/`chavesDeRegrasUsadas` marcam o `ultimo_uso` da Regra mesmo quando a herança sobrepôs a classificação dela na linha.
  evidence: Low. A importação calcula as Regras usadas antes da herança; a Regra aparece como usada embora a linha tenha ficado com a classificação da parcela anterior.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-herdar-parcelas-sem-previsto.md`
  summary: Conferir no iPad se o VoiceOver lê com sentido a linha nova do passo 3 ("N parcelas herdaram a classificação da parcela anterior").
  evidence: Low, não verificado. Junta-se à pendência do VoiceOver da 2.4; o jsdom só confere o texto.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-dividir-um-lancamento.md`
  summary: Rodar no CI a migração `20261117120000_dividir_lancamento.sql`, `test/integracao/divisao.test.ts` e a comparação de `database.types.ts` com `supabase gen types`.
  evidence: Medium não verificado. Esta máquina não tem Docker: a migração e as RPCs (`recriar_filhas`, `dividir_lancamento`, `importar_fatura`) foram provadas só no Postgres em memória (pglite) com todas as migrações em ordem; RLS, Realtime e o formato exato dos tipos só o CI prova (as entradas de `divisao`, `dividir_lancamento` e `recriar_filhas` foram escritas à mão no formato do gerado).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-dividir-um-lancamento.md`
  summary: Conferir a Divisão de verdade no iPad (dividir uma linha com Tipo, ver grade, hero, Conferência e barra por Responsável antes e depois, previstos de dez/26 divididos e o Desfazer) e, em dez/26, o casamento de um previsto dividido e a recusa de reimportar essa Fatura.
  evidence: Medium não verificado em produção. Hoje não há Divisão nem filha; o casamento de previsto dividido (filhas mantidas e recalculadas) só rodou no pglite e no Vitest.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-dividir-um-lancamento.md`
  summary: Dar ao Pagamento (História 6.9) uma pergunta antes de `dividir_lancamento`/`recriar_filhas` excluírem em lógico uma filha que já tem Pagamento (redividir, Desfazer divisão).
  evidence: Medium. Decisão 2 da 6.1: excluir uma linha paga é um estado previsto pela 6.9 (linha de crédito em `projetarPendente`, aviso "Este lançamento tem pagamento registrado…"), então um gatilho que proibisse tudo contrariaria a história; a trava certa é a pergunta. Até lá nada se perde: o item guarda o `lancamento_id` (FK) e a linha excluída continua no banco, mas o Pagamento aponta para uma parte que sumiu da grade.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-dividir-um-lancamento.md`
  summary: Permitir dividir uma parcela com Ajuste de centavos (hoje "Dividir" fica desativado com o aviso para desvincular o Ajuste) e corrigir o Valor de uma mãe dividida sem desfazer a divisão.
  evidence: Low. Decisões Q1/Q3-A: o Ajuste fica sem dono se a mãe se divide, e o Valor da mãe dividida é somente leitura (as filhas somam esse Valor).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-dividir-um-lancamento.md`
  summary: Tratar no "Mudar" e no ✓ do Revisar a mãe dividida que voltou à fila (Tipo limpo): hoje o "Mudar" mostra o seletor de Responsável, que `planejarGravacao` ignora.
  evidence: Low. A mãe dividida sai da fila ao dividir (exige Tipo) e só volta se Rafael limpar o Tipo.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-dividir-um-lancamento.md`
  summary: A Regra guarda a Divisão em frações mas não o Status de cada parte (as filhas e os previstos nascem com o Status da mãe), e `recriar_filhas` é executável pelo usuário e contorna as checagens de `dividir_lancamento`.
  evidence: Low. O Status por parte vive na filha (e na janela); a função interna só mexe em linhas do próprio dono.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-dividir-um-lancamento.md`
  summary: Conferir no iPad se o VoiceOver lê com sentido o cabeçalho da Divisão ("NOME, dividido, Valor") e as partes ("Parte de NOME, Valor, Responsável, Status").
  evidence: Low, não verificado. Junta-se à pendência do VoiceOver da 2.4; o jsdom só confere o `aria-label`.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-9-dar-apelido.md`
  summary: Fazer a próxima Fatura que trouxer um Nome já apelidado nascer com o Apelido (hoje só parcela herdada e previstos copiam); candidata: tabela `apelidos` por `normalizarNome`, aplicada pela `importar_fatura`, nunca em `regras`.
  evidence: Medium. Decisão Q3-A da 3.9: o critério de aceite não pede. Uma compra à vista recorrente (ex.: assinatura) volta sem Apelido todo mês, e a 3.12 mantém o Apelido das linhas casadas e dos previstos, mas decidiu (13/11/2026) não criar a tabela `apelidos`: fica para uma história própria (3.13).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-9-dar-apelido.md`
  summary: Conferir no iPad o Apelido em massa de verdade (pergunta com a contagem, "Aplicar a todos", "Desfazer", dez/26 e outros Meses) e se o VoiceOver lê com sentido a grade com Apelido em negrito e Nome em cinza.
  evidence: Low, não verificado. Junta-se à pendência do VoiceOver da 2.4; o jsdom só confere o DOM e os nomes acessíveis.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-10-importar-o-historico-da-planilha.md`
  summary: Rodar no CI a migração `20261119120000_importar_planilha.sql`, `test/integracao/planilha.test.ts` e a comparação de `database.types.ts` com `supabase gen types`.
  evidence: Medium não verificado. Esta máquina não tem Docker: as RPCs `importar_aba_planilha` e `apagar_historico_do_mes` foram provadas só no Postgres em memória (pglite) com todas as migrações em ordem; RLS, Realtime e o formato exato dos tipos só o CI prova (as duas entradas em `database.types.ts` foram escritas à mão no formato do gerado).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-10-importar-o-historico-da-planilha.md`
  summary: Importar uma Fatura para um Mês que já tem histórico da planilha duplica o Mês (a RPC `importar_fatura` e a 3.11 só olham as linhas da Fatura).
  evidence: Low. Os Meses 01/2026 a 09/2026 não têm Fatura e Rafael não os importa pelo PDF; out/26 e nov/26 têm Fatura e a planilha só ensina Regras neles. Se um dia entrar Fatura num Mês de histórico, apagar o histórico do Mês antes ("Apagar histórico importado"). A 3.12 decidiu: a reimportação ignora as linhas `historico` e o aviso diz quantas há; a primeira importação de um Mês com histórico continua sem aviso.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-10-importar-o-historico-da-planilha.md`
  summary: Decidir se a 3.12 (reimportar mantendo a classificação) e a próxima Fatura devem usar o histórico: a herança da 3.7 lê a n−1 do Mês anterior, e a Série do histórico tem `nome_normalizado` diferente da Fatura (o `*` se perdeu na planilha), então a parcela da Fatura de dez/26 não herda do histórico de set/26.
  evidence: Medium não verificado em produção. Só as Regras da planilha casam com o Nome da Fatura (chave sem `*`); Série, previsto e herança usam `nome_normalizado`, que difere. Quando Rafael reimportar out/26 ou nov/26, as Regras classificam, mas a herança de parcela não vem do histórico.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-10-importar-o-historico-da-planilha.md`
  summary: Conferir no iPad o Importar planilha de verdade (arquivo `.xlsx` do Google Sheets, prévia, progresso, resumo, Regras "criadas agora", hero e grade de um Mês de histórico, "Apagar histórico importado") e se o VoiceOver lê com sentido a lista de abas e as barras de progresso.
  evidence: Medium não verificado em produção. O jsdom só confere o DOM; a biblioteca de `.xlsx` só foi provada com um arquivo montado no teste, não com o que o Google Sheets exporta. Junta-se à pendência do VoiceOver da 2.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-10-importar-o-historico-da-planilha.md`
  summary: Os Ajustes de centavos da planilha ("MSC CRUZEIROS (CREDITO) (0,08)") entram como créditos soltos, sem `ajuste_de_id`, e o Tipo "Rafael"/"Casal" de algumas linhas de crédito vira Tipo novo.
  evidence: Low. A planilha não liga o crédito à parcela e usa o nome de pessoa no Tipo de alguns créditos; Rafael corrige em Tipos e na grade.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-12-reimportar-mantendo-a-classificacao.md`
  summary: Rodar no CI a migração `20261120120000_reimportar_mantendo.sql`, `test/integracao/reimportacao.test.ts` e a comparação de `database.types.ts` com `supabase gen types`.
  evidence: Medium não verificado. Esta máquina não tem Docker: a RPC `importar_fatura` de 8 argumentos foi provada só no Postgres em memória (pglite) com todas as migrações em ordem, direto e com o núcleo (`reimportacao.ts`) montando o plano; RLS, Realtime e o formato exato dos tipos só o CI prova (o valor do enum e o argumento `dados_reimportacao` foram escritos à mão no formato do gerado).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-12-reimportar-mantendo-a-classificacao.md`
  summary: Conferir a reimportação de verdade no iPad (nov/26 e out/26 com a mesma Fatura: mesmos ids, Apelidos e Ajustes mantidos; aviso com os números do plano; linha mexida que sai da Fatura e aparece como "Sumiu na reimportação" no Revisar com "Excluir" e "Manter"; previsto casado que volta a "Não veio na fatura") e se o VoiceOver lê com sentido a variante nova.
  evidence: Medium não verificado em produção. Hoje nenhuma linha de out/26 e nov/26 é casada, e só nov/26 tem Apelido; o jsdom só confere o DOM e os nomes acessíveis. Junta-se à pendência do VoiceOver da 2.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-12-reimportar-mantendo-a-classificacao.md`
  summary: Reimportar um Mês que tem uma linha paga e depois EXCLUÍDA faz a RPC `importar_fatura` apagar a linha (`r_excluidas`) e falhar pela FK de `pagamento_itens`: a reimportação inteira volta atrás e a tela só diz "Não foi possível importar". A 6.1 já manda `referenciadas` (as antigas vivas sem par com Pagamento saem da Fatura); falta a trava de estrutura na RPC e o teste "reimportar outubro com Pagamentos" (6.9).
  evidence: Medium. Decisão 3 da 6.1. Nada se perde (a transação desfaz), mas a mensagem não explica; a 6.9 decide se a linha excluída com Pagamento é mantida (como `sumiu_na_reimportacao`) e o aviso.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-12-reimportar-mantendo-a-classificacao.md`
  summary: A reimportação casa as linhas pelo Nome (AD-6): um Nome que o Gemini leu diferente da primeira vez vira linha nova e a antiga sem trabalho à mão é apagada (a com trabalho sai da Fatura).
  evidence: Low. Decisão Q1-A da 3.12: não há 3ª passada por Valor, data e cartão. Se acontecer com frequência, a 3ª passada (mesmo Valor, data e cartão) entra no casamento antes de decidir o destino das sem par.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-12-reimportar-mantendo-a-classificacao.md`
  summary: A reimportação marca de novo como "Não veio na fatura" o previsto do Mês que Rafael já tinha mantido ("Manter"), e o Valor novo de uma casada não propaga aos previstos das parcelas seguintes.
  evidence: Low. O cálculo de `previstos_sem_par` olha só os previstos `sistema` sem Fatura do Mês, sem distinguir o já revisado; os previstos de casadas ficam intactos (decisão Q4-A), inclusive com o Valor antigo.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-12-reimportar-mantendo-a-classificacao.md`
  summary: A casada que volta a previsto mantém o Valor da Fatura (o previsto original não guardava o "antes") e a que sai da Fatura vira linha `manual` com Mês fixo; o "Manter" só limpa o motivo.
  evidence: Low. Decisões Q3-A da 3.12; Rafael corrige o Valor abrindo a linha se o previsto voltar errado.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-montar-um-bloco-com-fichas.md`
  summary: Rodar no CI e conferir a migração `20261121120000_blocos.sql` e `test/integracao/blocos.test.ts`, e a igualdade de `src/data/database.types.ts` (escrito à mão) com o gerado.
  evidence: Medium, não verificado. Sem Docker nem Supabase CLI neste computador, a tabela, a RPC `salvar_bloco`, o índice de `meu_bloco`, `referencias_cadastro()` e o ramo jsonb com `conta_uso` (que a 1.6 deixou sem prova até as Fórmulas) só rodam no job `supabase` do CI. O job também compara os tipos escritos à mão (`NonNullable<Json>` na Fórmula, `p_id?` com default) com `supabase gen types`.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-montar-um-bloco-com-fichas.md`
  summary: Conferir no iPad o Montador (toque de 44 pt nas fichas, a janela com o teclado numérico do "Número…", o VoiceOver lendo "Remover Casal" e o resultado ao vivo) e o contraste da ficha `formula-chip` nos dois modos.
  evidence: Low, não verificado. O jsdom só confere os rótulos e os estados; o layout da paleta em 834 pt e a rolagem da janela com muitas fichas não foram vistos num aparelho.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-montar-um-bloco-com-fichas.md`
  summary: `lerBlocos` deixa de fora, sem aviso, uma linha de `blocos` cuja Fórmula não passa no schema.
  evidence: Low. A Fórmula ilegível só existiria por edição direta do banco (a RPC grava o que o núcleo montou). O aviso de Responsável ou Tipo arquivado no Bloco foi feito na 4.2 (`arquivadosNaFormula`, "Cita Rangel (arquivado)").
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-blocos-no-painel.md`
  summary: Rodar no CI e conferir a migração `20261122120000_reordenar_blocos.sql`, o teste novo de `test/integracao/blocos.test.ts` (reordenar e excluir) e a igualdade da entrada `reordenar_blocos` de `src/data/database.types.ts` (escrita à mão) com `supabase gen types`.
  evidence: Medium, não verificado. Sem Docker nem Supabase CLI neste computador, a RPC só foi exercitada num Postgres em memória (pglite, fora do projeto) com uma tabela simplificada: ordem nova, lista parcial, id alheio e inexistente, duplicado, vazio e sem sessão. RLS, Realtime (o DELETE chegar ao outro aparelho) e o formato dos tipos só o job `supabase` do CI prova.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-blocos-no-painel.md`
  summary: Conferir no iPad o cartão dos Blocos: o valor em 3 colunas a 834 pt, o toque longo abrindo o menu, o arrasto pela alça (e se o toque na alça não rola a página), o tremor e o "reduzir movimento", e o VoiceOver lendo "Ações do Bloco {nome}", "Gerar mensagem do Bloco {nome}" (ativo desde a 4.7) e "Mover o Bloco {nome} para antes".
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes e o arrasto com retângulos simulados; a grade `auto-fill` de 10,5 rem e o contraste da legenda "inclui previstos" (`forecast-fg`) nos dois modos não foram vistos num aparelho.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-blocos-no-painel.md`
  summary: No passo "Blocos" do Primeiro uso, os valores aparecem zerados enquanto não há Lançamentos do Mês atual, e a janela do Montador cobre o passo (sem rascunho a avisar).
  evidence: Low. Rafael novo ainda não importou nada, então o resultado ao vivo mostra R$ 0,00; o texto do passo avisa. Se incomodar, o passo pode esperar a primeira Fatura (volta como passo opcional do Painel vazio).
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-filtrar-a-grade-pelo-bloco.md`
  summary: Conferir no iPad o cartão que filtra: o toque filtrando, o toque longo abrindo o ⋯ sem filtrar, o espaço da Fórmula ao lado dos botões ⋯ e 💬 em 3 colunas a 834 pt, a borda mais o contorno de 1 px nos dois modos, o anel de foco por teclado, a pílula "Bloco: Nome ✕" na barra em pé e deitado, e o VoiceOver lendo "Filtrar a grade pelo Bloco {nome}, {valor}" com o estado.
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes e as classes; o detector do toque longo foi simulado com temporizador falso; layout e VoiceOver não foram vistos num aparelho.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-filtrar-a-grade-pelo-bloco.md`
  summary: Com o Bloco filtrando e o painel lateral aberto num Ajuste que não entra no Bloco (Responsável ou Tipo diferente da mãe, só possível por edição fora do app), o Ajuste não aparece na grade; hoje só a mãe fica (opção A da 2.7 vale para a linha, não para o Ajuste recuado).
  evidence: Low. Decisão da 4.3: o total do rodapé tem de ser o valor do Bloco, e mostrar o Ajuste fora do filtro o somaria. Reabrir se esse dado aparecer de verdade.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-filtrar-a-grade-pelo-bloco.md`
  summary: Num Bloco sem valor (a Fórmula não calcula) o botão de filtro fica desativado e, em alguns navegadores, o toque longo no corpo do cartão não abre o ⋯ (só o botão ⋯).
  evidence: Low. Um botão desativado não recebe eventos de ponteiro; hoje só acontece com Fórmula que estoura os números seguros, que o Montador já recusa na maioria dos casos.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-selecionar-e-ver-o-total.md`
  summary: Conferir no iPad e no PC a barra de Seleção do Painel: a altura e o Toast acima dela, a barra deixando livre a coluna do painel lateral em lg e escondida abaixo de lg, o rodapé da grade sem ficar atrás dela, as caixas de 44 pt, o ⌘/Ctrl+A no navegador de verdade, e o VoiceOver anunciando "N selecionados · R$ total" desde a primeira marcação (a região fica no DOM, vazia, antes) e a cada toque.
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes e as classes; o anúncio de uma região que muda de vazia para cheia só se prova num leitor de tela. Junta-se à pendência do VoiceOver da 2.4 e da 3.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-selecionar-e-ver-o-total.md`
  summary: A barra de lote do Revisar (3.3) ainda tem a região `role="status"` dentro da barra, que nasce junto com ela; se o VoiceOver não anunciar a primeira marcação lá, aplicar o mesmo da 4.4 (região fixa e vazia no DOM, `regiaoPropria={false}`).
  evidence: Low. A base `BarraSelecao` já aceita as duas formas; só o Painel usa a região fixa.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-selecionar-e-ver-o-total.md`
  summary: Excluir em lote manda todos os ids (marcadas e Ajustes) num `UPDATE … IN (…)` pelo PostgREST; com centenas de ids a URL pode passar do limite de tamanho. Se acontecer, trocar por uma RPC (migração) ou gravar em blocos.
  evidence: Low, não testado acima de poucas linhas. Um Mês tem em média algumas dezenas de Lançamentos; "selecionar todos" e "Excluir" num Mês inteiro é o pior caso.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-selecionar-e-ver-o-total.md`
  summary: "Classificar em lote" não limpa a Observação (em branco é "não muda") e a parte de uma Divisão só recebe o Status; se Rafael sentir falta, acrescentar "Limpar observação" na janela e decidir se Tipo e Observação das partes devem seguir para a mãe.
  evidence: Low. Decisão da 4.4: o lote atribui, não apaga; Tipo e Observação das partes seguem a mãe (3.8), então gravá-los na parte divergiria dela.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-selecionar-e-ver-o-total.md`
  summary: Marcar linhas e depois digitar na busca (ou mudar um filtro) tira da Seleção as linhas que saem da grade, e elas não voltam ao limpar o filtro; se Rafael quiser juntar linhas de filtros diferentes numa mensagem só, a Seleção teria de sobreviver ao filtro (com a barra dizendo quantas estão escondidas).
  evidence: Low. Decisão da 4.4 (spec, "Filtro que muda com itens marcados"): "Excluir" e "Classificar em lote" nunca agem em linha invisível.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-5-configurar-o-modelo-da-mensagem.md`
  summary: Conferir no iPad e no PC a seção Modelo da mensagem e o passo "Mensagem" do Primeiro uso: formulário e prévia lado a lado (e empilhados em pé), as três caixas de 44 pt, o foco visível, o rodapé em várias linhas, o aviso "mudou em outro aparelho" com dois aparelhos, e o VoiceOver lendo o grupo "Campos da linha de detalhe", a legenda e a região "Prévia" (sem anúncio a cada tecla).
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes e as classes; layout, toque e leitor de tela só se provam num aparelho. Junta-se à pendência do VoiceOver da 2.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-6-gerar-a-mensagem-a-partir-da-selecao.md`
  summary: "Dívida programada ainda não vencida" é regra de exclusão da mensagem (EXPERIENCE.md) mas ainda não existe no app; quando o Épico 6 criar a Dívida programada, acrescentar o motivo de fora (e a frase do aviso) em `projetarMensagem`.
  evidence: Low. `MOTIVOS_DE_FORA` hoje tem pago, zero e previsto; o aviso e o tipo são fáceis de estender.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-6-gerar-a-mensagem-a-partir-da-selecao.md`
  summary: "Editar modelo" sai do Painel e a Seleção (estado local do Painel) se perde; se Rafael sentir falta, guardar a Seleção entre telas ou abrir o modelo numa janela sem sair do Painel.
  evidence: Low. A AC da história pede só que leve a Configurações → Modelo da mensagem.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-6-gerar-a-mensagem-a-partir-da-selecao.md`
  summary: O valor na mensagem leva o espaço inseparável (U+00A0) entre "R$" e o número, porque `formatarDinheiro` o usa para não quebrar linha na tela; conferir se o WhatsApp mostra e busca isso como esperado e, se incomodar, trocar por espaço comum só na mensagem (um `replaceAll` no núcleo, sem mexer em `formatarDinheiro`).
  evidence: Low, não verificado. Colar no WhatsApp do iPad e do Android é o único teste que vale.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-6-gerar-a-mensagem-a-partir-da-selecao.md`
  summary: Conferir no iPad e no PC a janela "Gerar mensagem": o quadro e os três botões a 375 e 834 pt, as áreas de 44 pt, o Toast "Copiado" acima da barra, `navigator.clipboard` no Safari e no PWA (permissão e contexto seguro), o foco abrindo no quadro, e o VoiceOver lendo o título, o aviso dos itens de fora e o quadro e anunciando "A mensagem mudou…" com dois aparelhos.
  evidence: Low, não verificado. O jsdom usa o stub da área de transferência do user-event e só confere o DOM, os nomes e o foco. Junta-se à pendência do VoiceOver da 2.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-7-gerar-a-mensagem-a-partir-de-um-bloco.md`
  summary: Conferir no iPad e no PC a janela do Bloco: o texto da forma 2 colado no WhatsApp (o recuo de 2 espaços dos itens e o "↳ Ajuste" aparecem como no quadro?), o 💬 agora ativo (44 pt, ao lado do ⋯), o item "Gerar mensagem" do menu, os avisos juntos na descrição da janela, e o VoiceOver lendo "Gerar mensagem do Bloco {nome}", a descrição e o aviso de mudança com dois aparelhos.
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes e o foco; o WhatsApp pode cortar o espaço do começo da linha, e só colar num aparelho prova. Junta-se à pendência da 4.6 e à do VoiceOver da 2.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-7-gerar-a-mensagem-a-partir-de-um-bloco.md`
  summary: Um item que a Fórmula usa em dois operandos ("Casal + Casa", um Lançamento do Casal e da Casa) aparece nos dois grupos e conta nos dois no total da mensagem, como no valor do Bloco no Painel e no passo a passo; a janela só avisa "N itens aparecem em mais de um grupo". Se Rafael preferir contar o item uma vez só, a Fórmula (e o valor do Painel, o passo a passo e o filtro por Bloco) é que precisa mudar, não só a mensagem.
  evidence: Low. Decisão da 4.7 (spec, "Item em mais de um operando"): a mensagem não pode divergir do valor do Bloco. Reabrir no Épico 6 se a cobrança mostrar o problema na prática.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-7-gerar-a-mensagem-a-partir-de-um-bloco.md`
  summary: Com dois ou mais grupos com × ou ÷, a soma das linhas dos grupos pode diferir R$ 0,01 do "Total" da mensagem, porque cada grupo arredonda o próprio valor e o total é uma conta só arredondada no fim (FR-54). Se Rafael estranhar, o texto pode mostrar o valor exato (R$ 2.819,675) no grupo ou uma nota de arredondamento.
  evidence: Low. O total é o do Bloco no Painel e o do passo a passo; o teste "dois grupos ímpares" em `gerar-mensagem-bloco.test.ts` documenta a diferença.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-7-gerar-a-mensagem-a-partir-de-um-bloco.md`
  summary: O Épico 4 fecha com a 4.7 (em `review`; `done` só depois do merge). Falta a retrospectiva: `epic-4-retrospective` segue `optional` em `sprint-status.yaml`.
  evidence: Low. Rodar `bmad-retrospective` depois de a 4.7 ser mesclada, se Rafael quiser; nada a bloqueia.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-cadastrar-uma-conta-manual.md`
  summary: Conta com Mês inicial dentro de Meses já importados da planilha (3.10) duplica as linhas que a planilha trouxe (`historico`).
  evidence: Low. O formulário só avisa "Os meses anteriores também recebem a conta". Não há detecção; se Rafael cadastrar a Silvia "desde Jan/26" depois de importar a planilha, ele precisa escolher um Mês depois do histórico.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-cadastrar-uma-conta-manual.md`
  summary: Uma Conta parcelada com o mesmo Nome, total, Valor e Mês de uma compra de cartão compartilha a Série dela (a chave do AD-8 é a mesma); a importação da Fatura recusaria com `fatura.previstos_sem_casamento`. Uma parcela de Conta também pode servir de candidata à herança da 3.7 se o Nome coincidir.
  evidence: Low. A Conta é "fora do cartão", então a coincidência não se espera. Se acontecer, mudar o Nome ou o Valor da Conta.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-cadastrar-uma-conta-manual.md`
  summary: O formulário só divide por valores ("Por valor"); não há "Por proporção" nem o seletor "Mensal ou Dívida programada" por parte do mockup.
  evidence: Low. A Dívida programada (`vencimento_combinado` por parte) é do Épico 6; a Divisão da Conta já é guardada em frações (`divisao.ts`), então a proporção cabe depois sem migração.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-cadastrar-uma-conta-manual.md`
  summary: Conferir no iPad o formulário: o seletor de Mês nativo (`type=month`), o teclado numérico nos campos de valor, a janela com o teclado aberto e muitas partes, o foco ao tocar em "Salvar" com erro e o VoiceOver lendo "Responsável da parte 2" e "Remover parte 2".
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes e as classes de 44 pt; o layout em 834 pt e o comportamento do teclado só um aparelho prova.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-lista-de-contas-manuais.md`
  summary: A lista não pagina: o gerenciador de `contas_manuais` lê a tabela inteira e o PostgREST corta em 1000 linhas.
  evidence: Low. São contas da casa, dezenas em toda a vida do app; a Conta é uma linha (as parcelas são Lançamentos, que têm escopo por Mês). Se um dia chegar perto, o gerenciador ganha paginação e a tela não muda.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-lista-de-contas-manuais.md`
  summary: A lista fica na ordem Ativas primeiro e por Nome (o mockup mostra a ordem de cadastro: Silvia, William, TVbox, Bombinhas), não ordena ao toque no cabeçalho e não mostra o "Total da conta" (R$ 1.908,00) nem os valores por parte das Contas sem Divisão.
  evidence: Low. Decisões 3 e 4 do spec da 5.2. `ordenarContas` é a única ordem; ordenar por coluna ou mostrar o total cabe depois sem mudar o repositório.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-lista-de-contas-manuais.md`
  summary: Conferir no iPad a lista de Contas: o layout em 834 pt em pé e deitado (as seis colunas sem rolagem lateral, as etiquetas quebrando para baixo, o Valor por mês com a legenda "por parcela"), o cabeçalho fixo ao rolar, o toque de 44 pt na linha e no ⋯, os filtros ao toque e o VoiceOver lendo "Ativas, 4 contas", "Ações de Bombinhas" e "Editar Já encerrada" (e se um item desativado do menu é alcançado pelo gesto de deslizar).
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes, os `role` e as classes de 44 pt; o layout, o `sticky` e o VoiceOver só um aparelho prova.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-alterar-encerrar-e-excluir-uma-conta-manual.md`
  summary: O Épico 5 fecha com a 5.4 (em `review`; `done` da história e do épico só depois do merge, em PR separada). Falta a retrospectiva: `epic-5-retrospective` segue `optional` em `sprint-status.yaml`.
  evidence: Low. Rodar `bmad-retrospective` depois de a 5.4 ser mesclada, se Rafael quiser; nada a bloqueia.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-contas-que-se-repetem-sozinhas-todo-dia.md`
  summary: Ver o Cron diário criar parcelas de verdade em produção: a migração da 5.3 e o `CRON_SECRET` já estão lá e o Cron já roda (200, `quantidade: 0`), mas nenhuma execução ainda precisou criar uma parcela. Na virada do Mês, conferir nos logs de Cron da Vercel um 200 com `quantidade` ≥ 1 e a parcela nova no Painel; no dia seguinte, `quantidade: 0`.
  evidence: Low, não verificado. Com as Contas de hoje o horizonte (Mês atual + 12) já está cheio, então `quantidade: 0` é o esperado até o Mês virar. A 5.4 também faz o Cron ler `excluido_em` e `updated_at`: depois do `db push` da 5.4, conferir que o Cron segue em 200. Lembrete antigo ainda aberto: trocar a `SUPABASE_SECRET_KEY` que apareceu numa conversa.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-contas-que-se-repetem-sozinhas-todo-dia.md`
  summary: O Cron não tem aviso de falha: o 500 só aparece nos logs de Cron da Vercel, que não tenta de novo, e a leitura de `contas_manuais` não é paginada (o PostgREST corta em 1000 linhas).
  evidence: Low. Um dia perdido não faz falta (o horizonte é 12 meses e o dia seguinte refaz), e são dezenas de Contas, não milhares. Quando o FR-55 (lembretes e Web Push) chegar, a falha do cron pode virar uma notificação para Rafael. Se as Contas chegarem perto de 1000, paginar a leitura (a decisão 4 da spec já isola cada Conta).
- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-contas-que-se-repetem-sozinhas-todo-dia.md`
  summary: FR-55 (lembretes, atraso e Web Push): a rota `GET /api/cron/diario` tem o ponto de extensão (comentário em `route.ts`, depois da materialização), sem lógica, tabelas (`push_inscricoes`, `lembretes_enviados`) nem variáveis VAPID.
  evidence: Low. A história própria deve colocar o envio depois do `await materializarContasDoDia(...)`, de modo que a falha dele nunca desfaça o que a materialização gravou, e decidir o que fazer com o status HTTP quando só o envio falhar.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-3-contas-que-se-repetem-sozinhas-todo-dia.md`
  summary: `quantidade` do cron conta linhas criadas (mães e filhas); a tela da 5.1 conta só as mães.
  evidence: Low. Decisão 5 da spec: o número é para quem monitora o Cron, não para Rafael. Mudar para só mães é uma linha em `contarLinhas` (`src/server/materializar-contas.ts`) e nos testes.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-alterar-encerrar-e-excluir-uma-conta-manual.md`
  summary: Aplicar em produção a migração `20261126120000_alterar_encerrar_excluir_conta.sql` (`supabase db push`, só quando Rafael pedir) e depois conferir que a tela Contas carrega, que o Cron segue em 200 e que Editar, Encerrar, Excluir e Desfazer funcionam com as Contas reais.
  evidence: Medium, não verificado em produção. O job `supabase` do CI da PR 85 passou (migração, `contas-alterar.test.ts`, RLS, Realtime e a igualdade de `database.types.ts` com o gerado). Até o `db push`, a lista de Contas (filtra `excluido_em`) mostra "Não foi possível carregar" e o Cron das 09:00 responde 500 (o dia seguinte refaz); o Painel não depende da coluna.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-alterar-encerrar-e-excluir-uma-conta-manual.md`
  summary: Conferir no iPad Editar, Encerrar e Excluir de verdade: o aviso "Ficam como estão" com paga e editada à mão, o "Começa em" travado, o seletor de Mês do Encerrar e a prévia, a janela de Excluir com o foco abrindo em "Cancelar", "Conta … excluída" com o "Desfazer" (e a Conta voltando à lista), e o VoiceOver lendo "Editar Já encerrada", "Conferindo os lançamentos…" e as duas janelas.
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes, os `role` e o foco; layout, toque e leitor de tela só um aparelho prova. Junta-se à pendência do VoiceOver da 2.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-alterar-encerrar-e-excluir-uma-conta-manual.md`
  summary: Duas transações realmente concorrentes (o cron e uma alteração, ou duas alterações) não são testadas: a corrida é tratada por `for update`/`for share` na linha da Conta, pelo filtro de Conta excluída e pela versão da Conta por parcela (`conta_atualizada_em`), e o CI prova o resultado de cada camada em sequência.
  evidence: Low. O Vitest do CI é sequencial; a trava é a semântica documentada do Postgres. Se um dia houver mais de um usuário ou um cron mais frequente, vale um teste com duas conexões.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-alterar-encerrar-e-excluir-uma-conta-manual.md`
  summary: O cron (e `materializar_contas_manuais`) recria uma parcela de Conta que Rafael excluiu à mão no Painel (o índice único `(serie_id, parcela_n)` só olha as não excluídas), então a parcela volta no dia seguinte. O Editar e o Encerrar também preenchem esse buraco do Mês atual em diante.
  evidence: Medium. Já era assim desde a 5.1 (o teste "uma parcela excluída em lógico deixa o n livre"); a 5.4 não mexe na materialização diária além do filtro de Conta excluída. Para respeitar a exclusão manual, o materializador teria de olhar também as parcelas excluídas da Série (ou um campo "pulada"), e isso muda o Desfazer e o cron.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-alterar-encerrar-e-excluir-uma-conta-manual.md`
  summary: Não há "Reabrir" de uma Conta que já terminou (parcelada que acabou, ou encerrada num Mês que já passou), nem mudar o "Começa em" de uma Conta salva; para isso, exclua e cadastre outra.
  evidence: Low. Decisões 7 e 8 da 5.4: `parcela_n` conta desde o Mês inicial e os Meses anteriores não mudam, então o Mês inicial é travado ao editar; "Já encerrada" desativa Editar e Encerrar. Se Rafael sentir falta, "Reabrir" é um `alterar_conta_manual` com `encerrada_em_mes` nulo e as parcelas novas.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-4-alterar-encerrar-e-excluir-uma-conta-manual.md`
  summary: Uma Conta excluída segue citando seu Tipo e Responsáveis: `referencias_cadastro()` e `substituir_cadastro` a contam de propósito (a FK vale), então excluir um Tipo que só uma Conta excluída usa pede um substituto, e a contagem de "registros" de Configurações a inclui. A Série e as parcelas dela também ficam no banco para sempre.
  evidence: Low. Decisões 1 e 2 da 5.4. Se incomodar, uma limpeza (apagar a Conta excluída, a Série e as parcelas depois de N dias) é uma história própria; o Desfazer só vale enquanto o aviso está na tela.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-marcar-como-pago.md`
  summary: Conferir em produção, com dados reais, "Aplicar status" com Pagamento, o aviso com "Desfazer", o selo em dois aparelhos e que Editar/Encerrar/Excluir uma Conta ainda mantêm a parcela paga. A migração `20261127120000_pagamentos.sql` já está aplicada (`supabase db push`, depois do merge da PR 87).
  evidence: Medium, não verificado em produção. O `migration list --linked` mostra a migração local e remota; nenhum dado de produção foi lido nem alterado.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-marcar-como-pago.md`
  summary: O que só o CI prova na 6.1: a migração em Postgres de verdade (RLS, `grant`, gatilho, `on conflict` concorrente da RPC), `test/integracao/pagamentos.test.ts` (inclui o Realtime do selo e dos itens) e a igualdade de `database.types.ts` com o gerado (as duas tabelas e as três funções foram escritas à mão no formato do gerador).
  evidence: Medium não verificado. Esta máquina não tem Docker: o SQL foi provado só no pglite (15 cenários, com o núcleo real); a corrida de dois aparelhos pagando a mesma linha ao mesmo tempo é uma semântica documentada do Postgres (`for update` + `updated_at`), não um teste com duas conexões.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-marcar-como-pago.md`
  summary: Conferir no iPad a janela "Aplicar status" (a lista de Status em linha, os 44 pt, a data nativa com o teclado, o foco, o VoiceOver lendo "Status a aplicar", o erro do campo e "Conferindo…") e o botão desativado sem conexão.
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes, os `role` e as classes; layout, toque e leitor de tela só um aparelho prova. Junta-se à pendência do VoiceOver da 2.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-marcar-como-pago.md`
  summary: Desmarcar "conta como pago" num Status em uso deixa as linhas com Pagamento "não pagas" com `restante = valor − Σ itens` (0 nas pagas por inteiro) e o gatilho passa a recusar mudanças para esse Status; não há aviso nem tratamento.
  evidence: Low. Decisão 18 da 6.1. Se acontecer, o Pagamento se desfaz pelo histórico (6.3); um aviso em Configurações → Status ("N lançamentos pagos usam este Status") é uma melhoria barata.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-marcar-como-pago.md`
  summary: A contagem "N registros" de um Status em Configurações soma os itens de Pagamento (`status_aplicado_id` conta uso): uma linha paga conta duas vezes (a linha e o item).
  evidence: Low. Decisão 21 da 6.1; excluir um Status que quitou Pagamentos pede substituto, e a troca chega aos itens (provado no pglite). Se incomodar, contar só as linhas distintas.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-1-marcar-como-pago.md`
  summary: Depois de aplicar um Pagamento a Seleção continua marcada (como em "Classificar em lote"), e as linhas já pagas aparecem como "já pagas" na janela se Rafael tentar de novo; não há "Limpar a Seleção ao terminar".
  evidence: Low. Decisão 20 da 6.1; basta tocar em "Limpar".
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-pagamento-parcial-e-a-minha-parte.md`
  summary: O que só o CI prova na 6.2: a migração `20261128120000_pagamento_parcial.sql` em Postgres de verdade (a coluna `status_aplicado_id` anulável, o gatilho novo, `aplicar_pagamento` com os três modos e `desfazer_pagamento`), `test/integracao/pagamentos.test.ts` (inclui o item parcial, o gatilho e o Realtime da linha parcial), a igualdade de `database.types.ts` com o gerado (só `status_aplicado_id` muda) e o backup com o item parcial em `test/backup/dados-exemplo.sql`.
  evidence: Medium não verificado. Sem Docker: o SQL foi provado no pglite (todas as migrações em ordem, o núcleo real por `jiti`, 13 cenários e 16 recusas). Não provam RLS por papel, `grant` de verdade, Realtime nem PostgREST. A migração NÃO foi aplicada: depois do merge, `supabase db push` a pedido de Rafael.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-pagamento-parcial-e-a-minha-parte.md`
  summary: Conferir no iPad e no PC a pergunta "O que fazer com a diferença de R$ X?": os dois cartões de mesma altura lado a lado e empilhados, o rádio de 18 px, o valor sem quebra de linha, o foco ao aparecer a pergunta (ela não rouba o foco do campo do valor), o VoiceOver lendo o grupo e as opções, e o selo "Pago parcialmente" e o "falta R$ X" na grade e no painel.
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes, os `role` e as classes. Junta-se à pendência do VoiceOver da 2.4 e à da janela "Aplicar status" da 6.1.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-pagamento-parcial-e-a-minha-parte.md`
  summary: Conferir em produção, depois do `db push`, com dados reais, "Fica pendente" e "Não é dívida, é a minha parte", o selo em dois aparelhos, a mensagem do Bloco com um Pago parcialmente e o "Desfazer" de cada modo. Entre o merge e o `db push` só o modo `total` grava (a RPC antiga recusa `parcial` e `minha_parte`).
  evidence: Medium, não verificado em produção. Nenhum dado de produção foi lido nem alterado.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-pagamento-parcial-e-a-minha-parte.md`
  summary: No modo `minha_parte` os itens guardam o restante inteiro de cada linha e o valor realmente recebido fica só em `pagamentos.valor_recebido_centavos`; Σ itens − valor recebido é "a minha parte". O Histórico (6.3) já mostra o valor recebido na lista e "A minha parte" no detalhe; a 6.5 ("Recebido no mês") tem de somar o valor do Pagamento, não os itens, para saber o que entrou.
  evidence: Low. Decisão 2 da 6.2: o AD-10 diz "soma dos itens = valor recebido", mas isso só vale para `total` e `parcial`; em `minha_parte` nenhum item pode ser zero (o `check` proíbe) e desfazer precisa de um item por linha para devolver o Status.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-pagamento-parcial-e-a-minha-parte.md`
  summary: O valor do Bloco no cartão do Painel (e o `resumirBloco`) ainda soma o valor cheio de um Pago parcialmente; só a mensagem de cobrança usa o restante. O "Falta receber" do Bloco, `projetarPendente` e a barra de Recebimentos (6.5) são quem passa a usar `restante` nas telas de Recebimentos.
  evidence: Low. Escopo da 6.2 (a mensagem, a forma 3 e a prévia); `pagosCentavos` do aviso do Bloco já soma a parte recebida.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-pagamento-parcial-e-a-minha-parte.md`
  summary: Um Ajuste de centavos negativo (crédito de centavos) de uma parcela comum não é crédito na alocação: acompanha a parcela e, num "Fica pendente" cujo valor acaba na parcela, fica em aberto (restante negativo de poucos centavos) em vez de ser quitado antes.
  evidence: Low. Decisão 4 da 6.2; o total do Pagamento (valor = total) continua quitando os dois. Se incomodar, o Ajuste negativo pode entrar sempre junto da parcela quando ela leva qualquer valor.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-2-pagamento-parcial-e-a-minha-parte.md`
  summary: Um item parcial vivo numa linha que Rafael depois marcou como paga à mão (sem Pagamento que feche o valor) fica no banco: a linha é "paga" pelo Status e o item só some ao desfazer o Pagamento parcial, o que agora se faz pelo Histórico (6.3; a confirmação diz "só recebeu parte do valor: o status não muda"). Tirar o "pago" dessa linha à mão é permitido (o item parcial não aplicou Status), e a linha volta a ser Pago parcialmente.
  evidence: Low. Decisão 1 da 6.2 (o gatilho olha só o "pago" que veio de um Pagamento).
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-historico-e-desfazer-pagamentos.md`
  summary: O Responsável de um Pagamento é derivado das linhas dos itens ("Casal e Rangel · minha parte"), não "quem pagou" como no Flow 3 do EXPERIENCE ("Rangel · R$ 2.819,68 · minha parte"). Gravar quem pagou (o Responsável ou o Bloco de cobrança) pede a janela "Aplicar status" perguntar, `aplicar_pagamento` receber e conferir o campo e uma migração; os Pagamentos já gravados ficariam sem o dado.
  evidence: Low. Decisão 1 da 6.3. A 6.5 (cartões por Bloco) é quem melhor sabe de que Bloco veio o dinheiro: pode gravar o Bloco no Pagamento e o Histórico passar a mostrá-lo.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-historico-e-desfazer-pagamentos.md`
  summary: O Histórico lê de quem são as linhas dos itens (`responsavel_id`) uma vez por linha: se o Responsável de uma linha paga mudar em outro aparelho, a lista só mostra o novo ao reabrir a tela. O detalhe sem conexão não carrega os nomes (as linhas são lidas ao abrir).
  evidence: Low. Decisões 2 e 8 da 6.3. Resolve-se com um gerenciador (ou escopo) de `lancamentos` pelos ids dos itens, ou guardando o Responsável no item no momento do Pagamento.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-historico-e-desfazer-pagamentos.md`
  summary: O Pagamento desfeito não aparece na tela (continua no banco, AD-16): não há "Mostrar desfeitos" nem trilha de quem desfez e quando.
  evidence: Low. Decisão 3 da 6.3. Seria um filtro sobre o mesmo gerenciador sem o escopo de vivos (e os itens com `excluido_em`), se Rafael quiser auditar.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-historico-e-desfazer-pagamentos.md`
  summary: A lista do Histórico desenha todos os Pagamentos de uma vez (a leitura é paginada, a tela não): com algumas centenas de linhas, virtualizar ou agrupar por Mês é a saída.
  evidence: Low. Decisão 7 da 6.3. Um Pagamento por semana são ~50 por ano; as linhas são botões leves.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-historico-e-desfazer-pagamentos.md`
  summary: Um UPDATE antigo (fora de ordem) de um Pagamento que o gerenciador de vivos já tirou da memória o traz de volta até a tela ser recarregada: o escopo por predicado não guarda o que saiu. Vale também para as Contas manuais e a fila do Revisar.
  evidence: Low. `src/data/realtime-historico.test.ts` não cobre o caso de propósito (o Realtime entrega em ordem de commit). O `desfazer` de um Pagamento assim responde "já foi desfeito" e a memória se corrige.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-historico-e-desfazer-pagamentos.md`
  summary: Desfazer o Pagamento mais antigo antes do mais novo, quando o mais novo tocou a mesma linha com outro Status, deixa a linha como está; depois, desfazer o mais novo devolve o Status que ele guardou (o "pago" de antes), que já não tem Pagamento por trás. É o que o AD-10 manda; a confirmação avisa "desfaça esse pagamento primeiro se quiser voltar o status".
  evidence: Low. Decisão 6 da 6.3. O app não cria esse caso hoje (a projeção e a RPC recusam linha já paga); só um Status que deixa de contar como pago (pendência da 6.1) ou a 6.9 poderiam criá-lo.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-historico-e-desfazer-pagamentos.md`
  summary: O que só o CI prova na 6.3: `test/integracao/pagamentos.test.ts` (os cenários "fora de ordem" no banco de verdade, a leitura `order id` + `range` pelo PostgREST, o `in` de `lancamentos` com `id, responsavel_id, ajuste_de_id` e o Realtime de `pagamentos`). Sem migração nesta história.
  evidence: Medium não verificado. Sem Docker: os mesmos cenários rodaram no pglite com todas as migrações e o núcleo real (E1 a E6); isso não prova RLS por papel, PostgREST nem Realtime.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-3-historico-e-desfazer-pagamentos.md`
  summary: Conferir no iPad o Histórico: as linhas de 44 pt, o filtro por Responsável, o detalhe e a confirmação empilhados, o foco (abre em "Cancelar" e, depois de desfazer, vai para o título da seção), o VoiceOver lendo a linha ("12/10/26, Casal e Rangel, minha parte · 3 lançamentos…") e o botão desativado sem conexão.
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes, os `role` e as classes; layout, toque e leitor de tela só um aparelho prova. Junta-se às pendências do VoiceOver da 2.4, da 6.1 e da 6.2.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-4-atrasado.md`
  summary: O EXPERIENCE.md ("O Lucas tem R$ 115,16 em atraso desde 16/11/26", faixa e aviso de lembrete) e a História 7.4 dizem que o atraso começa em 16/11/26 para vencimento 06/11 e tolerância 10; a regra decidida na 6.4 (e a UJ-2 do PRD) é 17/11/26: vencimento + tolerância ainda está em dia, vencimento + tolerância + 1 já é atraso. Alinhar os dois textos quando o lembrete (Épico 7) for feito, e usar `primeiroDiaDeAtraso` do núcleo na data do aviso.
  evidence: Low. Decisão 1 da 6.4 (fecha o ponto 2 do `implementation-readiness.md`). Só texto: o código já segue a regra.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-4-atrasado.md`
  summary: `vencimentoDoMes` (`ciclo.ts`) só conhece o Ciclo, embora o AD-9 o defina como "o vencimento da Fatura ou, se ela não existe, o do Ciclo". A 6.4 não o mudou: `vencimentoDoLancamento` (`atraso.ts`) aplica a ordem vencimento combinado → `faturas.vencimento` → Ciclo. Se outra história precisar do vencimento de um Mês, usar `vencimentoDoLancamento`, ou mover a Fatura para dentro de `vencimentoDoMes`.
  evidence: Low. Decisão 3 da 6.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-4-atrasado.md`
  summary: Ao ligar o campo `vencimento_combinado` (6.6), passá-lo nas linhas que chegam a `atrasosDasLinhas` (a função já o lê, com testes com e sem o campo) e tirar da mensagem as Dívidas programadas ainda não vencidas. A 6.5 (cartões por Bloco, de todos os Meses) usa `atrasosDasLinhas` com `vencimentosDasFaturas` de todos os Meses e os itens de Pagamento de todos os Meses (`gerenciadorItensDoHistorico`), não só os do Mês aberto.
  evidence: Low. Decisões 11 e 13 da 6.4; a tela de hoje só calcula o Mês aberto.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-4-atrasado.md`
  summary: Os Meses importados da planilha (3.10) entram na regra: uma linha `historico` sem Status que conta como pago, de um Mês que já passou, aparece como Atrasado (a importação só marca como pago o nome "Pago"). Pode haver muitas linhas em vermelho no primeiro uso real; conferir com os Meses importados e, se incomodar, marcar o histórico como pago na importação ou excluí-lo do atraso.
  evidence: Medium, não verificado com dados reais (nenhum dado de produção foi lido). Decisão 14 da 6.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-4-atrasado.md`
  summary: Crédito, estorno e valor zero nunca ficam Atrasado (não há o que cobrar), decisão da 6.4 além da lista do pedido; a ordenação da coluna Status segue o nome do Status gravado (não o selo "Atrasado"); e um Status cadastrado chamado "Atrasado" aparece como duas linhas de mesmo nome no popover do filtro.
  evidence: Low. Decisões 5 e 8 da 6.4. Se Rafael quiser créditos em atraso, ou ordenar por atraso, é uma mudança pequena no núcleo (`podeAtrasar`) e em `ordenarGrade`.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-4-atrasado.md`
  summary: O "hoje" da tela (`useHoje`) relê o relógio a cada minuto e ao voltar o foco; a virada do dia só aparece em até 1 minuto, e o Mês que abre (`mesAtual`, `useState` do Painel) não acompanha a virada do mês com a tela aberta. O Pagamento usa o próprio "hoje" de quando a janela abre.
  evidence: Low. Decisão 6 da 6.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-6-4-atrasado.md`
  summary: Conferir no iPad o selo "Atrasado" na grade (cor `status-late` no claro e no escuro, o selo duplo "Pago parcialmente" + "Atrasado" na coluna Status, a largura da coluna), o VoiceOver lendo "atrasado desde 17/11/26" na linha, o filtro de Status com "Atrasado" e a virada da meia-noite com o app aberto.
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes, os `role` e as classes. Junta-se às pendências do VoiceOver da 2.4, da 6.1, da 6.2 e da 6.3.
