---
title: 'História 2.1: Prova técnica: ler a fatura de outubro no iPad'
type: 'feature'
created: '2026-11-03'
status: 'done'
route: 'dispatch'
baseline_commit: '8535d26c4ad02aad3629567f84650bcd3f400b28'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Todo o Épico 2 depende de o caminho pdf.js (com senha, no Safari do iPad) + Gemini ler a fatura inteira, certo e em menos de 1 minuto. Isso ainda não foi provado (AD-7).

**Approach:** Uma página de teste protegida (`/prova-fatura`, fora do menu) abre o PDF com a senha no aparelho, extrai o texto, limpa os dados pessoais pelo núcleo e chama `POST /api/fatura/extrair`. A rota faz uma chamada ao Gemini com o schema zod único do núcleo. A página mostra o resultado contra os números esperados de outubro/2026 e os tempos. A decisão fica registrada em `docs/prova-tecnica-fatura.md`.

## Boundaries & Constraints

**Always:**
- `pdfjs-dist` 5.6.x, build **legacy**, só no cliente (import dinâmico). O worker é servido pelo próprio app. A senha e o arquivo nunca saem do aparelho; só o texto limpo vai à rota.
- Núcleo puro (AD-1): `removerDadosPessoais(texto)` remove CPF, CEP e linhas de endereço e mascara números de cartão, deixando só o final de 4 dígitos. `paraCentavos("1.140,74")` fica em `dinheiro.ts`. O schema zod único `ESQUEMA_EXTRACAO` traz os valores como texto BR (créditos com `-`); a conversão para centavos e o resumo da comparação também ficam no núcleo, com `Resultado`.
- Rota `runtime = 'nodejs'`, `maxDuration = 60`. Sem sessão (`getClaims`), devolve 401. O corpo é validado por zod. A rota lê os Tipos ativos do usuário para o `tipo_sugerido`, faz **uma** chamada `generateContent` com `responseJsonSchema = z.toJSONSchema(ESQUEMA_EXTRACAO)` e valida a resposta com o mesmo schema. Não grava nada. O log vai só por `src/server/log.ts`, só com campos permitidos (duração, quantidade, status).
- `GEMINI_API_KEY` e `GEMINI_MODEL` só em `src/server` (`server-only`), sem `NEXT_PUBLIC_`. Sem a chave, a rota devolve um erro com código, sem quebrar. O CI ganha uma isca da chave no build e a confere no bundle.
- O fixture `test/fixtures/fatura-2026-10.txt` é o texto já limpo, baixado da própria página e revisado antes do commit. Nunca o PDF, CPF, endereço nem o número do cartão.
- Os textos para o usuário vêm de `mensagens.ts` ("Senha incorreta", etc.).

**Never:** nada de tabelas, migração, RPC, gravação, grade nem Conferência de verdade (fica para a 2.3 e a 2.5). Nada de PDF ou senha no repositório, no chat ou no log. Nenhuma chamada ao Gemini no CI. Nada de item no menu.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Caminho feliz | PDF de out/26 + senha certa | texto de todas as páginas → extração → quadro "esperado × lido" e tempos (abrir, servidor, total) | N/A |
| Senha errada | senha incorreta | "Senha incorreta", campo com erro, dá para tentar de novo sem escolher o PDF de novo | `PasswordException` INCORRECT_PASSWORD → código `fatura.senha_incorreta` |
| Arquivo não é PDF | outro arquivo | "Não foi possível abrir este PDF." | código `fatura.pdf_invalido` |
| Sem sessão | POST sem cookie | 401 `{ erro: 'auth.sessao_expirou' }` | não chama o Gemini |
| Sem chave | `GEMINI_API_KEY` vazio | 503 `fatura.leitura_indisponivel` | log `warn` sem texto |
| Resposta fora do schema / timeout | Gemini devolve JSON inválido ou passa de ~55 s | 502 `fatura.leitura_falhou` / 504 `fatura.tempo_esgotado` | log com o código, sem texto |
| Dados pessoais | texto com CPF `123.456.789-09`, cartão `4220 1234 5678 9012`, CEP, "RUA …" | CPF, CEP e linha de endereço somem; cartão vira `final 9012` | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/dinheiro.ts` -- `lerReais`/`formatarReais` existem; acrescentar `paraCentavos` estrito (2 casas, milhar opcional, `-` opcional).
- `src/domain/resultado.ts`, `src/domain/mensagens.ts` -- formato `Resultado` e mapa `MENSAGENS`; acrescentar os códigos `fatura.*`.
- `src/domain/tipos.ts` -- `ativos()` para filtrar os Tipos.
- `src/data/supabase/servidor.ts` -- `criarClienteServidor()`; a rota usa `auth.getClaims()` e `from("tipos").select("id,nome,arquivado")` com RLS.
- `src/server/log.ts` -- `log()` com `CAMPOS_PERMITIDOS`; não mudar a lista.
- `src/app/(app)/revisar/page.tsx` -- modelo de página protegida (`temSessao` + `redirect`, `Tela`).
- `src/app/auth/confirmar/route.test.ts` -- modelo de teste de rota (mocks de `servidor`, `next/headers`, `log`).
- `src/data/supabase/sessao.ts` -- o proxy já leva para Entrar a página sem sessão; a rota confere a sessão de novo.
- `.github/workflows/ci.yml` -- passo "Build com segredo-isca": acrescentar `GEMINI_API_KEY` com isca e incluí-la no grep.
- `.env.example` -- acrescentar `GEMINI_API_KEY=` e `GEMINI_MODEL=`.
- `package.json` -- novas dependências: `pdfjs-dist@5.6.205`, `@google/genai@2.29.1` (≥ 1.51, com mais de 2 semanas), `zod@^4`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- instalar `pdfjs-dist`, `@google/genai` e `zod` -- stack do AD-7.
- [x] `src/domain/dinheiro.ts` (+ teste) -- `paraCentavos` -- AD-2.
- [x] `src/domain/dados-pessoais.ts` (+ teste) -- `removerDadosPessoais` -- AD-7 passo 2.
- [x] `src/domain/extracao-fatura.ts` (+ teste) -- `ESQUEMA_EXTRACAO` (lançamentos: nome, data DD/MM, parcela n/total ou nula, valor, final_cartao, tipo_sugerido, duvida; fatura: vencimento, fechamento, totais; cartões: final, valor_total), `converterExtracao` → centavos, `resumirExtracao` (quantidade, soma de despesas e de créditos, soma dos cartões, diferenças contra os totais lidos) -- schema único.
- [x] `src/domain/mensagens.ts` -- códigos `fatura.*`.
- [x] `src/server/gemini.ts` + `src/server/prompt-extracao.ts` (+ teste com o SDK simulado) -- cliente `server-only`, uma chamada, prompt em português (incluir todos os cartões, créditos negativos, ignorar o pagamento da fatura anterior, parcela "02/12", escolher `tipo_sugerido` da lista ou nulo), timeout via `AbortSignal`.
- [x] `src/app/api/fatura/extrair/route.ts` (+ teste) -- POST como na matriz; resposta `{ extracao, resumo, servidor_ms }`.
- [x] `src/features/prova-fatura/ler-pdf.ts` -- abrir com senha, texto por página (quebra de linha em `hasEOL`, páginas separadas), tempo; mapeia as exceções de senha.
- [x] `src/features/prova-fatura/ProvaFatura.tsx` (+ teste jsdom) e `src/app/(app)/prova-fatura/page.tsx` -- escolher PDF, senha, "Ler fatura"; mostra o progresso, o erro, o quadro esperado × lido (49; R$ 8.327,39; R$ 639,62; soma dos cartões = despesas; sem pagamento da fatura anterior; total < 60 s), a lista lida e "Baixar texto sem dados pessoais".
- [x] `.env.example`, `.github/workflows/ci.yml` -- variáveis e isca.
- [ ] `test/fixtures/fatura-2026-10.txt` + `test/prova-fatura/fixture.test.ts` -- o fixture não tem CPF, CEP nem número de cartão; `test/prova-fatura/gemini.test.ts` só roda com `PROVA_GEMINI=1` (local, com `.env.local`) e confere os números de outubro.
- [ ] `docs/prova-tecnica-fatura.md` -- como rodar, resultados (sim/não, tempos, diferenças) e a decisão.

**Acceptance Criteria:**
- Given o deploy de produção e o login, when Rafael lê a fatura de outubro no Safari do iPad Pro, then o quadro mostra 49 Lançamentos, R$ 8.327,39, R$ 639,62, a soma dos cartões igual às despesas e o total abaixo de 1 minuto, ou mostra as diferenças.
- Given o bundle do cliente, when o CI procura a isca de `GEMINI_API_KEY`, then não a encontra.
- Given `docs/prova-tecnica-fatura.md`, when a história fecha, then ele traz o resultado e uma decisão: seguir, ajustar o prompt ou plano B.

## Design Notes

- O fixture nasce do botão "Baixar texto sem dados pessoais" (no Mac ou no iPad). Rafael guarda o arquivo e diz onde está; eu reviso o texto antes do commit. Assim o PDF e a senha nunca saem do aparelho dele.
- Sem Docker, não há login local. Para iterar no prompt sem deploy, `PROVA_GEMINI=1 node --env-file=.env.local node_modules/.bin/vitest run test/prova-fatura` usa o fixture e a função do servidor.
- A página fica até a 2.3, que a substitui pela janela de importação.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: verde.
- `SUPABASE_SECRET_KEY=sb_secret_ci_canary GEMINI_API_KEY=gemini_ci_canary npm run build && ! grep -rnE "gemini_ci_canary|sb_secret_ci_canary" .next/static` -- expected: build ok, nenhuma isca.

**Manual checks (if no CLI):**
- No Safari do iPad Pro (produção): senha errada, senha certa, quadro e tempos (roteiro em `docs/prova-tecnica-fatura.md`).

## Implementation Notes

- Feito: dependências fixadas (`pdfjs-dist` 5.6.205, `@google/genai` 2.29.1, `zod` ^4.6.7); núcleo `paraCentavos`/`ehValorDeFatura` (`dinheiro.ts`), `dados-pessoais.ts`, `extracao-fatura.ts` (schema único, `validarExtracao`, `converterExtracao`, `resumirExtracao`), `prova-fatura.ts` (esperado de outubro, `montarQuadroProva`, `formatarSegundos`); códigos `fatura.*` e textos da página em `mensagens.ts`; `src/server/gemini.ts` + `prompt-extracao.ts`; `src/data/tipos-servidor.ts` (leitura dos Tipos na rota, via `src/data`); rota, `ler-pdf.ts`, `ProvaFatura.tsx`, página; `.env.example`, CI.
- Formatos (valor, data, parcela, final) ficam em `refine` do zod: não viram `pattern` no JSON Schema mandado ao Gemini; o formato vai na `description`.
- Worker do pdf.js por `new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url)`: o build emite `/_next/static/media/pdf.worker.min.*.mjs`.
- Pendente (precisa do Rafael): o fixture `test/fixtures/fatura-2026-10.txt` (nasce do botão "Baixar texto sem dados pessoais"); `fixture.test.ts` fica pulado até ele existir. Resultados e decisão em `docs/prova-tecnica-fatura.md` estão marcados como pendentes (roteiro e estrutura prontos).
- Risco: `npm audit` acusa GHSA-hq66-cqwq-w95j (alta) em `pdfjs-dist` 5.6.x (corrigido em 6.2.108). Só afeta `enableScripting` do visualizador; aqui só `getDocument`/`getTextContent`, com `isEvalSupported: false`. A versão 5.6.x é fixada pela arquitetura.

## Spec Change Log

## Review Triage Log

| # | Revisor | Achado | Veredito | Evidência | Rota |
|---|---------|--------|----------|-----------|------|
| 1 | verification-gap, edge | Sem sessão, o proxy redireciona `/api/fatura/extrair` (307 para `/entrar`); o 401 da rota nunca chega e a tela mostra "leitura falhou" | medium | `decidirAcesso({caminho:"/api/fatura/extrair", autenticado:false})` devolve `redirecionar` (conferido); o matcher do proxy cobre `/api` | patch |
| 2 | verification-gap | Ramo `fatura.senha_vazia` da tela sem teste | low | `ProvaFatura.test.tsx` só usa `senha_incorreta` e `pdf_invalido` | patch |
| 3 | blind, edge | Nome do titular continua no texto | low | A intenção pede CPF, endereço e cartão; o nome não é exigido. Fica registrado no doc | rejeitado |
| 4 | blind, edge | Linhas de continuação do endereço (APTO, bairro, cidade sem CEP) passam | medium | `ehLinhaDeEndereco` só olha o começo da linha ou o CEP; o endereço é exigido pela intenção | patch |
| 5 | edge | CEP sem traço ("CEP 01234567") passa | low | o regex `CEP` exige `-` | patch |
| 6 | edge | Linha de Lançamento com padrão 5-3 dígitos é descartada como CEP | medium | `ehLinhaDeEndereco` descarta qualquer linha com CEP, inclusive as que começam com DD/MM; mudaria a contagem | patch |
| 7 | edge | CPF sem rótulo/sem pontuação ou com rótulo em outra linha | low | improvável na fatura impressa (CPF formatado); a revisão do fixture cobre | rejeitado |
| 8 | edge | Cartão Amex 15 dígitos | low | cartões do Santander do Rafael são 4x4; guarda nova sem caso real | rejeitado |
| 9 | blind, edge | Tempo limite de 55 s conta só depois de sessão e Tipos | low | real se sessão+Tipos > 5 s; correção é passar o tempo restante | patch |
| 10 | blind, edge | 504 da plataforma (corpo não-JSON) vira "leitura falhou" | low | `codigoDaResposta` só mapeia 401 | patch |
| 11 | blind, edge | Resposta 200 não validada no cliente (quebra o render) | medium | `corpo as RespostaExtracao` sem checagem; `montarQuadroProva` lê `resumo.quantidade` | patch |
| 12 | edge | `criarClienteServidor`/`cookies()` lançam | false | em Route Handler `cookies()` não lança; `criarClienteServidor` só devolve null sem variáveis | rejeitado |
| 13 | edge | Falha de `converterExtracao` sem detalhe no log | low | o ramo 502 não registra `detalhe` | patch |
| 14 | edge | Parcela "00/12", "13/12" e datas impossíveis passam | low | improvável e não muda a decisão da prova; guardas novas | rejeitado |
| 15 | blind, edge | `final` repetido em `cartoes` duplica linhas e chaves React | low | `finais` não remove repetidos | patch |
| 16 | edge | Cartão só com créditos some de "Por cartão" | low | só despesas entram no mapa; não muda a conferência | rejeitado |
| 17 | edge | `DEB AUT` sem FATURA dá falso positivo | low | o regex aceita `DEB AUT` sozinho | patch |
| 18 | edge | `formatarSegundos(NaN)` | false | com a validação da resposta (#11), `servidor_ms` é sempre número | rejeitado |
| 19 | edge | Download do texto no Safari do iPad pode falhar ao revogar a URL em 1 s | medium | o iPad é o aparelho do teste; revogar mais tarde é trivial | patch |
| 20 | edge | Cancelar o seletor de arquivo descarta o PDF escolhido | low | `onChange` grava `null` | patch |
| 21 | edge | Regex de cartão do teste do fixture difere do limpador (falso alarme em código de barras) | low | sem as bordas do `CARTAO` | patch |
| 22 | blind | A rota não limpa o texto de novo | low | segunda barreira barata e idempotente | patch |
| 23 | blind | Teste do fixture não confere endereço | low | só CPF, CEP e cartão | patch |
| 24 | blind | Dados lidos da fatura (vencimento, fechamento, total a pagar, dúvidas) não aparecem; doc sem as linhas de total lido | medium | necessários para julgar a leitura no iPad | patch |
| 25 | blind | Novo PDF mantém o resultado anterior na tela | low | `onChange` não limpa `resultado` | patch |
| 26 | blind | `lerNomesTiposAtivos` sem os tipos gerados do banco | low | `SupabaseClient` sem `<Database>` e `as Tipo[]` | patch |
| 27 | blind | Descrições do zod podem não chegar ao JSON Schema | false | conferido: `valor`, `parcela`, `nome` e `vencimento` saem com `description` | rejeitado (asserção barata acrescentada no #27a) |
| 27a | blind | Nenhum teste garante as descrições no schema | low | `gemini.test.ts` só confere `properties.lancamentos` | patch |
| 28 | blind | Nada confere que o worker do pdf.js é emitido no build | low | só o teste falso do nome | patch |
| 29 | blind | Testes da rota sem alguns ramos (getClaims lança, 502 de conversão) | low | cobertura menor sem defeito mostrado | rejeitado |
| 30 | blind | "Servidor (Gemini)" inclui sessão e Tipos | low | rótulo enganoso; medir `gemini_ms` à parte é simples | patch |
