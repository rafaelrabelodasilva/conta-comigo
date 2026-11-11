---
title: 'História 3.4: Gerenciar Regras aprendidas'
type: 'feature'
created: '2026-11-10'
status: 'done'
baseline_commit: '8500580174c4425c1b4d11d4bf50b32c04f4f61b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** As Regras aprendidas (3.1) não têm tela: se o app aprendeu errado, Rafael não vê, não corrige nem apaga (FR-12). Na fila do Revisar, itens parecem duplicados porque a linha só mostra "Mês · Parcela · Valor".

**Approach:** Configurações → Regras aprendidas (lista, busca, editar com "Reaplicar aos lançamentos de Mmm/AA?", excluir com confirmação), lida pelo gerenciador de Realtime e gravada só por métodos novos de `regrasRepo`. Reaplicar usa `classificarEmLote`. Ajuste da fila (3.2/3.3): data DD/MM no item e Meses no título do grupo.

## Boundaries & Constraints

**Always:**
- **Leitura e gravação.** A tela lê só `gerenciador("regras")` (Realtime) e grava só por `regrasRepo`: `editar(id, mudanca)`, `excluir(id)` e `marcarUso(chaves)`, na mesma fila por chave do `aprender`, com otimismo. Sem migração (RLS e Realtime da `regras` já existem). Falha: desfaz e mostra `mensagem(codigo)`.
- **Lista** (Configurações → "Regras aprendidas", `?secao=regras`): chave, Responsável (com "às vezes X" se a contagem tem outros), Tipo, Divisão ("—" até a 3.8) e última vez usada; mais recentes primeiro; busca por chave, Responsável e Tipo sem acento nem maiúsculas. Vazio: "As Regras aparecem conforme você classifica os lançamentos". Toque de 44 pt, sem cor literal.
- **Editar (decisão 3-A):** só Responsável e Tipo (chave, Divisão e contagem não). Ao menos um dos dois fica preenchido. Mudar o Responsável deixa a contagem só com ele (soma das entradas antigas, mínimo 1); mudar só o Tipo não mexe na contagem; `ultimo_uso` não muda. Tudo no núcleo (`editarRegra`).
- **Reaplicar (decisões 1-A, 2-A):** depois de salvar, se alguma linha do Mês atual muda, a faixa `inline-question` pergunta "Reaplicar aos lançamentos de Mmm/AA?" (com quantos mudam), "Só este" (só a Regra) e "Aplicar a todos". Linhas = do Mês, não excluídas, não Ajuste, com `chaveDeRegra(nome) === chave`, inclusive as classificadas à mão. Grava só os campos que a edição mudou, por `classificarEmLote` (Ajustes vão junto, toast "N classificados · Desfazer" de 6 s) com `ensinar: false`: não soma contagem nem muda `ultimo_uso`. O Desfazer não desfaz a edição da Regra.
- **Excluir:** `ConfirmarAcao` ("Excluir a Regra de NOME? Os lançamentos não mudam; as próximas importações deixam de usá-la"). Sem Desfazer.
- **`ultimo_uso` na importação (decisão 4-A):** depois de importar ou reimportar, `regrasUsadas` (núcleo) diz quais Regras aplicaram ou sugeriram, e `marcarUso(chaves)` muda só o `ultimo_uso`; falha em silêncio.
- **Revisar (ajuste 3.2/3.3):** cada item mostra a data DD/MM (`Mês · DD/MM · Parcela · Valor`); itens do mesmo grupo iguais em Mês, data, parcela e valor mostram "2 de 3"; o título do grupo que cruza Meses lista os Meses. Fila, lote, Desfazer, contador, "Faltam N" e "Tudo revisado" ficam como estão. Um teste prova que cada item da fila existe no Painel do mesmo Mês, com o mesmo id.
- Manter tudo da 2.3 à 3.3 e a reimportação. Núcleo puro; textos em `mensagens.ts`; nomes do Glossário.

**Never:** migração; editar chave, contagem ou Divisão; Desfazer de exclusão de Regra; apagar ou alterar dados de produção; `supabase.from()` em tela; `console.*`; mudar `GradeLancamentos`/barra de Seleção; "criadas agora" e Importar planilha (3.10); fechar a pendência do VoiceOver.

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Vazio | sem Regras | "As Regras aparecem conforme você classifica os lançamentos" | N/A |
| Busca | "spot" | só Regras cuja chave, Responsável ou Tipo contém o termo; nada: "Nenhuma Regra encontrada" | N/A |
| Editar Responsável | Regra com contagem Casal 3 e Rafael 1 → Rafael | contagem = Rafael 4; deixa de ser "com dúvida"; `ultimo_uso` igual | `salvar.falhou` desfaz |
| Editar só Tipo | idem, Tipo novo | contagem intacta | N/A |
| Apagar os dois | Responsável e Tipo vazios | recusa, nada gravado | erro de validação |
| Reaplicar | 3 linhas do Mês com a chave, 2 diferem | pergunta "(2 mudam)"; "Aplicar a todos" grava as 2 (e Ajustes) em lote, sem ensinar; Desfazer volta | `salvar.falhou` |
| Nenhuma muda | linhas já iguais ou nenhuma | sem pergunta; só a Regra | N/A |
| "Só este" | resposta | nada além da Regra muda | N/A |
| Excluir | confirma | Regra some em todos os aparelhos; lançamentos intactos | `salvar.falhou` volta a linha |
| Importação | Regra aplicada na importação | `ultimo_uso` sobe, contagem igual | falha silenciosa |
| Revisar | 3 linhas iguais no grupo; Nome em out/26 e nov/26 | "01/10 · R$ x · 1 de 3…"; título com os dois Meses; cada id existe no Painel do seu Mês | N/A |

</frozen-after-approval>

## Code Map

- `src/data/regras-repo.ts` -- `aprender` e `listar` já existem; ganha `editar(id, mudanca)`, `excluir(id)` e `marcarUso(chaves)` (mesma fila por chave, `memoria` opcional = `gerenciador("regras")`, `gravarComOtimismo`). Única porta de gravação em `regras`.
- `src/domain/regras.ts` -- núcleo: `chaveDeRegra`, `lerContagem`, `avaliarRegra`; ganha `editarRegra`, `validarEdicaoRegra`, `filtrarRegras`, `ordenarRegras`, `entradasDaReaplicacao`, `regrasUsadas`.
- `src/data/lancamentos-repo.ts` -- `classificarEmLote(entradas, opcoes)` ganha `ensinar: false` (reaplicar não ensina nem soma contagem).
- `src/data/realtime.ts` -- `gerenciador("regras")` já funciona (tabela no Realtime, `replica identity full`); `abrirMes` só em `lancamentos`.
- `src/features/configuracoes/secoes.ts`, `src/app/(app)/configuracoes/page.tsx`, `src/domain/mensagens.ts` -- nova chave `regras`; `ROTULOS` e `TEXTOS_REGRAS`.
- `src/features/configuracoes/SecaoTipos.tsx`, `ExcluirCadastro.tsx`, `src/features/revisar/JanelaMudar.tsx`, `src/ui/{FaixaPergunta,ConfirmarAcao,Janela,Seletor,MenuAcoes,EstadoVazio}.tsx` -- padrões a copiar.
- `src/features/importar/ImportarFatura.tsx:241,320` -- lê as Regras e classifica; chama `marcarUso` depois de gravar.
- `src/domain/revisar.ts`, `src/features/revisar/ItemRevisar.tsx`, `src/domain/datas.ts`, `src/domain/painel.ts` -- ajuste da fila (data DD/MM, repetição, Meses no título, `linhasDoMes`).
- Produção (só contagens): out/26 49 linhas, nov/26 46 (42 na fila + 4 Ajustes); soma de cada Fatura = total dela; 3 grupos de linhas iguais em out/26 (3, 2 e 2), todas com `ordem_fatura` distinta; 23 Nomes aparecem nos dois Meses (59 itens). Hoje há 0 Regras.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/regras.ts` (+ teste) -- `editarRegra`, `validarEdicaoRegra`, `filtrarRegras`, `ordenarRegras`, `entradasDaReaplicacao`, `regrasUsadas` -- regras puras
- [x] `src/data/regras-repo.ts` (+ teste) -- `editar`, `excluir`, `marcarUso`, `memoria` opcional, fila por chave -- única porta de gravação
- [x] `src/data/lancamentos-repo.ts` (+ teste) -- `classificarEmLote(…, { ensinar: false })` -- reaplicar não ensina
- [x] `src/domain/mensagens.ts`, `src/features/configuracoes/secoes.ts`, `src/app/(app)/configuracoes/page.tsx` -- seção `regras` e textos
- [x] `src/features/configuracoes/SecaoRegras.tsx`, `LinhaRegra.tsx`, `JanelaEditarRegra.tsx` (+ testes jsdom) -- lista, busca, editar, pergunta, excluir
- [x] `src/features/importar/ImportarFatura.tsx` (+ teste) -- `marcarUso` depois de gravar
- [x] `src/domain/revisar.ts`, `datas.ts`, `painel.ts`, `mensagens.ts`, `ItemRevisar.tsx`, `Painel.tsx` (+ testes) -- data DD/MM, "N de M", Meses no título, `linhasDoMes`, teste fila ⊆ Painel
- [x] `test/integracao/regras.test.ts` -- editar, excluir e `marcarUso` com RLS (roda só no CI)

**Acceptance Criteria:**
- Given Regras, when Rafael abre a seção, then vê a lista com busca; sem Regras, a frase de vazio.
- Given uma edição salva com linhas a mudar, when responde, then "Só este" não toca em lançamentos e "Aplicar a todos" muda só as do Mês atual.
- Given excluir, when confirma, then a Regra some e as importações seguintes não a usam.


## Implementation Notes

- Implementado direto da spec (sem subagente). Núcleo: `editarRegra`, `filtrarRegras`, `ordenarRegras`, `outrosResponsaveisDaRegra`, `entradasDaReaplicacao`, `regrasUsadas` em `regras.ts`; `chavesDeRegrasUsadas` em `classificacao.ts`; `linhasDoMes` em `painel.ts` (o Painel passou a usá-la); `formatarDiaMes` em `datas.ts`.
- `regrasRepo` ganhou `editar`, `excluir`, `marcarUso` e `memoria`/`online` opcionais; `repoRegras()` liga `gerenciador("regras")`. `classificarEmLote` ganhou `ensinar: false`.
- Tela: `SecaoRegras`, `LinhaRegra`, `JanelaEditarRegra`; seção `regras` entre Conferência e Aparência. Mês da reaplicação = Mês atual (a seção abre esse Mês no gerenciador).
- Sem migração e sem mudança em `database.types.ts`.
- Testes de integração novos em `test/integracao/regras.test.ts` rodam só no CI (sem Docker aqui).

## Spec Change Log

## Review Triage Log

Revisão feita inline pelo agente de implementação (sem subagentes, sem pedido do Rafael para criá-los); nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| `pergunta` de reaplicar podia ficar na tela com "(0 mudam)" se outro aparelho classificasse as linhas antes | medium → patch | `SecaoRegras` só mostra a faixa com `mudariam > 0`; corrigido |
| `editar` com `regra: null` (nada mudou) fecha a janela sem aviso | low | Esperado: nada foi gravado; sem correção |
| Colunas da lista sem rótulo para VoiceOver (cabeçalho `aria-hidden`) | low → defer | Junta-se à pendência do VoiceOver (2.4/3.3) |
| `marcarUso` sem fila por chave concorre com `aprender` | false | `aprender` grava `ultimo_uso = agora` e `marcarUso` só essa coluna; a contagem não é tocada |
| Reaplicar usa o Mês atual e não o Mês que o Painel tem aberto | low | Decisão registrada nas Notas; o rótulo diz qual Mês |
