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
- source_spec: `_bmad-output/implementation-artifacts/spec-3-11-reimportar-um-mes.md`
  summary: Antes de a 3.5 (Séries) ou o Épico 6 (Pagamentos) irem para produção, trocar a reimportação simplificada pela Story 3.12 ou fazer a RPC recusar com código próprio quando as linhas da Fatura tiverem Série ou Pagamento.
  evidence: Low hoje. A 3.11 simplificada apaga todas as linhas da Fatura; uma FK nova sem cascata faz a RPC falhar com erro genérico (nada é apagado, a transação desfaz), e uma com cascata apagaria Séries ou Pagamentos. Só a nota no `epics.md` (Story 3.12) lembra disso.
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
  summary: Antes da 3.6 (casamento) ou do Épico 6 (Pagamentos) irem para produção, trocar a reimportação simplificada pela Story 3.12 ou fazer a RPC recusar com código próprio quando uma linha da Fatura for previsto casado ou tiver Pagamento.
  evidence: Medium. Com a 3.5 só, a reimportação simplificada é segura (decisão 3-A: apaga as linhas da Fatura e os previstos `sistema` não editados que ela criou, religa os demais, a Série sobrevive e `origem_lancamento_id` é `set null`), porque ainda não existe previsto casado (a linha vira real e ganha `fatura_id`) nem Pagamento. A partir da 3.6 a apagação destruiria o `id` e a classificação dos casados. Substitui, para a 3.5, a pendência de mesmo teor da 3.11.
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
  evidence: Low. O "Total a pagar", a Conferência e o "verificar" filtram por `fatura_id` e ignoram os previstos; a barra por Responsável e a contagem da grade usam todas as linhas do Mês aberto (`linhasDoMes`).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-5-series-e-parcelas-previstas.md`
  summary: Conferir no iPad se o VoiceOver lê "Nome, previsto, Valor, Parcela, Responsável, Status" na linha de um previsto.
  evidence: Low, não verificado. Junta-se à pendência do VoiceOver da 2.4; o jsdom só confere o `aria-label`.
