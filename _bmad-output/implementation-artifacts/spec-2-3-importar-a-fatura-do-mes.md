---
title: 'História 2.3: Importar a fatura do Mês'
type: 'feature'
created: '2026-11-03'
status: 'done'
route: 'dispatch'
baseline_commit: '1dd07bce0ee68191c648afc9d1823648fff39f62'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A leitura da fatura foi provada na 2.1, mas nada é gravado: não existem `faturas`, `fatura_cartoes` nem `lancamentos`, e a única tela é a página de teste `/prova-fatura` (FR-3, FR-4, FR-5).

**Approach:** "＋ Importar fatura" no topo do Painel abre a janela de 3 passos (PDF, senha, conferir). Ela reaproveita a leitura da 2.1 (pdf.js 5.6 por `streamTextContent().getReader()`, `removerDadosPessoais`, a rota com nova tentativa no 503). O núcleo prepara as linhas e a Conferência, e a RPC atômica `importar_fatura` grava tudo ou nada. `/prova-fatura` sai.

## Boundaries & Constraints

**Always:**
- Migração única cria `faturas`, `fatura_cartoes` e `lancamentos` com as colunas da história, `owner_id default auth.uid()`, RLS por dono, `updated_at` pelo banco, `replica identity full` e publicação no Realtime. Os valores ficam em `*_centavos integer`, as datas em `date` e `mes` em `AAAA-MM`. `lancado_por` é um enum. `responsavel_id`, `tipo_id` e `status_id` são FKs compostas por dono e entram em `referencias_cadastro()` e em `REFERENCIAS_COLUNAS` com `conta_uso = true`.
- RPC `importar_fatura` (`security invoker`): grava a Fatura, os cartões e as linhas numa transação, com `lancado_por = 'fatura'` e `status_id = configuracoes.status_padrao_id`, e devolve as linhas gravadas. Mês que já tem Fatura → `fatura.mes_ja_importado`. Ela recebe também o `updated_at` mais novo lido dos Lançamentos do Mês e recusa com `fatura.mes_mudou` se o Mês mudou.
- O núcleo calcula tudo antes da RPC: `normalizarNome` (maiúsculas, sem acento, espaços colapsados), o Mês e as datas completas (ano da linha DD/MM = o do vencimento, ou o anterior se a data passar do vencimento), `ordem_fatura` (ordem do PDF), créditos negativos, a Conferência geral e por cartão, "não parece Santander" e "extração incompleta" (soma das despesas ou dos créditos abaixo do total lido).
- `removerDadosPessoais` também troca o nome do titular e dos adicionais por `TITULAR` (o nome vem de "Olá, …!" e dos cabeçalhos "NOME - final NNNN") e tira o "final NNNN" da conta no bloco do débito automático. Linhas de Lançamento nunca mudam. O fixture `test/fixtures/fatura-2026-10.txt` é regerado com essa limpeza.
- Janela: o progresso mostra "Abrindo PDF", "Lendo lançamentos", "Conferindo" e "Classificando". Um PDF sem senha pula o passo 2. O passo 3 mostra "Fatura de outubro · vence 06/10/26", a Conferência e quantos Lançamentos serão gravados. "Cancelar" aborta e não grava, mas fica desligado enquanto a RPC grava. Falha da leitura (503 esgotado, tempo esgotado, conexão) mostra a mensagem com "Tentar de novo", que reenvia o mesmo texto limpo sem pedir PDF e senha.
- Painel provisório (decisão do Rafael, 03/11/2026), até a grade da 2.4: um cartão por Fatura importada ("Fatura de outubro/26 · vence 06/10/26 · 49 lançamentos", despesas e créditos) e uma lista simples dos Lançamentos (data, Nome, Parcela, Valor, final do cartão) na ordem da fatura. Os dados vêm dos gerenciadores de Realtime, sem recarregar.
- Toda gravação passa por um repositório em `src/data`, que aplica as linhas devolvidas nos gerenciadores de `faturas`, `fatura_cartoes` e `lancamentos`. Os textos vêm de `mensagens.ts`, e valores e datas saem só pelos formatadores da 2.2.

**Never:** PDF, senha, texto ou nomes no log. Nenhuma classificação (Regras, `tipo_sugerido` gravado, fila do Revisar), Ajuste, reimportação, grade da 2.4 nem troca de Mês. Nenhuma mudança no pdf.js (continua 5.6.205) nem na chave do Gemini. Nenhuma chamada ao Gemini no CI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Outubro | extração de out/26 (fixture JSON) | passo 3: "Fatura de outubro · vence 06/10/26", 49 Lançamentos, ✓ Conferido (R$ 8.327,39 / R$ 639,62); confirmar grava 1 Fatura, 5 cartões e 49 linhas, e o Painel mostra sem recarregar | N/A |
| Crédito | "-0,08" | `valor_centavos = -8` | N/A |
| Senha errada | senha incorreta | "Senha incorreta" no campo, nova tentativa sem escolher o PDF | `fatura.senha_incorreta` |
| Não é Santander | texto sem as marcas da fatura Santander | "Este PDF não parece ser uma fatura do Santander. Confira o arquivo" com "Escolher outro PDF", sem chamar o Gemini | `fatura.nao_santander` |
| Incompleta | soma das despesas < total lido | "Não conseguimos ler todos os lançamentos (lemos N)…" com "Importar mesmo assim" e "Cancelar" | N/A |
| Mês já importado | já existe Fatura no Mês | aviso, sem botão de gravar | `fatura.mes_ja_importado` (também pela RPC) |
| Conexão cai / Cancelar | falha de rede ou toque em Cancelar | "A conexão caiu. Nada foi gravado. Tentar de novo" / janela fecha; nada gravado | transação desfeita |
| 503 esgotado | Gemini ocupado depois de 2 tentativas | mensagem de sobrecarga com "Tentar de novo" (mesmo texto) | `fatura.leitura_ocupada` |
| Linha inválida | uma linha viola restrição na RPC | nenhuma linha, cartão ou Fatura gravados | erro → `salvar.falhou` |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20261102140000_status_configuracoes.sql` -- modelo de tabela (RLS, `definir_updated_at`, `replica identity full`, publicação), `referencias_cadastro()`, `contar_usos_cadastro` e `substituir_cadastro`. O ramo "em uso" desses dois nunca rodou (pendência da 1.6) e passa a ter teste.
- `src/domain/cadastros.ts` -- `REFERENCIAS_COLUNAS`: acrescentar as 3 colunas de `lancamentos`.
- `src/domain/extracao-fatura.ts` -- `ESQUEMA_EXTRACAO`, `converterExtracao`, `resumirExtracao` e `parecePagamentoDeFatura`: reaproveitar, sem mudar o schema.
- `src/domain/dados-pessoais.ts` (+ teste) -- acrescentar o nome do titular e a conta do débito.
- `src/domain/datas.ts`, `ciclo.ts` (`ehMes`, `ehData`), `dinheiro.ts` (`formatarDinheiro`) -- formatadores; a parcela "02/12" ganha `formatarParcela` no núcleo.
- `src/domain/prova-fatura.ts`, `mensagens.ts` (`TEXTOS_PROVA_FATURA`, `ITENS_QUADRO_PROVA`) -- saem com a página; `ESPERADO_OUTUBRO_2026` vai para o novo módulo de importação.
- `src/features/prova-fatura/ler-pdf.ts` (+ teste) -- vai para `src/features/importar/`, sem mudar a leitura.
- `src/features/prova-fatura/ProvaFatura.tsx` -- a chamada à rota (`codigoDaResposta`, `ehRespostaExtracao`, `resposta.redirected`) é reaproveitada na janela; o resto sai.
- `src/app/api/fatura/extrair/route.ts`, `src/server/gemini.ts` -- já tentam de novo no 503 (`ESPERAS_503_MS`); não mudam.
- `src/data/realtime.ts` (`gerenciador`, `useLinhas`), `gravacao.ts` (`semConexao`, `FALHOU`), `tipos-repo.ts` -- modelo do repositório.
- `src/app/(app)/page.tsx` -- Painel: a página do servidor continua decidindo o Primeiro uso e passa a desenhar um componente cliente de `src/features/painel/`.
- `src/ui/Janela.tsx`, `Botao.tsx`, `Campo.tsx`, `EstadoVazio.tsx` -- peças da janela. Ainda não há `progress`: a barra segue o DESIGN.md (4 px, `accent-line` sobre `border`).
- `_bmad-output/planning-artifacts/ux-designs/ux-conta-comigo-2026-11-01/mockups/importar.html` -- mockup da janela; textos no EXPERIENCE.md (linhas 150 e 215 a 220).
- `test/integracao/apoio.ts` (`limpar`, `esperarEvento`), `test/backup/dados-exemplo.sql` (toda tabela precisa de linha), `.github/workflows/ci.yml` (o nome do passo de integração lista as áreas) e `src/data/database.types.ts` (o CI compara com o gerado).

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20261103120000_faturas_lancamentos.sql` -- tabelas, enum, índices, RLS, Realtime, referências e RPC -- AD-5, AD-7, AD-14, AD-16.
- [x] `src/data/database.types.ts` -- tabelas, enum e RPC no formato do gerador -- o CI compara.
- [x] `src/domain/dados-pessoais.ts` + teste, `test/fixtures/fatura-2026-10.txt`, `test/prova-fatura/fixture.test.ts` -- nome e conta fora; o fixture já sai limpo.
- [x] `test/fixtures/extracao-2026-10.json` -- extração de outubro gravada uma vez localmente (`PROVA_GEMINI=1`), já em centavos -- aceite sem Gemini.
- [x] `src/domain/importacao-fatura.ts` + teste -- `normalizarNome`, `pareceFaturaSantander`, `prepararImportacao` (Mês, datas, ordem, corpo da RPC), `conferirImportacao` (geral, por cartão, incompleta), `formatarParcela` e o aceite de outubro.
- [x] `src/domain/cadastros.ts`, `mensagens.ts` -- referências, códigos e textos novos; os da prova saem.
- [x] `src/data/faturas-repo.ts` + teste -- `importar()` pela RPC, que aplica o lote nos 3 gerenciadores e mapeia os erros.
- [x] `src/features/importar/` (`ler-pdf.ts`, `extrair.ts`, `ImportarFatura.tsx` + teste jsdom) -- passos, progresso, estados da matriz e "Tentar de novo".
- [x] `src/features/painel/` + `src/app/(app)/page.tsx` (+ teste) -- botão "＋ Importar fatura", cartão por Fatura e lista simples.
- [x] Remover `src/app/(app)/prova-fatura/`, `src/features/prova-fatura/` e `src/domain/prova-fatura.ts`; `test/prova-fatura/gemini.test.ts` passa a usar a constante nova.
- [x] `test/integracao/faturas.test.ts`, `apoio.ts`, `substituir-cadastro.test.ts` -- outubro gravado e devolvido, Status padrão aplicado, créditos negativos, tudo ou nada, Mês repetido, `mes_mudou`, RLS de outro dono, evento do Realtime e os ramos "em uso" com Lançamentos.
- [x] `test/backup/dados-exemplo.sql`, `.github/workflows/ci.yml`, `docs/prova-tecnica-fatura.md` -- linhas de exemplo, nome do passo e nota de que a página virou a janela.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- fecha as pendências do nome do titular e do "em uso"; registra o ano das parcelas compradas há mais de 12 meses.

**Acceptance Criteria:**
- Given o deploy de produção, when Rafael importa a fatura de outubro no Safari do iPad Pro, then o passo 3 mostra vencimento, Mês, Conferência e 49 Lançamentos, e o Painel mostra a Fatura sem recarregar, tudo em menos de 1 minuto.
- Given o texto enviado à rota, when ele é inspecionado nos testes, then não há CPF, endereço, cartão completo, nome do titular nem conta do débito.
- Given `npm run lint`, when roda, then não sobra referência a `prova-fatura`.

## Implementation Notes

- Feito pelo subagente de implementação e revisado no diff: migração com `responsaveis`/`tipos` ganhando `unique (owner_id, id)` para as FKs compostas; RPC com trava `pg_advisory_xact_lock` por dono e Mês; `database.types.ts` escrito à mão (sem Docker), conferido só pelo CI.
- Fixture `test/fixtures/extracao-2026-10.json` gravado com o Gemini real sobre o fixture de texto novo (49; 832739 / 63962). Na verificação final, o teste `PROVA_GEMINI=1` deu 49, R$ 8.327,39, R$ 639,62, cartões = despesas, 44 s.
- O crédito que parece pagamento da fatura anterior sai no núcleo (`lancamentosDaFatura`), mesmo se a leitura o trouxer.
- Não rodou aqui (sem Docker): migração, RPC, integração, comparação dos tipos e backup. Ficam com o CI.
- Depois do merge, a pedido do Rafael (03/11/2026): o passo 3 e o cartão do Painel mostram o "Total a pagar" lido e a conta `comporTotalAPagar` (soma dos Lançamentos + saldo anterior − pagamentos, com "✓ Bate" ou a diferença), e a lista do Painel ganhou a linha "Total dos lançamentos". Outubro: R$ 7.687,77 + R$ 7.483,11 − R$ 7.457,21 = R$ 7.713,67.

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | blind, edge | Extração com 0 Lançamentos oferece "Importar mesmo assim" e grava Fatura vazia que bloqueia o Mês | medium | `incompleta` não impede gravar; `unique (owner_id, mes)` e sem reimportação nesta história | patch |
| 2 | blind | "Nada foi gravado" pode ser falso se a resposta se perde depois do commit; a memória fica sem a Fatura | low | `catch` → `fatura.conexao_caiu`; a nova tentativa recebe `mes_ja_importado` | patch (recarrega os gerenciadores) |
| 3 | blind, edge | Parcela 00/12, 13/12 ou Nome > 200 só falham no banco como `salvar.falhou` | low | real, mas o Gemini devolve "02/12" da fatura; a correção acrescenta guardas | rejeitado |
| 4 | blind | Ano da data cortado pelo vencimento, não pelo fechamento | low | 01/10 com fechamento 29/09 é parcela de 2025; conferido no fixture (4 linhas depois do fechamento, todas parcelas) | patch |
| 5 | blind, edge | `mes_mudou` falso se o gerenciador de Lançamentos ainda carrega | low | latente nesta história (só Faturas criam linhas), real a partir da 2.7 | patch |
| 6 | blind, edge | JWT expirado do PostgREST vira `salvar.falhou`; no passo 3 `auth.sessao_expirou` mostra "Tentar de novo" | low | `codigoDoErro` só reconhece o código da RPC | patch |
| 7 | blind | FK `lancamentos (owner_id, fatura_id)` sem índice; sem regra `on delete` | low | o índice parcial começa por `fatura_id` e ignora excluídas; nenhum fluxo apaga Fatura | patch (índice); `on delete` rejeitado |
| 8 | blind | Final da conta na própria linha do título do débito; teste do fixture corta a última linha com `slice(…, -1)` | low | o título no fixture não tem a conta (só o teste está errado); Lançamento com nome fica por regra da spec | patch (teste); resto rejeitado |
| 9 | blind | Painel sem Fatura esconde Lançamentos sem Fatura; dois botões "Importar fatura" | low | não há Lançamentos sem Fatura nesta história (só no exemplo do backup); os dois botões são reais | patch (um botão); resto false |
| 10 | blind | Registros desatualizados (sprint-status, deferred do pdf.js e do 503, doc da prova) | low | o sprint-status anda no fim; as pendências do pdf.js e do 503 seguem abertas por decisão do Rafael; o doc descrevia a página no presente | patch (doc) |
| 11 | blind, verif | Ramo `unique_violation` da RPC sem teste de concorrência | low | a trava consultiva já serializa; testar exige harness de concorrência | defer |
| 12 | verif | Nenhum teste confere o INSERT de `faturas` no Realtime de outro aparelho | medium | só `lancamentos` é esperado em `faturas.test.ts` | patch |
| 13 | verif, edge | `mesJaImportado` sem uso em produção | low | a janela confere por `useLinhas` | patch (removido) |
| 14 | verif | `detalhe` com índice depois do filtro do pagamento | low | `entries()` sobre a lista filtrada | patch |
| 15 | edge | Mais de 1000 Lançamentos: o `select("*")` do gerenciador corta no limite do PostgREST | medium | gerenciador da 1.4 lê a tabela inteira; chega em ~20 meses | defer |
| 16 | edge | `prepararImportacao` pode lançar com resposta malformada e travar a janela | low | a rota valida pelo zod e converte; a resposta é da própria rota | rejeitado |
| 17 | edge | Bloco do débito apaga "final NNNN" de cabeçalho de cartão dentro dele | low | `FINAL_CONTA` em qualquer linha das 15 | patch (só linha "final NNNN" sozinha) |
| 18 | edge | Primeiro nome do titular trocado em linhas que não são Lançamento | false | é o objetivo da limpeza; linhas de Lançamento ficam | rejeitado |
| 19 | edge | Cabeçalho "TOTAL - final 1234" vira nome e corrompe "Total" no texto | low | `CABECALHO_CARTAO` aceita uma palavra | patch (nome de cabeçalho com 2+ palavras) |
| 20 | edge | Dois toques em Importar disparam duas RPCs | low | `gravando` do estado só muda no próximo render | patch (ref) |
| 21 | edge | "29/02" num ano não bissexto derruba a importação | low | `ehData` falha e devolve null | patch (recua até 4 anos) |
| 22 | edge | Sem "Baixar texto sem dados pessoais" não há como regerar o fixture de um PDF novo | low | a página saiu por decisão da spec; o fixture atual é regerado pela função | rejeitado |
| 23 | edge | `test/prova-fatura/` ainda usa o nome antigo | low | o critério fala do código; os testes da prova continuam válidos | rejeitado |
| 24 | edge | A limpeza da conta depende do layout do bloco do débito | low | coerente com a spec; outro layout pede outro fixture | rejeitado |

## Design Notes

- A RPC só grava o que o núcleo calculou. A única leitura que ela faz é o Status padrão, porque `configuracoes` é a verdade do banco no momento da gravação.
- O fixture JSON deixa o aceite de outubro (núcleo e integração no CI) determinístico. O Gemini de verdade só roda local, para conferir que a limpeza nova do nome não piorou a leitura.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde.
- `PROVA_GEMINI=1 node --env-file=.env.local node_modules/.bin/vitest run test/prova-fatura` -- expected: 49, R$ 8.327,39, R$ 639,62 com o fixture novo.
- `SUPABASE_SECRET_KEY=sb_secret_ci_canary GEMINI_API_KEY=gemini_ci_canary npm run build` -- expected: build ok.
- Integração, tipos do banco e backup -- só no CI (sem Docker no Mac).

**Manual checks (if no CLI):**
- No Safari do iPad Pro (produção), pelo roteiro passado ao Rafael.
