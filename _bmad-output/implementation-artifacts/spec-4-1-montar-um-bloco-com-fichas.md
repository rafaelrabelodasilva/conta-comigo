---
title: 'História 4.1: Montar um Bloco com fichas'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: '8aadc1d9539c2b0a112dfbcc6952982dcefadc30'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** o Painel ainda não tem Blocos: Rafael não consegue ter "Rangel + (Casal ÷ 2)" nem os totais por pessoa (FR-19, FR-54), e sem a Fórmula no núcleo as histórias 4.2 a 4.7 não têm onde se apoiar.

**Approach:** o núcleo ganha a Fórmula (árvore validada por zod), `avaliar` (racional exato, um só arredondamento, passo a passo, Lançamentos que entram) e `projetarPainel`; uma migração cria `blocos`; o Montador de Bloco monta a Fórmula só por fichas, com resultado e passo a passo ao vivo, e grava pelo repositório.

## Boundaries & Constraints

**Always:** regra de negócio só em `src/domain` (imports relativos; erros `{ ok, erro }`); dinheiro em centavos, intermediário em racional (`bigint`), arredondamento único meio para longe do zero só no final, texto só pelos formatadores do núcleo; `projetarPainel` = Lançamentos não excluídos do Mês sem a mãe dividida (as filhas valem), com Ajustes e previstos, igual à grade. Fórmula de `jsonb` sempre relida por zod. Toda mudança de schema é migração; `database.types.ts` à mão no formato do gerado; `blocos` com `owner_id`, RLS, `replica identity full` e Realtime; `meu_bloco` único por dono (índice parcial); as referências da Fórmula entram em `REFERENCIAS_JSONB` e em `referencias_cadastro()` com `contaUso` (excluir Responsável ou Tipo usado num Bloco exige substituto). Gravação só pelo repositório, que é RPC (`meu_bloco` troca de dono numa transação). Nada de campo de texto livre para a Fórmula.

**Never:** mostrar Blocos como `block-card`, renomear, reordenar, excluir (4.2); filtro da grade (4.3); Seleção (4.4); mensagem e modelo (4.5 a 4.7); `projetarPendente`; aplicar a migração em produção ou ler produção; regra de negócio em SQL; `console.*`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Aceite outubro/2026 | Casal; Casal ÷ 2; Todos; Mãe; Lucas | R$ 5.639,35; R$ 2.819,68 (de 2.819,675); R$ 9.280,23; R$ 1.350,14; R$ 215,16 | N/A |
| Passo a passo | Rangel + (Casal ÷ 2) | "Rangel R$ 0,00 + (Casal R$ 5.639,35 ÷ 2 = R$ 2.819,675) = R$ 2.819,68" | N/A |
| Precedência | Rafael + Casal × 2 | × antes de +; sem grupo, sem "=" intermediário | N/A |
| Fichas inválidas | "(" sem ")"; termina em operação; ÷ 0 | "Salvar" desativado com "Falta fechar um parêntese" / "A fórmula termina com uma operação" / "Divisão por zero" | `formula.*` do mapa único |
| Número e valor | Rangel + 100; Casal ÷ 2; Casal × Mãe | 100 vale R$ 100,00 ao somar a valor; ÷ 2 é fator; valor × valor é inválido | `formula.dinheiro_com_dinheiro` |
| Linhas | mãe dividida, filhas, Ajuste, previsto, excluída, outro Mês | só filhas, Ajuste e previsto do Mês entram; mãe e excluída não | N/A |
| "É o meu Bloco" | outro Bloco já é | o antigo perde o flag na mesma gravação | RPC recusa sem sessão |
| Responsável em Tipo | Rafael + Bobiças | só Lançamentos com os dois | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/dinheiro.ts` -- `arredondar` (fica); ganha `arredondarRacional` e `formatarRacionalEmReais` (lint só libera `toFixed`/`Intl` aqui).
- `src/domain/painel.ts`, `divisao.ts` -- `linhasDoMes`, `unidadesDoMes`: reusar em `projetarPainel`.
- `src/domain/cadastros.ts` (+ teste), `supabase/migrations/20261110120000_regras.sql`, `20261117120000_dividir_lancamento.sql` -- `REFERENCIAS_JSONB` e `referencias_cadastro()` (última versão na 3.8).
- `src/domain/mensagens.ts` -- `MENSAGENS`, `mensagem()`; ganha `formula.*`, `bloco.*` e `TEXTOS_BLOCO`.
- `src/domain/nome-cadastro.ts`, `responsaveis.ts` -- `validarNomeCadastro`, `proximaOrdem`: modelo do nome e da ordem.
- `src/data/responsaveis-repo.ts`, `realtime.ts`, `gravacao.ts` -- modelo do repositório e `gerenciador("blocos")`.
- `src/features/painel/Painel.tsx`, `JanelaDividir.tsx` -- onde entra o cartão "Blocos" e modelo de janela.
- `src/ui/Janela.tsx`, `Seletor.tsx`, `Botao.tsx`, `cores-pessoa.ts` -- peças do Montador.
- `test/integracao/substituir-cadastro.test.ts` -- exige `referencias_cadastro()` = constantes; só roda no CI.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/dinheiro.ts` (+ teste) -- arredondar e formatar racional exato -- AD-2
- [x] `src/domain/formula.ts` (+ teste) -- schema zod, `montarFormula(fichas)`, `fichasDaFormula`, `textoDaFormula`, `avaliar`, `descreverCalculo`, `validarFormula` -- AD-11
- [x] `src/domain/projecoes.ts` (+ teste) -- `projetarPainel`
- [x] `src/domain/blocos.ts` (+ teste) -- tipo Bloco, nome, ordem, plano de gravação
- [x] `src/domain/blocos-outubro.test.ts` -- aceite de outubro/2026 com fixture de Lançamentos sem dados pessoais
- [x] `src/domain/{cadastros,mensagens}.ts` (+ testes) -- referências e textos
- [x] `supabase/migrations/20261121120000_blocos.sql`, `src/data/database.types.ts` -- tabela, RLS, índice, Realtime, RPC `salvar_bloco`, `referencias_cadastro()`
- [x] `src/data/blocos-repo.ts` (+ teste), `test/integracao/blocos.test.ts`, `substituir-cadastro.test.ts` -- gravação e CI
- [x] `src/features/painel/MontadorBloco.tsx`, `Painel.tsx` (+ testes) -- janela, cartão "Blocos" com "＋ Novo bloco" e lista simples
- [x] `sprint-status.yaml`, `deferred-work.md` -- 4.1 em `review`; pendências

**Acceptance Criteria:**
- Given as fichas Rangel, +, (, Casal, ÷, 2, ), when montadas, then a Fórmula e o passo a passo ao vivo são os do aceite e tocar numa ficha a remove.
- Given Fórmula inválida, when Rafael tenta salvar, then "Salvar" fica desativado com a razão.
- Given um Bloco salvo, when outro aparelho está aberto, then a lista dele se atualiza sem recarregar.

## Implementation Notes

- Núcleo: `formula.ts` (árvore com nó de grupo, schema zod estrito, `montarFormula` varre as fichas à esquerda e à direita e devolve o primeiro `formula.*`; `avaliar` em racional `bigint` com dimensão "R$" ou "número": `número ± R$` vale reais, `R$ × R$` e `÷ R$` são recusados), `projecoes.ts` (`projetarPainel` = `unidadesDoMes(linhasDoMes(...))`, a mesma regra da grade), `blocos.ts`, e em `dinheiro.ts` `arredondarRacional` (mesma regra de `arredondar`, testadas juntas) e os formatadores do valor exato ("R$ 2.819,675"; o que não termina sai "≈ R$ 1.666,667"). O passo a passo é `descreverCalculo(avaliacao, nomes)`; `avaliar` devolve o `calculo` com os ids de cada operando (a 4.3 e a 4.7 usam).
- Dados: `salvar_bloco` (RPC `security invoker`; `p_id` com default para a tipagem) tira `meu_bloco` do outro na mesma transação e devolve as linhas afetadas; a Fórmula entra em `referencias_cadastro()` com `conta_uso` verdadeiro (primeiro uso do ramo jsonb com contagem, ver `deferred-work.md`). `database.types.ts` à mão (`NonNullable<Json>` na coluna, como em `regras.contagem`).
- Tela: `MontadorBloco` (janela, sem campo de texto livre; o número só entra pelo campo "Número…") e `CartaoBlocos` no Painel; o botão espera `blocos` carregar e uma falha de leitura de `blocos` não derruba o Painel (importa até a migração chegar à produção).
- Não verificado aqui: migração, RPC e `test/integracao/blocos.test.ts` (sem Docker; rodam no CI); layout no iPad. `npm test` tem 2 falhas de timeout de 5 s nos testes que sobem o ESLint (`eslint-nucleo`, `eslint-formatos`), as mesmas na `main` sem esta história; passam rodando sozinhos.
## Spec Change Log

## Review Triage Log

Revisão feita por mim, na própria sessão, sobre o diff completo (sem os três revisores independentes do bmad-build: não há subagentes liberados). Pontos checados, sem defeito verificado: ordem das razões do "Salvar" (Fórmula antes do nome; `)` no começo vira `fecha_sobrando`); `(` depois de valor e dois valores seguidos (`falta_operacao`); ÷ por grupo que dá zero e por valor em R$ (recusado antes do zero); número em reais dentro de grupo; resultado fora dos inteiros seguros (`valor_grande`, sem lançar); `bigint` sem literal `0n` (alvo ES2017); `meu_bloco` único com a troca na mesma RPC e `owner_id` em todo `update`; `p_id` de outro dono recusa com `bloco.nao_encontrado`; leitura de `blocos` falhando não derruba o Painel; Montador desmonta ao fechar (estado limpo) e só abre com o Mês carregado. BOM de UTF-8 que o PowerShell pôs em dois arquivos foi tirado. Pendências reais foram para o `deferred-work.md` (CI/Docker, aplicar em produção, iPad, 4.2, previstos na barra, cadastro arquivado).
## Design Notes

**Escolhas minhas (aprovadas no checkpoint de 15/11/2026):** número é fator escalar e, somado a valor em R$, vale reais ("Valor fixo"); valor × valor e valor ÷ valor são inválidos; intermediário que não termina em decimal sai "≈ R$ 1.666,667"; até a 4.2 o Painel ganha só um cartão "Blocos" (botão + lista de nome e Fórmula).

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde
- migração e teste de integração -- expected: rodam no CI (sem Docker aqui)
