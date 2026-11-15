---
title: 'História 4.5: Configurar o modelo da mensagem'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: '02e64f3'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-blocos-no-painel.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-selecionar-e-ver-o-total.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** o "Gerar mensagem" (4.6 e 4.7) precisa de um texto padrão que Rafael já escreveu à mão todo mês ("Oi / Esse mês deu R$ … / Pix … / Detalhes: …"), mas o app não tem onde guardá-lo nem como ver o resultado (FR-23, UX-DR25).

**Approach:** nova seção Configurações → Modelo da mensagem, com saudação, frase do total (marcador `{total}`), chave Pix, rodapé e caixas para os campos da linha de detalhe (Nome ou Apelido, Parcela, Valor), uma prévia ao vivo com o Mês atual, e o passo "Mensagem" no Primeiro uso, entre "Blocos" e "Ciclo do cartão". O modelo é um `jsonb` em `configuracoes`, lido e validado por um schema zod do núcleo; a prévia chama a mesma função de renderização que a 4.6 e a 4.7 vão usar.

## Boundaries & Constraints

**Always:** schema do modelo, validação, normalização, linha de detalhe, preenchimento de `{total}` e texto da prévia saem de `src/domain/modelo-mensagem.ts` (funções puras, imports relativos); a tela só chama. Textos pelo mapa único (`mensagens.ts`). Grava só pelo repositório de Configurações. Realtime só pelo gerenciador único e `useLinhas`. Schema só por migração (escrita, não aplicada); `database.types.ts` à mão no formato do gerado. Sem cor literal; sem `console.*`.

**Never:** gerar a mensagem a partir da Seleção, o quadro `message`, "Copiar" (4.6); a forma 2 por Bloco (4.7); a forma 3 de Recebimentos (Épico 7); ligar o "Gerar mensagem" ou o 💬; `gerarMensagem` ou `projetarMensagem` completos; mexer em Fórmula ou valor de Bloco; aplicar a migração em produção ou ler produção sem a confirmação do Rafael.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Modelo inicial | sem linha em `configuracoes`, ou `modelo_mensagem = {}` | quatro campos em branco, três caixas desmarcadas; a prévia mostra "O modelo está vazio. Preencha os campos para ver a mensagem." | N/A |
| Modelo do Rafael | saudação "Oi"; frase "Esse mês deu {total}"; Pix "rafaelrabelodasilva@outlook.com"; rodapé em branco; as três caixas | grava o `jsonb` completo; a prévia sai igual à forma 1 do EXPERIENCE.md (Oi / Esse mês deu R$ X / Pix … / linha em branco / Detalhes: / linhas / Total: R$ X) | N/A |
| Prévia a cada tecla | digitar em qualquer campo ou marcar uma caixa | a prévia muda na hora, com a amostra do Mês atual; nada grava | N/A |
| Mês sem nada a cobrar | Mês atual sem Lançamentos que entrariam (vazio, só R$ 0,00, pagos ou previstos) | itens de exemplo (Mercado, Celular, um estorno) e a legenda "Prévia com itens de exemplo: o Mês atual ainda não tem lançamentos a cobrar." | N/A |
| Mês com lançamentos | Mês atual com itens | até 5 itens na ordem da fatura; legenda "Prévia com N lançamentos de novembro/26. O total é o desses itens." | falha ao ler `lancamentos` ou `status`: cai nos itens de exemplo |
| `{total}` ausente | frase "Segue a conta" | permitido; aviso (não erro) "A frase não tem {total}. O valor só vai aparecer na linha “Total:” do fim."; salva | N/A |
| `{total}` repetido | "{total}, isto é, {total}" | permitido; os dois são preenchidos | N/A |
| Marcador errado | `{totl}`, `{Total}`, `{ total }`, `{valor}`, `{total`, `total}` na frase | erro no campo "Só existe o marcador {total}. Confira as chaves { }."; não salva; rascunho fica | N/A |
| Chaves fora da frase | `{` ou `}` em saudação, Pix ou rodapé | erro "As chaves { } só valem como {total}, na frase do total."; não salva | N/A |
| Campo em branco | qualquer um dos quatro | permitido: a linha some da mensagem | N/A |
| Texto longo | acima de 120 (saudação), 200 (frase), 300 (Pix) ou 500 (rodapé) caracteres, contados depois de normalizar | erro "Use até N caracteres." no campo; não salva | N/A |
| Quebras de linha | saudação, frase e Pix são de uma linha (a quebra colada vira espaço); o rodapé aceita várias, com no máximo uma linha em branco seguida | normalizado ao salvar e na prévia; CRLF vira LF | N/A |
| Nenhuma caixa marcada | algo escrito (ou caixa marcada em outro) e nenhuma caixa da linha | erro no grupo "Marque ao menos um campo da linha de detalhe."; não salva. O modelo totalmente vazio continua válido | N/A |
| Parcela marcada, item à vista | item sem parcela | o campo some da linha, sem vão ("Mercado \| R$ 159,90") | N/A |
| Outro aparelho muda o modelo | há rascunho e o salvo mudou no Realtime | o rascunho não some; aviso "Este modelo mudou em outro aparelho. Seu rascunho continua aqui." e "Usar o modelo salvo" descarta o rascunho; Salvar vale o rascunho (a última gravação vence) | N/A |
| Outro aparelho muda, sem rascunho | nada digitado | os campos mudam no lugar, sem aviso | N/A |
| Gravação recusada | banco recusa ou sem conexão | toast pelo mapa único; rascunho e campos ficam | `salvar.falhou`, `conexao.gravar_sem_conexao` |
| Jsonb ruim no banco | texto, lista, tipos errados | cada pedaço ruim vira vazio; a tela nunca quebra | N/A |
| Painel e Seleção | modelo vazio ou não | nada muda: "Gerar mensagem" e o 💬 continuam desativados | N/A |
| Primeiro uso | passo 6 de 7 | a mesma seção; "Pular" e "Continuar" só avançam; com rascunho, perguntam antes ("Voltar para salvar" ou "Descartar"); `primeiro_uso_em` continua só no último passo (Ciclo do cartão) | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/modelo-mensagem.ts` (+ teste) -- NOVO: `ModeloMensagem`, `MODELO_VAZIO`, `lerModelo` (schema zod com `catch`), `normalizarModelo`/`normalizarTexto`, `validarModelo`, `fraseSemMarcador`, `modeloEstaVazio`, `modelosIguais`, `itemDaMensagem`, `linhaDeDetalhe`, `renderizarModelo`, `amostraDoMes`, `previaDoModelo`, itens de exemplo.
- `src/domain/mensagens.ts`, `primeiro-uso.ts` (+ testes) -- textos (`TEXTOS_MODELO`, `rotuloPrevia`, códigos `modelo.*`, `ROTULOS.modelo_mensagem`, `TEXTOS_PASSO.mensagem`); passo `mensagem` entre `blocos` e `ciclo`.
- `supabase/migrations/20261123120000_modelo_mensagem.sql`, `src/data/database.types.ts` -- coluna `configuracoes.modelo_mensagem jsonb not null default '{}'` com check de objeto e tamanho.
- `src/data/configuracoes-repo.ts` (+ teste), `test/integracao/configuracoes.test.ts` -- `definirModeloMensagem`.
- `src/features/configuracoes/SecaoModeloMensagem.tsx` (+ teste), `src/ui/AreaTexto.tsx`, `secoes.ts`, `src/app/(app)/configuracoes/page.tsx`, `src/features/primeiro-uso/PassoAPasso.tsx` (+ teste) -- seção, rodapé em área de texto, lista de seções e passo.

## Tasks & Acceptance

**Execution:**
- [x] `src/domain/modelo-mensagem.ts`, `mensagens.ts`, `primeiro-uso.ts` (+ testes) -- schema, validação, render, prévia e textos no núcleo
- [x] `supabase/migrations/20261123120000_modelo_mensagem.sql`, `database.types.ts` -- coluna e check (migração só escrita)
- [x] `configuracoes-repo.ts` (+ teste), `test/integracao/configuracoes.test.ts` -- gravação pelo repositório
- [x] `SecaoModeloMensagem.tsx`, `AreaTexto.tsx`, `secoes.ts`, `page.tsx`, `PassoAPasso.tsx` (+ testes) -- seção e passo "Mensagem"
- [x] `sprint-status.yaml`, `deferred-work.md` -- 4.5 em `review`; pendências

**Acceptance Criteria:**
- Given Configurações → Modelo da mensagem, when Rafael edita, then define saudação, frase do total (com `{total}`), chave Pix e rodapé, e escolhe com caixas os campos da linha de detalhe, e o modelo fica em `configuracoes`.
- Given o modelo do Rafael montado nos campos, when olha a prévia, then ela sai no formato da forma 1 do EXPERIENCE.md, atualizada a cada tecla, com os dados do Mês atual.
- Given o modelo inicial, when abre a seção, then está vazio e o Painel e a barra de Seleção seguem como estavam.
- Given o Primeiro uso, when Rafael avança, then o passo "Mensagem" vem depois de "Blocos" e antes de "Ciclo do cartão".

## Design Notes / Decisões

**Onde o modelo mora.** Uma coluna `modelo_mensagem jsonb` (não cinco colunas de texto): o modelo evolui junto com as formas 2 e 3, grava numa só operação (um upsert, um desfazer) e o formato é do núcleo, como a Fórmula do Bloco (AD-11). O banco só garante objeto e no máximo 8 000 bytes; a validade fina é do schema zod (`lerModelo`, tolerante, cada pedaço ruim vira vazio) e de `validarModelo` (estrita, na gravação; o repositório valida de novo e recusa o que o núcleo recusar). Chaves do `jsonb` em `snake_case` sem acento: `saudacao`, `frase_total`, `chave_pix`, `rodape`, `campos: { nome, parcela, valor }`. Sem referências a ids, então não entra em `REFERENCIAS_JSONB`.

**"Detalhes:", "Total:" e "Pix".** O EXPERIENCE.md põe "Detalhes:" no modelo, mas a história só lista quatro campos. Decisão: o título "Detalhes:", o prefixo "Pix " (a chave é só a chave) e a linha final "Total: R$ X" são fixos, entram sozinhos e não são campos nem caixas (constantes em `TEXTOS_MODELO`). Aparecem só quando há ao menos uma linha de detalhe; sem linhas, ficam só o cabeçalho e o rodapé. O rodapé vem depois do "Total:", separado por uma linha em branco. A frase sem `{total}` não perde o valor, que está no "Total:" fixo: por isso é aviso e não erro. A linha de detalhe é "Nome | Parcela | Valor", na ordem fixa, separada por " | ", só com as caixas marcadas.

**Modelo inicial vazio.** Texto em branco e as três caixas desmarcadas (igual a `{}`). Um modelo com algo escrito ou marcado exige ao menos uma caixa; o vazio é válido. O que a 4.6 faz com um modelo vazio ao gerar (avisar e mandar para "Editar modelo", provavelmente) é decisão dela; aqui "Gerar mensagem" não muda.

**Prévia (contrato para a 4.6 e a 4.7).** `renderizarModelo(modelo, { detalhes: string[], totalCentavos })` só põe o modelo em volta do corpo: não filtra, não soma, não conhece Lançamento. A 4.6 decide quais itens entram (`projetarMensagem`), monta as linhas com `linhaDeDetalhe(itemDaMensagem(l), modelo.campos)` (e as de "↳ Ajuste") e passa a soma; a 4.7 monta os grupos por operando e passa o total da Fórmula. A prévia desta história usa `amostraDoMes`: até 5 unidades do Mês atual na ordem da fatura, sem R$ 0,00, previstos, Ajustes e Status que conta como pago. É só uma amostra honesta (a regra completa, com "Pago parcialmente" e Dívidas programadas, é da 4.6) e a legenda diz que o total é o dos itens mostrados. Sem nada a cobrar no Mês atual, usa três itens de exemplo, com um estorno para ver o sinal; modelo vazio mostra a dica e nenhum texto. A prévia aceita o rascunho inválido como está (o erro do campo explica).

**Salvar e rascunho.** O padrão das seções com rascunho (Ciclo, Conferência): botão "Salvar" (e Enter nos campos de uma linha), erro por campo só ao salvar e limpo ao editar, nada grava a cada tecla. Toast curto "Modelo salvo" ao gravar. `useAvisarRascunho` avisa o Primeiro uso. O texto salvo é o normalizado (sem espaço nas pontas, CRLF virou LF).

**Outro aparelho.** O rascunho guarda o modelo salvo de quando começou (`base`). Se o salvo muda no Realtime e há rascunho que difere dele, aparece o aviso e "Usar o modelo salvo"; o rascunho nunca é apagado sozinho. Salvar grava o rascunho por cima (a última gravação vence, como no resto de Configurações).

**Acessibilidade.** Rótulos visíveis ligados aos campos; ajuda e aviso por `aria-describedby`; as três caixas num `fieldset` com `legend`, cada linha com 44 pt de altura e a linha toda como alvo; foco visível pelo estilo global. A prévia é uma região nomeada ("Prévia") e focável (`tabIndex=0`), sem `aria-live`: o texto muda a cada tecla, e um anúncio a cada tecla atrapalharia mais do que ajuda (um `aria-live` educado com debounce ainda leria o texto inteiro de novo). Lê-se sob demanda, ao navegar até a região. O aviso de "mudou em outro aparelho" é `role="status"`.

**Limites.** Saudação 120, frase 200, Pix 300 (cabe e-mail, chave aleatória e "copia e cola" curto), rodapé 500 caracteres. Sem `maxLength` no campo: o erro explica em vez de cortar o que foi colado.

**Fora do Primeiro uso.** O passo "Mensagem" mostra a seção como está (com a prévia), com "Pular" e "Continuar". A lista de seções de Configurações ganhou "Modelo da mensagem" depois de "Regras aprendidas".

## Spec Change Log

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- verde; os 2 timeouts conhecidos de `eslint-nucleo` e `eslint-formatos` aparecem na suíte inteira e passam rodando sozinhos
- migração e `test/integracao/configuracoes.test.ts` -- rodam no CI (job `supabase`); sem Docker nem Supabase CLI aqui

**Não verificado aqui:** a migração (sintaxe e check no Postgres), a igualdade de `database.types.ts` com `supabase gen types` e a integração (só no CI); layout da seção e da prévia em duas colunas no iPad e no PC (o jsdom não tem layout); o toque de 44 pt e o foco visível de verdade; VoiceOver lendo o grupo de caixas, a legenda e a região da prévia; o aviso de outro aparelho com dois aparelhos reais.
