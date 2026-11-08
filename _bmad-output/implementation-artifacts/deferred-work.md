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
  summary: Na primeira história com referência jsonb (Fórmulas, Regras, Divisões), testar no banco a troca em jsonb de `substituir_cadastro` e a contagem jsonb de `contar_usos_cadastro`; e testar o reabrir da janela de substituto quando a RPC recusar por uso.
  evidence: A 2.3 fechou os ramos "em uso" por coluna (Responsável, Tipo e Status de `lancamentos`, em `test/integracao/substituir-cadastro.test.ts`); `REFERENCIAS_JSONB` continua vazia, então o SQL dinâmico da forma jsonb ainda não rodou.
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
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-importar-a-fatura-do-mes.md`
  summary: Testar o ramo `unique_violation` de `importar_fatura` (duas importações do mesmo Mês ao mesmo tempo devolvem `fatura.mes_ja_importado`).
  evidence: Low, não verificado: a trava `pg_advisory_xact_lock` já serializa as importações do mesmo dono e Mês, mas um erro no nome da restrição em `sqlerrm like '%faturas_owner_id_mes_key%'` passaria no CI; falta um teste de integração com duas chamadas em paralelo.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-painel-do-mes-com-a-grade-de-lancamentos.md`
  summary: Confirmar no Safari do iPad que o VoiceOver lê a linha da grade como "Nome, Valor, Parcela, Responsável, Status" (e, nas linhas marcadas, "verificar este lançamento" no fim), tanto pelo `aria-label` do `<tr>` quanto célula a célula.
  evidence: Medium, não verificado. Atualizado na 2.5 (`spec-2-5-conferencia-e-marca-verificar.md`): além do `aria-label` no `<tr>`, a célula do Nome agora leva um resumo oculto (`sr-only`) com a mesma frase, e o Nome visível (com a bolinha) é `aria-hidden`. O jsdom só confere o DOM; falta a conferência manual no iPad (Rafael nunca usou o VoiceOver, decisão de 08/11/2026), que fecha esta pendência. A decidir nessa conferência: o resumo oculto repete a linha inteira, então quem ouve célula a célula escuta Valor, Parcela, Responsável e Status duas vezes (no resumo e nas próprias células); se incomodar, o resumo pode ficar só com o Nome e "verificar este lançamento".
