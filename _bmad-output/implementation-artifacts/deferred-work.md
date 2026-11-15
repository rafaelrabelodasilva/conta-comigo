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
  summary: Dar ao Pagamento (Épico 6) uma trava na RPC `dividir_lancamento`/`recriar_filhas` quando uma filha que seria excluída em lógico (redividir, Desfazer divisão) já tem Pagamento.
  evidence: Maybe-false/medium. A filha mantém o `id` pela posição, mas a que sobra é excluída; sem Pagamentos hoje não há o que proteger.
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
  summary: Dar ao Pagamento (Épico 6) o conjunto `referenciadas` da reimportação: `lerReimportacao` hoje manda `referenciadas: []`; com `pagamento_itens`, as linhas com Pagamento passam a sair da Fatura com `sumiu_na_reimportacao` em vez de ser apagadas, e a RPC ganha a trava de estrutura equivalente.
  evidence: Medium. A 3.12 só deixou o ponto de extensão no núcleo (`planejarReimportacao`, opção `referenciadas`) e na leitura do repositório; sem Pagamentos não há o que proteger, e o teste de reimportação com Pagamento é do Épico 6.
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
  summary: Aplicar a migração `20261122120000_reordenar_blocos.sql` em produção (`npx.cmd supabase db push --linked`, antes um `--dry-run`) só depois do merge e com a confirmação do Rafael.
  evidence: Medium. Antes disso o Painel já mostra os valores, edita, exclui e vê o cálculo (nada disso precisa da migração), mas "Reordenar" falha ao gravar (a RPC não existe) e o cartão volta à ordem de antes com o aviso "Não foi possível salvar".
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-blocos-no-painel.md`
  summary: Conferir no iPad o cartão dos Blocos: o valor em 3 colunas a 834 pt, o toque longo abrindo o menu, o arrasto pela alça (e se o toque na alça não rola a página), o tremor e o "reduzir movimento", e o VoiceOver lendo "Ações do Bloco {nome}", "Gerar mensagem do Bloco {nome}" (desativado) e "Mover o Bloco {nome} para antes".
  evidence: Low, não verificado. O jsdom só confere o DOM, os nomes e o arrasto com retângulos simulados; a grade `auto-fill` de 10,5 rem e o contraste da legenda "inclui previstos" (`forecast-fg`) nos dois modos não foram vistos num aparelho.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-blocos-no-painel.md`
  summary: Ligar o 💬 do `block-card` (hoje desativado) à janela Gerar mensagem quando a 4.7 chegar, e pôr "Gerar mensagem" no menu ⋯ junto com ele.
  evidence: Low. A 4.2 só deixa o botão com o nome acessível "Gerar mensagem do Bloco {nome}"; o EXPERIENCE.md pede "Gerar mensagem" também no ⋯, que a AC da 4.2 não lista.
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
