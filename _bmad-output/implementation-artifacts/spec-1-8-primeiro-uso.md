---
title: 'História 1.8: Primeiro uso'
type: 'feature'
created: '2026-11-02'
status: 'done'
baseline_commit: 'c8ff4d29a689a251f1dac3fed9f9ad251752fbc7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-configurar-o-ciclo-do-cartao-e-a-aparencia.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Na primeira vez que entra, Rafael cai num Painel "em breve" e precisa achar sozinho onde cadastrar Responsáveis, Tipos, Status e o Ciclo. Além disso, nenhuma tela tem teste de componente: um erro de ligação na seção do Ciclo grava em `config_ciclo` uma linha que só pode ser superada.

**Approach:** Tela cheia `/primeiro-uso` com os passos Responsáveis → Tipos → Status → Ciclo, cada um mostrando a seção de Configurações já existente, com "Pular" e "Continuar". Ela abre sozinha só enquanto o Primeiro uso não foi concluído nem pulado e os três cadastros estão vazios; a marca fica em `configuracoes.primeiro_uso_em`. Configurações ganha "Retomar o Primeiro uso". Também entra o ambiente de teste com DOM no Vitest e os testes de componente das seções da 1.7 e do passo a passo.

## Boundaries & Constraints

**Always:**
- Nada é pré-cadastrado. Cada passo reaproveita sem copiar `SecaoResponsaveis`, `SecaoTipos`, `SecaoStatus` e `SecaoCiclo`.
- Cabeçalho do passo no estilo do mockup `primeiro-uso.html`: "Passo N de 4 · <Seção>", uma pergunta, uma frase de ajuda e "Próximos passos: …". Botões "Pular" (secundário) e "Continuar" (primário); no último passo "Continuar" vira "Concluir". Pular e Continuar só avançam; nenhum dos dois grava nada além do que a seção já grava.
- Decisão (Rafael, revisão 1): se o passo tem algo digitado e não salvo (rascunho de um nome novo, de renomear ou dos dias do Ciclo) e Rafael clica em Continuar, Pular ou Concluir, abre a janela "Você digitou algo que não foi salvo." com "Voltar para salvar" (fecha e fica no passo) e "Descartar" (avança sem gravar). As seções avisam o rascunho por uma prop opcional; fora do Primeiro uso nada muda.
- A ordem e a lista dos passos ficam numa constante única. Os passos de épicos futuros (Importar planilha, Blocos, Mensagem) entram nela depois, na posição do EXPERIENCE.md.
- Concluir, ou "Pular" no último passo, grava `configuracoes.primeiro_uso_em = now()` (upsert em `owner_id`) e vai para o Painel. Se a gravação falhar: toast `salvar.falhou` e continua no passo.
- Abrir sozinho: o Painel redireciona para `/primeiro-uso` quando `primeiro_uso_em` é nulo (ou falta a linha) e não há nenhum Responsável, Tipo nem Status (incluindo os arquivados). A regra é uma função pura do núcleo.
- `/primeiro-uso` sempre abre quando é visitado diretamente (é assim que se retoma) e confere a sessão como as outras páginas. Não tem o menu lateral, mas tem toast e Aparência. Abaixo de 700 px mostra o aviso de tela pequena.
- "Retomar o Primeiro uso" fica na lista de seções de Configurações, acima de "Sair", e leva ao passo 1 sem mexer em `primeiro_uso_em`.
- O Painel vazio mostra "Importe sua primeira fatura".
- Testes com DOM: jsdom e Testing Library só nos arquivos de componente (`// @vitest-environment jsdom`). O ambiente padrão continua `node`, e o núcleo continua sem DOM.

**Never:**
- Os testes de componente adiados da 1.3 e da 1.4 (ficam no deferred-work); passos de épicos futuros; o redirecionamento em outra tela além do Painel; dados de exemplo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Primeira entrada | Sem cadastros, `primeiro_uso_em` nulo | Painel → `/primeiro-uso`, passo 1 Responsáveis | N/A |
| Já tem cadastro | 1 Tipo, `primeiro_uso_em` nulo | Painel normal | N/A |
| Já concluído | Sem cadastros, `primeiro_uso_em` preenchido | Painel com "Importe sua primeira fatura" | N/A |
| Pular | Passo 2 (Tipos) | Vai para o passo 3, sem gravar | N/A |
| Concluir | Passo 4 (Ciclo) → "Concluir" | Grava `primeiro_uso_em`, vai para o Painel | Recusa: toast, fica no passo |
| Retomar | Configurações → "Retomar o Primeiro uso" | Passo 1, `primeiro_uso_em` intocado | N/A |
| Passo inválido | `?passo=xyz` | Passo 1 | N/A |
| Ciclo pela tela | Fechamento 28, vencimento 6, Salvar | `inserir` com `{dia_fechamento: 28, dia_vencimento: 6, vigente_desde}` | Plano `null`: não chama `inserir`; recusa: toast com a mensagem do código e campos mantidos |

</frozen-after-approval>

## Code Map

- `src/app/(app)/page.tsx` -- Painel; acrescentar o redirecionamento (consulta no servidor) e trocar `app.em_breve` por `painel.vazio`.
- `src/app/(app)/layout.tsx` -- modelo do layout novo `src/app/primeiro-uso/layout.tsx` (`ToastProvider`, `AplicarTema`, aviso de tela pequena), sem `NavRail`.
- `src/app/(app)/configuracoes/page.tsx` -- lista de seções; acrescentar o link "Retomar o Primeiro uso" antes do `<form action={sair}>`.
- `src/features/configuracoes/Secao*.tsx` -- reutilizar sem mudar o comportamento.
- `src/data/configuracoes-repo.ts` -- `definir(mudanca)` já faz upsert parcial; acrescentar `concluirPrimeiroUso()` (o servidor do banco define o instante: mandar `new Date().toISOString()` é aceitável, mas preferir um `default`/RPC só se ficar mais simples).
- `src/data/supabase/servidor.ts` (`criarClienteServidor`) -- consulta do Painel: `count` com `head: true` em `responsaveis`, `tipos`, `status` e a linha de `configuracoes`.
- `supabase/migrations/20261102150000_ciclo_aparencia.sql` -- modelo de `alter table configuracoes add column`; não alterar migrações antigas.
- `src/domain/mensagens.ts` -- `painel.vazio`, os textos dos passos e os rótulos.
- `vitest.config.mts` -- `environment: "node"`, `include` já pega `*.test.tsx`.
- `src/app/(app)/layout.test.tsx` -- modelo de `vi.mock` para componentes que usam o roteador ou o Realtime; nos testes com DOM, simular `@/data/realtime` (`useLinhas`, `gerenciador`) e os repositórios.
- `src/data/database.types.ts` -- acrescentar a coluna à mão no formato `--linked`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261102160000_primeiro_uso.sql` -- `configuracoes.primeiro_uso_em timestamptz` anulável; comentário da tabela.
- [x] `src/domain/primeiro-uso.ts` (+ teste) -- `PASSOS_PRIMEIRO_USO`, `passoEscolhido(valor)`, `proximoPasso`, `deveAbrirPrimeiroUso({ concluidoEm, temCadastro })`.
- [x] `src/domain/mensagens.ts` (+ teste) -- textos e rótulos novos.
- [x] `src/data/configuracoes-repo.ts` (+ teste) -- `concluirPrimeiroUso()`.
- [x] `src/app/primeiro-uso/layout.tsx`, `page.tsx`, `src/features/primeiro-uso/PassoAPasso.tsx` -- tela cheia com os passos.
- [x] `src/app/(app)/page.tsx`, `src/app/(app)/configuracoes/page.tsx` -- redirecionamento, estado vazio e link de retomar.
- [x] `src/data/database.types.ts` -- coluna nova.
- [x] `package.json`, `vitest.config.mts` -- `jsdom`, `@testing-library/react`, `@testing-library/user-event` como devDependencies; um `test/dom-preparar.ts` (limpeza depois de cada teste) carregado só nos testes com DOM.
- [x] `src/features/configuracoes/SecaoCiclo.test.tsx`, `SecaoConferencia.test.tsx`, `SecaoAparencia.test.tsx` -- a linha "Ciclo pela tela" da matriz (dias na ordem certa, plano `null` não grava, recusa mostra a mensagem e mantém os campos), dia inválido mostra mensagem no campo, Conferência grava os dois valores numa chamada e mostra erro no campo fora do intervalo, Aparência chama `definirAparencia` com a escolha.
- [x] `src/features/primeiro-uso/PassoAPasso.test.tsx` -- ordem dos passos, Pular avança sem gravar, Concluir grava e navega, recusa mostra toast e fica.
- [x] `test/integracao/configuracoes.test.ts` ou o teste de integração existente de `configuracoes` -- `primeiro_uso_em` nulo por padrão e gravável pelo dono.

**Acceptance Criteria:**
- Given Rafael entra pela primeira vez sem cadastros, when o login termina, then o Primeiro uso abre em tela cheia no passo Responsáveis.
- Given o Primeiro uso concluído ou pulado num aparelho, when Rafael entra no outro, then vai para o Painel com "Importe sua primeira fatura".
- Given `npx vitest run`, when os testes rodam, then os do núcleo continuam em `node` e os de componente rodam com DOM, todos verdes.
- Given o CI, when o job `supabase` roda, then a migração aplica do zero, a integração passa e os tipos batem.

## Implementation Notes

- Núcleo `src/domain/primeiro-uso.ts`: além de `PASSOS_PRIMEIRO_USO`, `passoEscolhido`, `proximoPasso` e `deveAbrirPrimeiroUso`, vieram `numeroDoPasso` e `passosSeguintes` (cabeçalho e "Próximos passos"). `?passo=` usa o nome do passo (`?passo=tipos`), não o número, para a posição poder mudar quando os passos dos épicos futuros entrarem.
- Textos em `mensagens.ts`: `painel.vazio`, `TEXTOS_PASSO` (seção, pergunta e ajuda; `satisfies Record<PassoPrimeiroUso, …>` torna obrigatório o texto de um passo novo), `rotuloPasso`, `rotuloProximosPassos` e os rótulos `pular`, `continuar`, `concluir`, `primeiro_uso`, `retomar_primeiro_uso`.
- A leitura do Painel ficou em `src/data/estado-primeiro-uso.ts` (`lerEstadoPrimeiroUso(cliente)`): lê `primeiro_uso_em` primeiro e só sem a marca faz as três contagens `head`. Devolve `{ ok, estado }` ou `{ ok: false, codigo }`; na falha o Painel registra só o código por `src/server/log.ts` (`painel.primeiro_uso_falhou`) e não redireciona.
- Revisão 1 (rascunho não salvo): `src/features/configuracoes/rascunho.ts` (`PropsSecao`, `useAvisarRascunho`, `useAvisarRascunhoDaLinha`, `useRascunhosDasLinhas`). As quatro seções aceitam `aoMudarRascunho` opcional (nome novo com texto, renomear em curso nas `Linha*`, dias do Ciclo diferentes dos salvos); sem a prop, nada muda. `PassoAPasso` guarda o aviso numa ref e, com rascunho, os três botões abrem a `Janela` `rascunho.nao_salvo` com "Voltar para salvar" e "Descartar".
- `concluirPrimeiroUso()` manda `new Date().toISOString()` (relógio injetável no repositório, `agora`), pelo mesmo `definir` das outras colunas.
- `PassoAPasso` guarda o passo em estado local e mantém `?passo=` com `window.history.replaceState` (integra com o roteador do Next, sem ida ao servidor). Concluir usa `router.replace("/")`. A cada passo novo o foco vai para a pergunta (`h1` com `tabIndex=-1`).
- Testes com DOM: além de `jsdom`, `@testing-library/react` e `@testing-library/user-event`, entrou `@testing-library/dom` (dependência par obrigatória da `@testing-library/react` 16). `test/dom-preparar.ts` está em `setupFiles`, mas só importa a Testing Library e registra o `cleanup` quando há `document` (arquivos com `// @vitest-environment jsdom`); nos de `node` não faz nada.
- Integração em `test/integracao/configuracoes.test.ts` (arquivo novo), usando também `lerEstadoPrimeiroUso` contra o banco local. Não rodou localmente (sem Docker); roda no job `supabase` do CI.
- Extra: `src/app/primeiro-uso/layout.test.tsx` (sem menu, com tema, toast e aviso de tela pequena).

## Spec Change Log

- Revisão 1, achado "valor digitado e não salvo se perde ao avançar" (blind): intent_gap respondido por Rafael ("avisar e perguntar"); acrescentada a decisão em Boundaries. Implementação mantida (KEEP: tudo o que já existe); a janela entra como correção aditiva, sem reverter. Estado ruim evitado: concluir o Primeiro uso com o Ciclo digitado e não gravado, sem aviso.

## Review Triage Log

Revisão 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Achado | Veredito | Evidência | Rota |
|---|--------|----------|-----------|------|
| 1 | Digitado e não salvo se perde ao avançar (blind) | medium | Continuar/Concluir só avançam; o Ciclo digitado some | intent_gap → decisão de Rafael |
| 2 | Sem saída nem volta no Primeiro uso (blind) | low | Pular avança; Configurações retoma | rejeitado |
| 3 | Concluir de novo sobrescreve `primeiro_uso_em` (blind) | low | Só o instante muda; ninguém lê o valor | rejeitado |
| 4 | Falha na leitura do estado sem log (blind) | low | `lerEstadoPrimeiroUso` devolve `null` em silêncio; migração não aplicada passaria sem rastro | patch |
| 5 | Painel faz 4 consultas sempre (blind) | low | Com a marca preenchida as contagens são inúteis; reordenar é direto | patch |
| 6 | Conversão de tipo no cliente do servidor (blind) | low | Herdado da 1.2 | rejeitado |
| 7 | Layout repetido do `(app)` (blind) | low | Poucas linhas, sem harmonia perdida hoje | rejeitado |
| 8 | Painel e link Retomar sem teste (vg, blind) | medium | Nenhum teste importa as páginas; inverter o `if` passaria | patch |
| 9 | Teste de integração dependente da ordem e só com Tipos (blind) | low | Teste 3 depende do 2 | patch |
| 10 | Ponto final, status do sprint (blind) | false | Estados vazios sem ponto no mapa; sprint só muda no fechamento | rejeitado |
| 11 | Foco no StrictMode de desenvolvimento (blind, edge) | low | Só em dev | rejeitado |
| 12 | `concluidoEm` aceita `undefined` (blind) | low | Cosmético | rejeitado |
| 13 | `count` indefinido vira NaN (edge) | false | supabase-js devolve número ou `null` com `head: true` | rejeitado |
| 14 | Só o Ciclo salvo reabre o Primeiro uso (edge) | low | Reabrir é inofensivo; Pular até o fim encerra | rejeitado |
| 15 | Gravação pendurada trava os botões (edge) | low | Sem prova de alcance; padrão das seções | rejeitado |
| 16 | Login com `?next=` pula o Painel (edge) | low | Primeiro login vai para `/` | rejeitado |
| 17 | `replaceState` com estado nulo (edge) | low | Next integra `history.replaceState` nativo | rejeitado |
| 18 | `dom-preparar.ts` roda em todos os arquivos (edge) | low | Não faz nada sem `document` | rejeitado |

## Design Notes

O Painel decide no servidor, antes de desenhar, para o Primeiro uso não piscar depois do Painel. Como há só um usuário, quatro consultas `head` são baratas. `temCadastro` conta também os arquivados: quem já arquivou algo não é um usuário novo.

## Verification

**Commands:**
- `npx tsc --noEmit`, `npx eslint .`, `npx vitest run`, `npm run build` -- expected: verde.
- CI (lint, typecheck, testes, build, job `supabase`) -- expected: verde.

**Manual checks (if no CLI):**
- Depois do `db push`: com a conta vazia, entrar e cair no passo 1; pular até o fim e ver o Painel vazio; em Configurações, "Retomar o Primeiro uso".
