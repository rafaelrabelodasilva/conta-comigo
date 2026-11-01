---
title: "Revisão da espinha — rubrica e reconciliação de entradas"
target: ../ARCHITECTURE-SPINE.md
reviewer: revisor independente de arquitetura
date: 2026-11-01
inputs:
  - ../../../prds/prd-conta-comigo-2026-11-01/prd.md
  - ../../../ux-designs/ux-conta-comigo-2026-11-01/EXPERIENCE.md
  - ../../../ux-designs/ux-conta-comigo-2026-11-01/DESIGN.md
  - ../.memlog.md
---

# Revisão da espinha — Conta Comigo

## Veredito

A espinha é boa no núcleo: o paradigma (núcleo puro + casca), dinheiro em centavos, Supabase como fonte única, gravação atômica da importação, Série de parcelas e Fórmula como árvore fixam as principais divergências entre telas. Mas ela **ainda não está pronta para quebrar em epics**: o envelope operacional (backup, limites do plano gratuito, pausa do projeto) está quase todo ausente, algumas regras não fecham a divergência que prometem (Status × Pagamento, exclusão, reimportação com Pagamentos, arredondamento da Divisão, Edge Function em Deno importando o núcleo) e a pergunta que o PRD delegou à arquitetura (IA no FR-11) não foi respondida.

| Severidade | Quantidade |
| --- | --- |
| Crítica | 1 |
| Alta | 9 |
| Média | 11 |
| Baixa | 10 |

---

## Parte A — Rubrica

### A.1 Pontos de divergência fixados

Bem fixados: lugar das regras (AD-1), dinheiro (AD-2), fonte da verdade e offline (AD-3), estado derivado (AD-4), isolamento (AD-5), identidade do Lançamento (AD-6), importação atômica (AD-7), Série (AD-8), Mês/fuso (AD-9), Fórmula (AD-11), segredos (AD-12), schema (AD-14). As convenções (nomes, erros, validação, gravação por repositório/RPC) também cortam divergências reais.

Faltam ou estão incompletos: verdade única de "pago" (F-H2), política de exclusão/arquivamento/Desfazer (F-H7), materialização das Contas manuais recorrentes (F-H8), identidade da Série (F-M1), representação da Divisão na Regra (F-M2), assinatura Realtime única e ressincronização (F-H6), dono do service worker (F-M4), biblioteca de estado (F-M3), granularidade da gravação entre aparelhos (F-M10).

### A.2 Regras aplicáveis e eficazes

- AD-1 não é aplicável na prática para a Edge Function sem uma regra de resolução de módulos (F-H1). Sugere-se também um lint de fronteira (`eslint-plugin-boundaries` ou `dependency-cruiser`) para tornar a tabela de camadas verificável.
- AD-2 deixa "o resto vai para a última parte" ambíguo e pode contradizer o exemplo do PRD (F-H9).
- AD-3 + AD-4: "gravação otimista" convive com "gravação feita só quando o banco confirma"; está aceitável porque a tela desfaz, mas a regra do LWW precisa dizer que a atualização envia só as colunas alteradas (F-M10).
- AD-8 cita "Lançamentos não excluídos" sem existir decisão de exclusão lógica (F-H7).
- AD-10 não diz qual dado manda quando Status e `pagamento_itens` discordam (F-H2).

### A.3 Deferred que permite divergência

- "Biblioteca de estado de tela: a funcionalidade escolhe" — deixa cada área escolher uma biblioteca e uma estratégia de cache diferentes (F-M3).
- "Cache de leitura sem internet … fica com a story da PWA" — o mesmo service worker é necessário para Web Push (FR-55); duas stories vão editar o mesmo arquivo com donos diferentes (F-M4).
- "Pipeline de CI … na primeira story de infraestrutura" — aceitável, mas sem um gate mínimo fixado (testes de aceite + `supabase db push` só por CI) as stories anteriores divergem em como aplicam migrações (F-M5).
- Os demais itens deferidos (leitor próprio, iPhone, fases 2/3, busca global, modelo exato do Gemini) não criam divergência.

### A.4 Cobertura de capacidades (v1)

O `binds` e o mapa de capacidades cobrem FR-1 a FR-36 e FR-44 a FR-55; as fases 2/3 (FR-37 a FR-43) estão corretamente fora. Lacunas:
- FR-11 aparece no mapa, mas a decisão que o PRD delegou (§10, pergunta 1) não foi tomada (F-H5).
- FR-2 (planilha) não tem formato de entrada, biblioteca nem transação definidos (F-M7).
- FR-33 (gráficos) e o "Reordenar" por arrastar não têm biblioteca na Stack (F-L7).
- Primeiro uso (FR-1) e estado "Mês fechado/aberto" (FR-36) não estão no mapa, mas são deriváveis — sem achado.

### A.5 Dimensões da altitude — envelope operacional

| Dimensão | Situação na espinha | Achado |
| --- | --- | --- |
| Ambientes e deploy | Produção / Preview / local definidos, mas Preview "local ou dev" é ambíguo | F-M5 |
| Estratégia de provedor | Vercel + Supabase + Gemini decididos | — |
| Limites e custo do plano gratuito | Não tratados (pausa do Supabase, tempo de função da Vercel, cota do Gemini) | F-C1, F-M6 |
| Backup e recuperação | **Ausente** | F-C1 |
| Segredos | AD-12 cobre Vercel e Edge Functions; falta o segredo do pg_cron → Edge Function | F-L3 |
| Operação e monitoramento | Deferido; falta regra de privacidade dos logs | F-L10 |
| Desempenho | NFR "< 1 min" não tem dono | F-M6 |

---

## Parte B — Reconciliação com PRD e UX

| Requisito / restrição de entrada | Onde está | Situação na espinha |
| --- | --- | --- |
| Precisão: centavos, sem perda ou duplicação | PRD §6 | AD-2, AD-7, AD-8 ✓; Divisão ambígua (F-H9); reimportação com Pagamentos (F-H3) |
| PDF e senha nunca guardados | PRD §6, FR-3, FR-4 | AD-7 ✓ (senha e arquivo ficam no aparelho; rota sem log) |
| Privacidade: dados só do Rafael | PRD §6 | Contradição não registrada com o Gemini gratuito (F-H4) |
| Importar e classificar ~50 em < 1 min | PRD §6 | Sem dono nem orçamento de tempo (F-M6) |
| Formatos DD/MM/AA, HH:MM, R$ 1.140,74, "- R$ 0,08" | PRD §6, EXPERIENCE | Convenção ✓; risco do `Intl` (F-L1) |
| Tempo real sem recarregar | PRD §6, FR-46 | AD-4 ✓, mas sem ressincronização (F-H6) |
| Sem internet = só leitura, aviso fixo | EXPERIENCE Foundation, State Patterns | AD-3 ✓; detecção central do estado offline não definida (F-M4) |
| Formato da mensagem (formas 1, 2, 3, regras de inclusão, "↳ Ajuste") | EXPERIENCE "Formato da mensagem" | AD-11 põe a geração no núcleo ✓; regra "só não pagos / só o restante" depende de F-H2 |
| Área de toque 44 pt, contraste, VoiceOver | EXPERIENCE Accessibility, DESIGN | Não citado; shadcn padrão viola 44 pt (F-M11) |
| Ordem padrão da grade = ordem da fatura | EXPERIENCE Grade | Sem coluna de ordem (F-M8) |
| Conferência por cartão recalculada após edição (FR-7) | PRD FR-6, FR-7 | Totais por cartão não guardados (F-M8) |
| Marca "verificar" some sozinha; alerta pode ser dispensado | PRD FR-6 | Não diz o que é guardado e o que é derivado (F-M8) |
| Atraso = vencimento + tolerância | PRD FR-49 | AD-10/AD-13 ✓; vencimento de Lançamento sem Fatura indefinido (F-M9) |
| Contas manuais recorrentes "até encerrar" | PRD FR-16 a FR-18 | Materialização indefinida (F-H8) |
| Excluir com "Desfazer", arquivar Responsável/Tipo | EXPERIENCE, PRD FR-46 | Indefinido (F-H7) |
| Reimportar avisa de Pagamentos e classificação manual | PRD FR-51 | Apaga linhas sem dizer o destino dos Pagamentos (F-H3) |
| IA no FR-11 decidida na arquitetura | PRD §10 | Não decidida (F-H5) |
| "Esqueci a senha" | EXPERIENCE Entrar | Não tratado (F-L6) |
| Lembretes no dia do fechamento | PRD FR-55 | AD-13 ✓, mas depende de o projeto não estar pausado (F-C1) |

**Contradições entre espinha e entradas**
1. NFR Privacidade × Gemini no plano gratuito (F-H4) — aceita por Rafael no `.memlog.md`, mas não registrada na espinha.
2. "Resto vai para a última parte" × exemplo Monjaro R$ 310,67 + R$ 155,33 (F-H9), se "resto" for lido como truncar as primeiras partes.
3. "＋ Lançamento" entra "no Mês aberto" (EXPERIENCE) × AD-9 (Mês calculado pela data e pelo Ciclo) (F-L9).
4. O `.memlog.md` lista a restrição de entrada "offline com sync", que a decisão AD-3 substituiu; o EXPERIENCE já foi alinhado — sem ação além de manter o registro.

---

## Achados

### Crítica

#### F-C1 — Sem backup nem plano para os limites do plano gratuito, sendo o Supabase a única cópia
- **Local:** AD-3, Structural Seed → Ambientes, Deferred.
- **Problema:** AD-3 faz do Supabase a única fonte da verdade, e o PRD (§7) proíbe exportação. A espinha não decide backup, restauração nem plano do Supabase. No plano gratuito não há backup diário baixável nem PITR, e o projeto é pausado após cerca de 7 dias sem atividade de API. Com a pausa, o `pg_cron` não roda, e o lembrete do dia do fechamento (FR-55) falha justamente no período em que Rafael não abre o app. Uma migração errada ou um `DELETE` errado na reimportação (FR-51) não tem volta.
- **Correção sugerida:** acrescentar um AD de operação: (a) plano do Supabase (Pro, com backup diário, ou gratuito + rotina própria); (b) se gratuito, um job agendado fora do Supabase (Vercel Cron diário ou GitHub Action) que faz `supabase db dump` criptografado para um destino privado e também mantém o projeto ativo; (c) teste de restauração documentado; (d) tabela de limites aceitos (Supabase, Vercel Hobby, cota do Gemini) com o que acontece quando cada um estoura.

### Alta

#### F-H1 — A Edge Function em Deno não consegue importar `src/domain` sem uma regra de resolução de módulos
- **Local:** Design Paradigm (linha `supabase/functions`), AD-1, AD-13, Structural Seed.
- **Problema:** o núcleo será escrito para Next.js (imports sem extensão, `zod` como especificador nu, aliases `@/`). O Deno exige extensões explícitas ou import map, `npm:zod`, e o empacotamento da Edge Function precisa alcançar arquivos fora de `supabase/functions`. Cada story vai resolver isso de um jeito, ou o núcleo vai ser copiado — exatamente a divergência que o AD-1 quer impedir.
- **Correção sugerida:** escolher uma de duas: (a) regra em AD-1: `src/domain` usa só imports relativos com extensão `.ts` (`allowImportingTsExtensions`), sem aliases, e `supabase/functions/deno.json` mapeia `zod` → `npm:zod@<versão fixa>`, com um teste de CI que roda `deno check` no núcleo; ou (b) trocar a Edge Function por uma rota Vercel Cron (`/api/cron/lembretes`, Node, protegida por `CRON_SECRET`), que importa o núcleo sem Deno e também resolve a pausa do F-C1.

#### F-H2 — Não há verdade única para "pago" e "valor restante"
- **Local:** AD-10.
- **Problema:** o Lançamento guarda `status_id` (com `conta_como_pago`) e, ao mesmo tempo, `pagamento_itens` guarda o valor quitado. Rafael pode trocar o Status à mão sem Pagamento, ou desfazer um Status com Pagamento registrado. Saldo pendente (FR-26), mensagem (só o restante de "Pago parcialmente"), atraso (FR-49) e lembretes podem ler fontes diferentes.
- **Correção sugerida:** escrever a regra: "pago" = `status.conta_como_pago`; restante de um Lançamento não pago = `valor_centavos − soma(pagamento_itens.valor_quitado_centavos)`; "Pago parcialmente" = não pago com soma > 0. Trocar o Status de um Lançamento com itens de Pagamento passa por RPC que avisa (FR-46) e não apaga itens. Uma só função do núcleo (`situacaoDoLancamento`) devolve pago/restante/atrasado para todas as telas, mensagem e lembretes.

#### F-H3 — Reimportação (FR-51) apaga Lançamentos com Pagamento sem decidir o destino
- **Local:** AD-7 item 4, AD-10.
- **Problema:** o RPC `importar_fatura` apaga os Lançamentos `fatura` do Mês. Os que já têm `pagamento_itens` ou classificação manual (que o PRD manda contar e avisar) ficam com FK quebrada, cascata silenciosa ou erro. Também não está dito o que acontece com um Pagamento cujos itens somem.
- **Correção sugerida:** decidir e escrever no AD-7: ou (a) a reimportação recasa por (`nome_normalizado`, Parcela, Valor, ordem) e transfere `status_id`, `apelido`, classificação e `pagamento_itens` para a linha nova; ou (b) ela apaga e o Pagamento passa a ter só `valor_recebido_centavos` sem itens ("crédito sem alocação"), mostrado em Recebimentos. Em qualquer caso, a FK de `pagamento_itens` precisa de política explícita (`restrict` + tratamento no RPC).

#### F-H4 — Contradição não registrada: Gemini gratuito × NFR Privacidade
- **Local:** AD-7 item 2, Stack (`@google/genai`), `.memlog.md` (decisão aceita).
- **Problema:** o PRD §6 diz que os dados ficam acessíveis só ao Rafael. No plano gratuito, o Google pode usar o conteúdo enviado para melhorar produtos e há revisão humana. Rafael aceitou isso no `.memlog.md`, mas a espinha não registra; quem implementa ou revisa depois vai ver o AD-7 como violação do PRD, ou vai trocar o plano sem saber.
- **Correção sugerida:** acrescentar ao AD-7 uma linha "Desvio aceito do NFR Privacidade: o texto da fatura (sem PDF nem senha) vai para o Gemini gratuito, que pode usá-lo; aceito por Rafael em 01/11/26; revisitar se o app abrir para outras pessoas (PRD §8)". Opcional: mascarar no navegador os dados que não são necessários (CPF, endereço, número completo do cartão) antes de enviar.

#### F-H5 — A pergunta que o PRD delegou à arquitetura (IA no FR-11) não foi respondida
- **Local:** mapa de capacidades (linha Classificação), PRD §10 pergunta 1, FR-11 "[NOTE FOR PM]".
- **Problema:** sem decisão, a story de classificação pode chamar o Gemini numa segunda rota, embutir a sugestão na extração ou não usar IA — três desenhos diferentes, com efeito na privacidade, na cota e no tempo de importação.
- **Correção sugerida:** decidir. Sugestão: v1 sem IA dedicada; o schema de extração do AD-7 ganha um campo opcional `tipo_sugerido` (escolhido da lista de Tipos enviada no prompt), validado pelo núcleo e sempre enviado para a fila (SM-C1). Assim não há chamada extra. Registrar no `.memlog.md` e no mapa.

#### F-H6 — Realtime sem assinatura única nem ressincronização
- **Local:** AD-4.
- **Problema:** "cada aparelho assina o Realtime das tabelas do usuário" não diz quem assina (cada tela? a camada de dados?) nem o que fazer quando a conexão volta. O Safari do iPad suspende o WebSocket quando o app vai para segundo plano, e os eventos perdidos não são reenviados. O resultado é tela desatualizada sem aviso — o oposto do FR-46. Também falta dizer que as tabelas entram na publicação `supabase_realtime` por migração.
- **Correção sugerida:** completar o AD-4: uma única assinatura por sessão, em `src/data/realtime.ts`, que alimenta o estado compartilhado; ao reconectar, ao voltar a aba para o primeiro plano (`visibilitychange`) e ao voltar a internet, refaz a leitura completa dos dados carregados; toda tabela de negócio é adicionada à publicação na migração que a cria.

#### F-H7 — Política de exclusão, arquivamento e "Desfazer" não definida
- **Local:** AD-8 ("Lançamentos não excluídos"), Consistency Conventions, FR-46, EXPERIENCE (Excluir · Desfazer, Responsável arquivado).
- **Problema:** AD-8 pressupõe exclusão lógica, mas nenhuma regra a cria. O UX pede "Excluído · Desfazer" e arquivar Responsáveis/Tipos em uso. Sem regra, umas stories apagam de verdade, outras usam `excluido_em`, e o "Desfazer" vira reinserção com outro `id` (quebrando Série, Ajuste e `pagamento_itens`).
- **Correção sugerida:** convenção: Lançamentos e Pagamentos têm `excluido_em timestamptz null`; repositórios filtram `excluido_em is null`; "Desfazer" limpa o campo; restrições únicas são índices parciais `where excluido_em is null`. Responsável, Tipo e Status têm `arquivado boolean`. Exclusão física só pela reimportação (F-H3) e por limpeza explícita.

#### F-H8 — Contas manuais recorrentes "até encerrar": quem gera os Lançamentos e até quando
- **Local:** AD-8 ("toda Conta manual tem uma serie"), mapa (Contas manuais), FR-16 a FR-18.
- **Problema:** uma conta mensal sem fim não tem `parcela_total`. Não está decidido se os Lançamentos são materializados ao salvar (quantos meses à frente?), por um job mensal ou calculados virtualmente ao abrir o Mês. A Previsão (6 meses), o Painel de Meses futuros e o FR-18 (alterar a partir do Mês atual) dependem disso, e cada story pode escolher um caminho.
- **Correção sugerida:** decidir: materializar uma janela móvel (ex.: Mês atual + 12) ao salvar a Conta e completar a janela no job diário (o mesmo dos lembretes), por uma função do núcleo `gerarLancamentosDaConta(conta, ate)`; alterar/encerrar reescreve só os Lançamentos `manual` com `mes ≥` o Mês escolhido, num RPC.

#### F-H9 — Arredondamento da Divisão ambíguo e possivelmente contrário ao PRD
- **Local:** AD-2 ("Na Divisão, o resto vai para a última parte"), Consistency Conventions → Testes.
- **Problema:** o PRD e o UX fixam Monjaro R$ 466,00 em 2/3 + 1/3 = **R$ 310,67 + R$ 155,33**. Se "resto" for lido como truncar as primeiras partes, o resultado é R$ 310,66 + R$ 155,34, e o total da Mãe (R$ 1.350,14, teste de aceite) sai errado.
- **Correção sugerida:** reescrever: "cada parte, exceto a última, é arredondada para centavos meio para cima; a última é o Valor original menos a soma das demais". Acrescentar Monjaro aos testes de aceite.

### Média

#### F-M1 — Identidade da Série não definida
- **Local:** AD-8; FR-2, FR-8, FR-44, FR-45.
- **Problema:** não se diz como a importação reconhece que "MAGALU 05/10" pertence a uma Série existente (chave: `nome_normalizado` + `parcela_total` + Valor + Mês da parcela 1?). A importação da planilha, a herança (FR-8) e a geração de previstos podem criar Séries duplicadas. Também não está dito como uma parcela prevista já **dividida** casa com a Fatura (o original oculto vira `fatura` e as partes acompanham?).
- **Correção sugerida:** definir no AD-8 a chave de reconhecimento (função do núcleo `chaveDaSerie`) e a regra: no casamento, o original oculto muda para `fatura` e as partes herdam o Valor por proporção, recalculado com a regra do F-H9.

#### F-M2 — Representação da Divisão na Regra
- **Local:** AD-6, AD-8, FR-10, FR-15, glossário (Regra).
- **Problema:** a Regra guarda "uma Divisão", mas o Valor do próximo Mês pode ser outro. Se a Divisão for guardada em centavos, ela não se aplica; se em proporção, precisa de formato.
- **Correção sugerida:** a Divisão na Regra é guardada como frações (numerador/denominador por Responsável, `jsonb` validado por `zod` do núcleo); Divisões por valor viram proporção ao gerar a Regra.

#### F-M3 — "Biblioteca de estado de tela: a funcionalidade escolhe" permite divergência
- **Local:** Deferred.
- **Problema:** com a assinatura Realtime única (F-H6), o estado precisa ser compartilhado; deixar cada área escolher gera caches paralelos e telas que discordam.
- **Correção sugerida:** fixar uma (ex.: TanStack Query como cache das linhas do banco, alimentado pelo Realtime, + estado local de React para a tela) e tirar do Deferred.

#### F-M4 — Service worker sem dono e estado offline sem detector central
- **Local:** Deferred (cache de leitura), AD-3, AD-13, mapa (FR-35).
- **Problema:** PWA (FR-35), cache de leitura e Web Push (FR-55) dependem do mesmo service worker, em stories diferentes. Além disso, "bloqueia toda ação que grava" não diz como o app sabe que está sem conexão (`navigator.onLine` é pouco confiável no iPad).
- **Correção sugerida:** um único `public/sw.js` (ou Serwist) com dono na story da PWA e um ponto de extensão para o push; nunca colocar em cache respostas de `/api/*` nem o PDF. Um hook único `useConexao()` em `src/data` (eventos do navegador + estado do canal Realtime + falha de rede da gravação) que todas as ações de gravação consultam.

#### F-M5 — Ambientes e caminho de deploy ambíguos
- **Local:** Structural Seed → Ambientes; Deferred (CI).
- **Problema:** um Preview da Vercel não alcança um `supabase start` local, então "local ou projeto de desenvolvimento" vira, na prática, decisões diferentes por story. Não está dito quem aplica `supabase db push` e o deploy da Edge Function em produção, nem quando os testes de aceite bloqueiam o merge.
- **Correção sugerida:** Preview → projeto Supabase `dev` (o segundo projeto gratuito); migrações e Edge Functions em produção só pelo CI após merge em `main`; gate mínimo desde a primeira story: `tsc`, Vitest (incluindo os testes de aceite de out/2026) e lint de fronteiras.

#### F-M6 — NFR "< 1 min" sem dono; tempo de função, cota e determinismo do Gemini
- **Local:** AD-7, Stack; PRD §6 Desempenho, FR-5 (49 Lançamentos exatos).
- **Problema:** a rota `/api/fatura/extrair` depende do `maxDuration` da Vercel Hobby e do tempo de resposta do Gemini; a cota diária/por minuto do plano gratuito pode recusar a chamada sem plano de erro. A extração por LLM não é determinística, e o teste de aceite "exatamente 49" não tem forma de rodar no CI.
- **Correção sugerida:** acrescentar ao AD-7: `maxDuration` explícito; orçamento (ex.: extração ≤ 40 s, núcleo + RPC ≤ 5 s); `temperature: 0`; uma nova tentativa em erro 429/5xx com a mensagem "A conexão caiu. Nada foi gravado" do UX; teste de aceite da extração com o texto extraído gravado como fixture (resposta do Gemini registrada) e um teste manual com o PDF real fora do repositório.

#### F-M7 — Importação da planilha (FR-2) sem formato nem transação
- **Local:** mapa (Configuração inicial), Stack.
- **Problema:** não se decide se a planilha entra como `.xlsx` exportado, CSV por aba ou API do Google Sheets, nem a biblioteca de leitura. O UX pede progresso por aba e "segue com as outras" em erro, o que exige uma transação por aba.
- **Correção sugerida:** decidir `.xlsx` exportado, lido no navegador (ex.: SheetJS ou exceljs, versão fixa na Stack), cada linha validada por `zod`, e um RPC `importar_historico_aba` por aba; criação de Responsáveis/Tipos/Regras/Séries pelo núcleo.

#### F-M8 — Dados persistentes que o PRD/UX exigem e o modelo não tem
- **Local:** Structural Seed (erDiagram), AD-4, AD-7.
- **Problema:** faltam no modelo: totais por cartão da Fatura (necessários para refazer a Conferência por cartão depois do FR-7); ordem do Lançamento no PDF (ordem padrão da grade); marca de dúvida da extração (a parte guardada do "verificar") e "alerta dispensado"; configurações únicas (tolerância de atraso, limite do Ajuste, lembretes ligados, modelo da mensagem com Pix, aparência); Fatura única por Mês; "meu Bloco" único. AD-4 ("totais nunca gravados") pode ser lido como proibindo guardar os totais da Fatura, que o FR-4 manda guardar.
- **Correção sugerida:** acrescentar ao modelo `fatura_cartoes (fatura_id, final, total_centavos)`, `lancamentos.ordem_fatura`, `lancamentos.duvida_extracao`, `faturas.alerta_dispensado_em`, uma tabela `configuracoes` (uma linha por dono), `unique (owner_id, mes)` em `faturas` e índice parcial único para "meu Bloco". No AD-4, esclarecer: "totais lidos da Fatura são guardados; totais calculados nunca".

#### F-M9 — Vencimento para atraso de Lançamentos sem Fatura
- **Local:** AD-9, AD-10, AD-13; FR-49.
- **Problema:** o atraso usa "vencimento da Fatura + tolerância". Para Lançamentos manuais de um Mês sem Fatura importada (ou de Contas manuais), não está dito de onde vem o vencimento; tela e lembrete podem usar fontes diferentes.
- **Correção sugerida:** função do núcleo `vencimentoDoMes(mes, faturas, configCiclo)`: o vencimento lido na Fatura, se existir; senão, o dia de vencimento da configuração vigente no Mês.

#### F-M10 — "Última gravação vence" no nível da linha pode apagar campos
- **Local:** AD-3.
- **Problema:** o UX salva cada campo ao sair dele. Se um repositório enviar a linha inteira, uma edição de Apelido no iPad apaga uma mudança de Tipo feita no PC segundos antes.
- **Correção sugerida:** acrescentar: "atualizações enviam só as colunas alteradas; `updated_at` é definido por gatilho do banco".

#### F-M11 — Área de toque de 44 pt e acessibilidade não chegam às convenções
- **Local:** Consistency Conventions → Estilo visual; EXPERIENCE Accessibility Floor; DESIGN `spacing.touch-target`.
- **Problema:** os componentes padrão do shadcn/ui têm botões de 36 px, caixa de 16 px e foco sempre visível, o que viola o mínimo de 44 pt do UX. Sem regra, cada story ajusta (ou não).
- **Correção sugerida:** acrescentar à convenção: "todo alvo de toque tem no mínimo 44 × 44 pt (via `min-h`/`min-w` ou pseudo-elemento de área), o anel de foco só aparece com `:focus-visible`, e o texto do sistema até 130% não quebra a grade"; checagem com axe nos testes de componente.

### Baixa

#### F-L1 — Formatador de moeda: não usar o `Intl` direto
- **Local:** AD-2, Convenções → Datas/Dinheiro.
- **Problema:** `Intl.NumberFormat('pt-BR', {style:'currency'})` gera "-R$ 0,08" e espaço não separável, diferente de "- R$ 0,08" e do texto colado no WhatsApp.
- **Correção sugerida:** o formatador do núcleo monta a string à mão, com testes para negativo, milhar e zero.

#### F-L2 — "Meio para cima" com negativos
- **Local:** AD-2.
- **Problema:** para resultados negativos (Bloco com estornos), "meio para cima" pode significar −0,5 → 0 ou → −1.
- **Correção sugerida:** fixar "meio para longe do zero" (ou o oposto) e testar.

#### F-L3 — Autenticação e horário do pg_cron
- **Local:** AD-12, AD-13.
- **Problema:** o `pg_cron` + `pg_net` precisa de um segredo para chamar a Edge Function (guardado no Vault), e o agendamento roda em UTC.
- **Correção sugerida:** registrar: segredo no Supabase Vault, função exige esse cabeçalho, cron `0 12 * * *` (09:00 em São Paulo, sem horário de verão). Desnecessário se F-H1 escolher Vercel Cron.

#### F-L4 — Versão da normalização do Nome
- **Local:** AD-6; FR-9.
- **Problema:** `nome_normalizado` é guardado; se a função mudar (ex.: novo prefixo "EBANX*"), Regras antigas deixam de casar. O FR-9 pede tolerância a variações que talvez a igualdade exata não cubra.
- **Correção sugerida:** guardar `normalizacao_versao` e recalcular por migração quando a função mudar; deixar claro que a tolerância do FR-9 está toda dentro da função de normalização.

#### F-L5 — Restrições únicas óbvias não escritas
- **Local:** Structural Seed.
- **Problema:** uma Fatura por Mês, um "meu Bloco", nomes únicos de Responsável/Tipo/Status por dono.
- **Correção sugerida:** listar como índices únicos (parciais quando houver arquivamento). (Complementa F-M8.)

#### F-L6 — "Esqueci a senha" e sessão expirada
- **Local:** AD-5; EXPERIENCE Entrar, State Patterns.
- **Problema:** o e-mail padrão do Supabase Auth tem limite baixo de envio; com cadastro desligado, a recuperação ainda precisa funcionar. "Sessão expirada" precisa de tratamento central.
- **Correção sugerida:** registrar SMTP próprio (ou aceitar o limite) e que a renovação/expiração da sessão é tratada em um só lugar (`@supabase/ssr` + proxy do Next.js).

#### F-L7 — Bibliotecas de gráfico e de arrastar fora da Stack
- **Local:** Stack; FR-33, "Reordenar".
- **Problema:** Previsão e Evolução podem acabar com bibliotecas de gráfico diferentes.
- **Correção sugerida:** fixar uma (ex.: Recharts, que o shadcn usa nos charts) e uma de arrastar (ex.: dnd-kit).

#### F-L8 — Fixtures com dados financeiros reais
- **Local:** Convenções → Testes.
- **Problema:** os testes de aceite usam a fatura real de out/2026 (nomes, finais de cartão, chave Pix).
- **Correção sugerida:** repositório privado obrigatório, e fixtures com o texto extraído sem dados pessoais desnecessários; o PDF nunca entra no repositório.

#### F-L9 — Mês do "＋ Lançamento"
- **Local:** AD-9 × EXPERIENCE ("＋ Lançamento … no Mês aberto").
- **Problema:** o UX põe o Lançamento no Mês aberto; o AD-9 calcula o Mês pela data e pelo Ciclo. Um Lançamento com data de outubro criado com novembro aberto cai em lugares diferentes.
- **Correção sugerida:** decidir: inclusão avulsa usa o Mês aberto (e a data é só informativa), ou a data padrão é ajustada para cair no Mês aberto; Contas manuais seguem o Ciclo.

#### F-L10 — Monitoramento futuro e privacidade dos logs
- **Local:** AD-7 item 2, Deferred (monitoramento).
- **Problema:** quando o monitoramento de erros entrar, ele pode capturar o corpo da rota (texto da fatura) ou o estado da tela com valores.
- **Correção sugerida:** acrescentar já a regra: nenhum log, rastreio ou relatório de erro inclui corpo de requisição, texto da fatura ou valores; só código de erro e rota.
