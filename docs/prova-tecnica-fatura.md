# Prova técnica: ler a fatura de outubro no iPad (História 2.1)

Valida o caminho do AD-7 antes de construir a importação: o PDF abre com a senha no Safari do iPad (pdf.js legacy), o texto é limpo de dados pessoais no aparelho e uma chamada ao Gemini lê a fatura inteira, certa e em menos de 1 minuto. Nenhum segredo fica neste arquivo.

## Como funciona

- Página `/prova-fatura` (protegida, fora do menu): escolher o PDF, digitar a senha e tocar em **Ler fatura**.
- O navegador abre o PDF com `pdfjs-dist` 5.6.205 (build legacy, import dinâmico, worker servido pelo próprio app em `/_next/static`), extrai o texto de todas as páginas e roda `removerDadosPessoais` do núcleo (CPF, CEP e linhas de endereço somem; o cartão vira `final NNNN`). O PDF e a senha nunca saem do aparelho.
- Só o texto limpo vai para `POST /api/fatura/extrair` (Node, `maxDuration = 60`, sessão obrigatória). A rota lê os Tipos ativos, faz **uma** chamada `generateContent` com `responseJsonSchema = z.toJSONSchema(ESQUEMA_EXTRACAO)` e valida a resposta com o mesmo schema. Não grava nada; o log leva só código, status, duração e quantidade.
- A página mostra o quadro **esperado × lido** (49 Lançamentos; despesas R$ 8.327,39; créditos R$ 639,62; soma dos cartões = despesas; nenhum pagamento da fatura anterior; total < 60 s), os tempos (abrir o PDF, servidor, só o Gemini, total), os dados lidos da fatura (vencimento, fechamento, saldo anterior, pagamentos, total a pagar), os Lançamentos com dúvida, a soma por cartão e a lista lida.
- **Baixar texto sem dados pessoais** salva o texto exatamente como foi mandado à rota. É daí que nasce o fixture.

## Preparar (uma vez, Rafael)

1. Criar a chave no Google AI Studio (plano gratuito; desvio de privacidade aceito em 01/11/2026, AD-7 item 7).
2. Na Vercel, em **Production**: `GEMINI_API_KEY` = a chave e, se quiser fixar o modelo, `GEMINI_MODEL` (vazio usa `gemini-flash-latest`). Nunca com prefixo `NEXT_PUBLIC_`, nunca no repositório nem no chat.
3. Para rodar local, as mesmas duas variáveis num `.env.local` (fora do git).

Sem a chave, a rota responde 503 `fatura.leitura_indisponivel` e a página mostra "A leitura de faturas está indisponível agora." (o texto limpo ainda pode ser baixado).

## Roteiro no iPad Pro (produção)

1. Abrir o app instalado (ou o Safari), entrar e ir para `/prova-fatura` digitando o endereço.
2. Escolher o PDF da fatura de outubro/2026 (vence 06/10/26).
3. **Senha errada:** digitar uma senha errada e tocar em Ler fatura. Esperado: "Senha incorreta" com o campo em vermelho. Corrigir a senha **sem escolher o PDF de novo** e ler.
4. **Senha certa:** conferir o quadro, os tempos e a lista. Anotar os números abaixo.
5. Tocar em **Baixar texto sem dados pessoais**, guardar o arquivo e dizer onde ele está. Antes do commit, o texto é revisado (sem CPF, CEP, endereço, número de cartão) e vira `test/fixtures/fatura-2026-10.txt`.
6. (Opcional) Repetir no PC para comparar os tempos.

## Iterar no prompt sem deploy

Com o fixture no repositório e o `.env.local` preenchido:

```bash
PROVA_GEMINI=1 node --env-file=.env.local node_modules/.bin/vitest run test/prova-fatura
```

Usa `extrairFatura` do servidor com o texto do fixture e confere os números de outubro. Sem `PROVA_GEMINI=1` o teste fica pulado; o CI nunca chama o Gemini. O teste `fixture.test.ts` (sempre ligado quando o arquivo existe) garante que o fixture não tem CPF, CEP nem número de cartão.

## Resultados

> Pendente: preencher depois da leitura no iPad.

| Item | Esperado | Lido no iPad | Bateu? |
| --- | --- | --- | --- |
| Lançamentos | 49 | | |
| Soma das despesas | R$ 8.327,39 | | |
| Soma dos créditos | R$ 639,62 | | |
| Total de despesas da fatura | R$ 8.327,39 | | |
| Total de créditos da fatura | R$ 639,62 | | |
| Soma dos cartões = despesas | igual | | |
| Pagamento da fatura anterior na lista | 0 | | |
| Lançamentos com dúvida | — | | |
| Senha errada avisada e nova tentativa sem reescolher o PDF | sim | | |
| Tempo para abrir o PDF | — | | |
| Tempo do servidor (sessão, Tipos e Gemini) | — | | |
| Tempo só do Gemini | — | | |
| Tempo total | < 60 s | | |

Diferenças encontradas: (pendente)

Modelo usado (`GEMINI_MODEL`): (pendente)

## Decisão

> Pendente: escolher uma depois dos resultados.

- [ ] **Seguir:** tudo bateu e o total ficou abaixo de 1 minuto. A 2.3 reaproveita o schema, `removerDadosPessoais`, `paraCentavos` e a rota.
- [ ] **Ajustar o prompt:** a leitura é quase certa; ajustar `src/server/prompt-extracao.ts` com o fixture e o teste local até bater, e repetir no iPad.
- [ ] **Plano B:** a leitura não é confiável ou é lenta demais; leitor próprio do PDF (AD-7, "Deferred").

## Riscos conhecidos

- `pdfjs-dist` 5.6.x tem o alerta GHSA-hq66-cqwq-w95j (execução de JavaScript de um PDF malicioso quando `enableScripting` está ligado no visualizador, corrigido na 6.2.108). Aqui só se usa `getDocument` + `streamTextContent`, sem o visualizador (`pdf_viewer`), com `isEvalSupported: false`, e só se abre a fatura do próprio Santander. A arquitetura fixa 5.6.x; avaliar a 6.x antes da 2.3.
- O nome do titular não é removido do texto: a intenção pede só CPF, endereço e número do cartão. Ele vai ao Gemini e ao fixture (revisar antes do commit se deve sair).
- A rota roda `removerDadosPessoais` de novo no texto recebido (segunda barreira) e dá ao Gemini só o tempo que sobra dos 55 s.
- **Safari 18 (Mac e iPad):** o `getTextContent()` do pdf.js 5.6 percorre o texto com `for await` sobre `ReadableStream`, que o Safari não suporta (o PDF abria e a leitura falhava como "Não foi possível abrir este PDF."). O texto é lido por `streamTextContent().getReader()` (PR #21).
- **Gemini gratuito com "alta demanda" (503):** em 03/11/2026 o `gemini-3.8-flash` respondeu 503 em todas as tentativas e o `gemini-3.6-flash` alternou entre responder e 503. A rota refaz a mesma chamada até 2 vezes (esperas de 2 s e 4 s) enquanto sobrar tempo; se continuar 503, a página mostra "A leitura está sobrecarregada agora. Tente de novo em alguns minutos." Modelo escolhido: `gemini-3.6-flash`.
- O tempo do Gemini Flash depende do modelo e do "pensamento" ligado por padrão. Se o total passar de 1 minuto, testar outro `GEMINI_MODEL` antes de mexer no código.
