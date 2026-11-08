---
title: 'História 2.7: Painel do Lançamento: classificar, corrigir, incluir e excluir'
type: 'feature'
created: '2026-11-08'
status: 'in-review'
route: 'dispatch'
baseline_commit: 'b3ef1b8f706cf29c850c869f618b6204b6d81528'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A grade do Painel só mostra os Lançamentos. Não dá para classificar (Responsável, Tipo, Status), corrigir o que a extração leu errado, incluir o que faltou nem excluir (FR-7, FR-46, UX-DR14). Tocar na linha não faz nada, e a caixa da linha é só visual.

**Approach:** Criar o `side-panel` do Lançamento, que abre pela direita sem véu. Cada campo salva ao sair dele, mandando só a coluna alterada. O painel também serve para "＋ Lançamento" e tem "Excluir" com "Desfazer". A linha passa a ter caixa de seleção, toque no corpo para abrir o painel e o menu ⋯ (com toque longo). As regras ficam no núcleo, e a gravação passa por um repositório novo de Lançamentos.

## Boundaries & Constraints

**Always:**

**Abrir o painel e o layout**
- Tocar no corpo da linha abre o painel. Fora disso:
  - a caixa só seleciona;
  - a `person-tag` só filtra, como na 2.6;
  - o ⋯ e o toque longo (`MenuAcoes`) abrem o menu "Abrir" / "Excluir".
- Tocar em outra linha troca o Lançamento do painel. ✕ ou Esc fecham.
- Layout:
  - iPad deitado e PC (`lg`+): o painel tem 400 px, e o conteúdo reserva essa largura. A grade estreita e rola para os lados, com caixa e Nome fixos.
  - iPad em pé: o painel ocupa 70% da largura, sem véu. Caixa e Nome continuam visíveis e tocáveis.
- A linha aberta no painel leva uma borda à esquerda em `accent-line`. O fundo `selection` fica só para a linha selecionada.

**Linha que sai do filtro** (decisão do Rafael, 08/11/2026, opção A)
- A linha aberta no painel fica na grade enquanto o painel estiver nela, mesmo que uma edição a tire do filtro.
- Ela sai quando o painel fecha ou quando outra linha abre.
- O rodapé "Total dos lançamentos", as contagens do popover e o anúncio `role="status"` seguem o filtro na hora, então não contam essa linha.

**Conteúdo do painel**
- Ordem do mockup `lancamento.html`:
  1. Título: o Apelido ou o Nome.
  2. O indicador de gravação.
  3. ✕.
  4. "Nome na fatura: X · não editável".
  5. Valor e "Data da compra".
  6. Apelido.
  7. Responsável e Tipo.
  8. Status.
  9. Observação.
  10. A linha de só leitura: "Parcela 05/10 · cartão final 8673 · Lançado por Fatura".
  11. O rodapé com "Excluir" (contorno `danger`).
- Seletores (`Seletor`, `form-field`, UX-DR26):
  - Responsável, Tipo e Status mostram os itens não arquivados e mais "Sem …". O arquivado em uso aparece também.
  - Status vazio é "não pago" (AD-10).
- Valor:
  - O campo é de texto com `inputMode="decimal"`, lido por `lerReais` e mostrado por `formatarDinheiro`.
  - Aceita negativo (crédito). Zero é recusado.
- Data: `<input type="date">`, opcional.
- Apelido: até 60 caracteres, recortado. Em branco vira `null`.
- Observação: até 500 caracteres. Em branco vira `null`.

**Salvar ao sair do campo**
- Um campo salva ao sair dele (seletor: ao mudar). Só salva se o valor mudou em relação à memória.
- A gravação manda só aquela coluna e `editado_em` (o relógio do aparelho), com otimismo (`gravarComOtimismo`).
- O indicador fica no topo:
  - "Salvando…";
  - "Salvo às HH:MM";
  - "Não salvo, tentando de novo".
- Quando a gravação falha:
  - O app tenta de novo sozinho até 3 vezes (2 s, 5 s, 10 s), enquanto o valor do campo continuar o mesmo.
  - Se as 3 falharem, o campo volta ao valor gravado e aparece "Não foi possível salvar. Tente de novo.".
- Sem conexão:
  - Nada começa e o campo volta ao valor gravado.
  - Aparece a mensagem `conexao.gravar_sem_conexao`.
  - Nada fica guardado no aparelho.
- Erros de validação:
  - Ficam no campo (`danger-fg`, `aria-describedby`) e não gravam.
  - O valor digitado continua no campo.
- Mudar o Valor ou a data nunca muda o `mes` (AD-9).

**Conferência no painel**
- Num Lançamento com `fatura_id`, o painel mostra "Conferência: ✓", ou "Conferência: diferença de R$ X" com o valor de `valorDaDiferenca`.
- Esse texto e o hero recalculam a cada mudança da memória, incluindo o otimismo.

**"＋ Lançamento"**
- Fica no topo do Painel, ao lado de "＋ Importar fatura".
- Abre o painel vazio, com o Nome editável, e o rodapé "Cancelar" / "Incluir". Nada salva até "Incluir".
- Nome e Valor são obrigatórios. Nome tem até 200 caracteres, recortado, e `nome_normalizado = normalizarNome(nome)`.
- O Lançamento entra com `lancado_por = 'manual'`.
- Só com Fatura no Mês aberto aparece a caixa "Corrige a leitura da fatura", desmarcada no começo. Marcada:
  - o Lançamento recebe o `fatura_id`;
  - `mes` é o da Fatura;
  - "Cartão" vira obrigatório, um seletor com os finais de `fatura_cartoes` dessa Fatura.
- Sem a caixa marcada:
  - sem cartão;
  - `mes = mesDoLancamento(data, config_ciclo)` se houver data, senão o Mês aberto.
- Se o `mes` calculado for outro Mês, o toast diz "Lançamento incluído em novembro/26". Se for o Mês aberto, o painel abre o Lançamento criado.

**Excluir**
- O rodapé e o menu pedem confirmação (`ConfirmarAcao`, "Excluir lançamento").
- A exclusão grava só `excluido_em`.
- O toast "Excluído · Desfazer" limpa `excluido_em` no mesmo `id`.
- O painel fecha. A Conferência e o hero recalculam.

**Alterado em outro aparelho**
- Acontece quando chega, para o Lançamento aberto, uma versão mais nova que não veio de gravação deste aparelho.
- Aparece a faixa "Este lançamento foi alterado em outro aparelho às HH:MM" (pelo `updated_at` da versão nova).
- Os campos que não estão em edição se atualizam. O campo em edição fica com o que foi digitado.
- Excluído em outro aparelho: o painel fecha, com o toast "Este lançamento foi excluído em outro aparelho".

**Seleção**
- A seleção é só um estado da tela:
  - nada é gravado e não há barra;
  - a linha selecionada fica com fundo `selection`;
  - a caixa é um checkbox com o nome "Selecionar NOME".
- Caixa do cabeçalho:
  - marca ou desmarca todas as linhas da grade (filtradas);
  - fica parcial quando só parte está marcada;
  - tem o nome "Selecionar todos".
- Trocar de Mês limpa a seleção. Um Lançamento excluído sai dela.

**Conferência com `final_cartao` nulo**
- Um Lançamento da Fatura sem `final_cartao` entra nos totais gerais, mas não entra em nenhum cartão. Não existe cartão "".
- Nunca recebe a marca "verificar" por cartão.
- A faixa nunca diz "cartão final .".

**Popover de filtro aberto durante tempo real**
- O rascunho não se perde quando chega uma mudança em tempo real.
- Um valor marcado que sumiu do Mês continua na lista, com contagem 0.
- As contagens se atualizam ao vivo.

**VoiceOver**
- O `aria-label` do `<tr>` e o resumo oculto ficam iguais à 2.5.
- O corpo da linha vira um botão cujo nome é o rótulo da linha.
- A pendência da linha no VoiceOver continua aberta.

**Regras e testes**
- Regras no núcleo (AD-1), em `src/domain/lancamento.ts`.
- Textos em `mensagens.ts`.
- Só tokens do DESIGN.md.
- Testes do núcleo e jsdom.

**Never:**
- Migração.
- Apagar, reimportar ou alterar dados de produção fora do teste do Rafael.
- Também ficam fora:
  - Dívida programada, "Dividir", origem;
  - a pergunta do Apelido "aplicar a todos" (FR-52) e "Só este / Aplicar a todos";
  - as parcelas previstas e o aviso de Pagamento;
  - a barra de Seleção, a seleção do filtro inteiro, ⌘A (Épico 4);
  - editar Nome, Parcela, cartão, Lançado por, `mes` ou `fatura_id` de um Lançamento existente;
  - mudar a regra do ano das parcelas na importação.
- Mudar o hero, a conta do total, a faixa, a bolinha, a ordenação ou a barra de filtros. Exceção: os dois consertos acima.

## I/O & Edge-Case Matrix

| Cenário | Entrada / estado | Resultado | Erros |
|----------|--------------|---------------------------|----------------|
| Classificar | Responsável "Casal" numa linha de out/26 | grava só `responsavel_id` e `editado_em`; "Salvo às 21:14"; barra do hero muda | 3 falhas: volta para "Sem responsável" e mensagem |
| Corrigir Valor | BELLA PIETRA de R$ 800,00 para R$ 80,00 | "Conferência: diferença de R$ 720,00"; selo e faixa aparecem | Valor "abc" ou "0": erro no campo, nada grava |
| Incluir correção | out/26, "Corrige a leitura" marcada, cartão 8673, R$ 10,00 | `fatura_id` de out/26, `mes` 2026-10; cartão 8673 + R$ 10,00 na Conferência | sem cartão: "Escolha o cartão" |
| Incluir com data | nov/26 aberto, data 20/11/26, sem a caixa | `mes` pela regra de Ciclo (ex.: 2026-12); toast "Lançamento incluído em dezembro/26" | sem `config_ciclo`: vai para o Mês aberto |
| Excluir / Desfazer | excluir uma linha de out/26, depois "Desfazer" | some e a Conferência acusa diferença; volta igual, com o mesmo `id` | falha: toast `salvar.falhou`, a linha volta |
| Outro aparelho | Tipo muda no PC com o painel aberto no iPad | faixa "…alterado em outro aparelho às 21:30"; Tipo atualizado | N/A |
| Final nulo | Lançamento com `fatura_id` e `final_cartao` null, R$ 5,00 | despesas +R$ 5,00; nenhum cartão "" | N/A |

</frozen-after-approval>

## Code Map

**Núcleo**
- `src/domain/conferencia.ts` -- `conferir` (l. 46) passa `final_cartao ?? ""` a `somarConferencia`.
  - Trocar: o Lançamento com final nulo entra só nos totais gerais.
  - Em `precisaVerificar` (l. 76), o final nulo nunca é marcado por cartão.
  - `valorDaDiferenca` serve para o texto do painel.
- `src/domain/extracao-fatura.ts:281` -- `somarConferencia`: aceitar `finalCartao: string | null` e pular nulos no `despesasPorCartao`. A importação sempre manda o final, então não muda.
- `src/domain/ciclo.ts:99` -- `mesDoLancamento(data, configs)`, o Mês do "＋ Lançamento".
- `src/domain/dinheiro.ts:32` -- `lerReais` e `formatarDinheiro`.
- `src/domain/importacao-fatura.ts:37` -- `normalizarNome`.
- `src/domain/importacao-fatura.ts:55` -- `formatarParcela`.
- `src/domain/datas.ts` -- `formatarHora`. Exige ISO com `T` e `±HH:MM`; o `updated_at` do Realtime vem como `2026-11-02 12:00:00.123456+00`, então normalizar antes, na tela, ou aceitar no formatador com teste.
- `src/domain/painel.ts:206` -- `rotuloLinhaAcessivel`: não mudar.
- `src/domain/filtros-grade.ts:189` -- `valoresDaColuna`: aceitar os valores extras do rascunho para manter na lista.

**Dados**
- `src/data/realtime-estado.ts:177` -- `colunasAlteradas`.
- `src/data/gravacao.ts` -- `gravarComOtimismo`, `SEM_CONEXAO`, `FALHOU`.
- `src/data/responsaveis-repo.ts:46` -- modelo de `atualizar` (só as colunas que mudaram).
- `src/data/faturas-repo.ts` -- modelo de repositório. A gravação de `lancamentos` vai para um repo novo.
- `src/data/realtime.ts` -- `gerenciador("lancamentos")` (por Mês). `aplicarLote` ignora outro Mês. Usar `gerenciador("config_ciclo")` para o Ciclo.
- Schema: `supabase/migrations/20261103120000_faturas_lancamentos.sql`.
  - `lancamentos_fatura_check` só vale para `lancado_por='fatura'`; a correção manual pode ter `ordem_fatura` nulo (ordena por último).
  - `final_cartao ~ '^\d{4}$'` ou nulo; `apelido` até 60.
  - `observacao` não tem limite no banco.

**Interface**
- `src/features/painel/Painel.tsx` -- estado do painel e da seleção; botão "＋ Lançamento" em `acoes`; `doMes`, `conferencia`, `naGrade`. Reserva de 400 px em `lg`+.
- `src/features/painel/GradeLancamentos.tsx` -- `Caixa` vira checkbox; corpo clicável; ⋯ com `MenuAcoes` em coluna nova no fim (`colSpan` do vazio e do rodapé de 8 para 9).
- `src/features/painel/PopoverFiltro.tsx:44` -- `alternar` filtra pela lista atual e perde o valor sumido. Manter o rascunho e mostrá-lo com contagem 0.
- `src/ui/`: `Campo`, `Seletor`, `MenuAcoes` (toque longo + ⋯), `ConfirmarAcao`, `Toast` (`useToast`, `aoDesfazer`), `Botao`, `cn`. `Janela` é modal e não serve para o painel.

**UX**
- DESIGN.md:192, 288–293, 313–317, 365, 451, 455.
- EXPERIENCE.md:45, 124–135, 225–229, 242–250, 264–265.
- `mockups/lancamento.html` l. 69–78.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/lancamento.ts` + teste: validar e converter os campos (Valor, Apelido, Observação, Nome, data); `mudancaDoCampo(atual, campo, texto)` → `{ ok, coluna, valor } | erro`; `novoLancamento(form, { mesAberto, fatura, cartoes, configsCiclo })` → linha para inserir ou erro; o texto da Conferência do painel; a seleção (`alternarSelecao`, `estadoCaixaCabecalho`); a regra do "alterado em outro aparelho". Testar a matriz.
- [x] `src/domain/conferencia.ts`, `extracao-fatura.ts` + testes: final nulo.
- [x] `src/domain/filtros-grade.ts` + teste: valores do rascunho.
- [x] `src/domain/mensagens.ts` + teste: textos novos e códigos `lancamento.*`.
- [x] `src/data/lancamentos-repo.ts` + teste: `atualizar(id, mudanca)`, só as colunas que mudaram e `editado_em`, com otimismo; `incluir(novo)`, sem otimismo, aplica a linha devolvida; `excluir(id)` / `restaurar(id)`, grava `excluido_em`; devolve a linha gravada, para o painel reconhecer as próprias gravações.
- [x] `src/features/painel/PainelLancamento.tsx` + teste jsdom: campos, salvar ao sair, novas tentativas, indicador, Conferência, faixa, incluir, excluir.
- [x] `GradeLancamentos.tsx`, `Painel.tsx`, `PopoverFiltro.tsx` + testes: caixa, corpo, ⋯, linha aberta que fica na grade (opção A), "＋ Lançamento", toast, layout.

**Acceptance Criteria:**
- Given o deploy de produção sem nenhuma edição, when Rafael abre out/26 e nov/26, then hero, Conferência, faixa, filtros e grade ficam como na 2.6.
- Given o painel aberto, when Rafael toca na caixa de outra linha, then ela é selecionada e o painel não muda.
- Given uma edição salva, when o Realtime devolve o mesmo `updated_at`, then a faixa "outro aparelho" não aparece.

## Implementation Notes

- `formatarHora` passou a aceitar o formato do Realtime (`2026-11-08 00:30:00.5+00`); `instanteEmMicros` foi para o núcleo (`datas.ts`) e `realtime-estado.ts` o reexporta como `instanteMicros`. O núcleo usa ele em `alteradoEmOutroAparelho`, que compara instantes (o Realtime e o PostgREST escrevem o mesmo instante de jeitos diferentes).
- `MenuAcoes` ganhou `aberto`/`aoMudarAberto` (controlado) e o hook `useToqueLongo`, usado também no `<tr>` da grade para o toque longo abrir o menu da linha.
- `PopoverFiltro` recebe `listar(extras)` (pela `BarraFiltros`), que chama `valoresDaColuna(…, extras)` com o rascunho aberto.
- Na inclusão, o Status começa no `configuracoes.status_padrao_id` (AD-10, linhas novas), se ele não estiver arquivado.
- Uma linha da Fatura não pode ficar sem data (a restrição `lancamentos_fatura_check` recusaria): `mudancaDoCampo` devolve `lancamento.data_da_fatura` no campo, em vez de gravar e cair nas novas tentativas.
- A falha final de gravação ("Não foi possível salvar. Tente de novo.") aparece no indicador do topo; sem conexão, o aviso vem no toast.
- "Excluído em outro aparelho" fecha o painel por ajuste de estado na renderização (o toast vem num efeito), sem `setState` dentro de efeito.

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | verif, blind | Toque longo / clique direito no `<tr>` sem teste (menu abre, painel não) | medium | nenhum teste dispara `contextMenu`/pointer na linha; tirar `{...toqueLongo}` passa | patch |
| 2 | verif | Falha de "Incluir" (e de "Desfazer") sem teste | low | `incluir`/`restaurar` falsos sempre dão certo nos testes | patch |
| 3 | verif | Status padrão do "＋ Lançamento" sem teste na ligação do Painel nem com padrão arquivado | low | só `PainelLancamento.test` com o prop fixo | patch |
| 4 | verif | "Selecionar todos" com filtro não testado no Painel | low | só o harness da grade, sem filtro | patch |
| 5 | verif | Esc com janela/menu/popover sobre o painel sem teste | medium | remover `sobreposicaoAberta()` passa nos testes | patch |
| 6 | blind, edge | Esc (ou qualquer fechamento sem blur) perde o texto digitado no campo em foco | medium | Esc desmonta o painel sem `blur`; `sair()` não roda | patch |
| 7 | blind, edge | Gravação que falha depois de fechar o painel: tentativas agendadas após o cleanup e falha final muda | medium | `setTimeout` entra em `temporizadores` depois do cleanup; `setFalhou` num componente desmontado | patch |
| 8 | blind, edge | "Desfazer" depois de trocar de Mês falha (`restaurar` exige a linha na memória) | low | memória guarda só o Mês aberto; toast dura 6 s | patch |
| 9 | blind | Valor acima de `integer` passa no núcleo e cai em 3 tentativas | low | `lerReais` aceita até `MAX_SAFE_INTEGER`; coluna é `integer` | patch (limite no núcleo); não repetir códigos determinísticos: rejeitado (ramo novo) |
| 10 | blind | Nova tentativa pode sobrescrever mudança de outro aparelho na mesma coluna | low | AD-3: última gravação por coluna vence; o valor digitado é a última intenção | rejeitado |
| 11 | blind | Rascunho do "＋ Lançamento" se perde ao tocar numa linha/✕/Esc; Enter não envia | low | exige confirmação nova; iPad sem teclado físico | rejeitado |
| 12 | blind | Foco não volta para quem abriu o painel | low | exige guardar o gatilho; VoiceOver não é usado (decisão de 08/11) | rejeitado |
| 13 | blind | Texto da confirmação diz "e da Conferência" para Lançamento sem Fatura | low | `descricaoExcluirLancamento` fixo | patch |
| 14 | blind | Linha aberta muda de lugar com a grade ordenada pela coluna editada; sem marca de fora do filtro | low | só com ordem pela coluna editada; marca exige ramo novo | rejeitado |
| 15 | blind | Faixa "outro aparelho" não some | low | spec não pede sumir; fica até fechar o painel | rejeitado |
| 16 | blind | sprint-status `in-progress` × spec `in-review` | false | o passo de apresentação leva o sprint-status a `review` | rejeitado |
| 17 | blind | Erro `lancamento.data_da_fatura` sem teste jsdom | low | só no núcleo | patch |
| 18 | blind | Repositório novo sem teste de integração contra o schema real | medium | inserção manual com `fatura_id` e `ordem_fatura` nulo, RLS do update e `owner_id` nunca rodaram no banco; é a primeira gravação em produção | patch |
| 19 | edge | `gravadosAqui` se perde ao remontar o painel (falsa faixa) | low | só reabrindo a mesma linha durante a gravação em voo | rejeitado |
| 20 | edge | Tempo esgotado no cliente com commit no banco: falsa faixa | low | raro; exige comparar valores | rejeitado |
| 21 | edge | Segunda gravação durante otimismo da primeira | false | `desfazerOtimista` só volta se o `updated_at` não mudou; a resposta do banco corrige | rejeitado |
| 22 | edge | Data incompleta no `<input type="date">` (PC) apaga a data | low | `value` vem "" com `validity.badInput`; guarda direta | patch |
| 23 | edge | "Incluir" em voo e o painel fecha/troca de Mês: reabre ou toast falso; `mesAberto` velho | low | `aoIncluido` usa a closure; linha criada sem aviso | patch |
| 24 | edge | "＋ Lançamento" antes de `config_ciclo`/`configuracoes` carregarem: Mês errado gravado para sempre e sem Status padrão | medium | `mes` nunca é recalculado (AD-9); os dois não entram em `retratos` | patch |
| 25 | edge | Cadastro fora da lista no seletor | false | cadastros são arquivados, não apagados; `retratos` espera carregar | rejeitado |
| 26 | edge | `formatarHora` lança com formato inválido | false | `updated_at` vem sempre do banco com fuso | rejeitado |
| 27 | edge | Fatura some com "Corrige a leitura" marcada | false | Faturas não são apagadas pelo app | rejeitado |
| 28 | edge | Componentes fora da faixa no instante | low | valores sempre do banco | rejeitado |
| 29 | edge | Linha da confirmação some com a janela aberta | low | sem apagamento físico no app | rejeitado |
| 30 | edge, verif | Instante sem fuso vira `NaN` (antes UTC) | false | `timestamptz` sempre tem fuso no PostgREST e no Realtime | rejeitado |
| 31 | edge | `onContextMenu` deixou de chamar `preventDefault` no conteúdo do portal | low | mudança de comportamento do `MenuAcoes`; correção direta | patch |
| 32 | edge | Forma de `mudancaDoCampo` difere da spec | false | a spec descreve o contrato de forma informal; o chamador usa a forma real | rejeitado |
| 33 | verif | `excluidaFora` também dispara se `mes` mudar | false | o app não muda `mes` (AD-9) | rejeitado |

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: tudo verde. Os testes de integração rodam no CI.
- `npm run build` -- expected: build sem erro.
