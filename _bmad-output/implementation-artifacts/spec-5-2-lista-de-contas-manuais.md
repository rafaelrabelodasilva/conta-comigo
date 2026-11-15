---
title: 'História 5.2: Lista de Contas manuais'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_commit: '8c936ae'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-conta-comigo-2026-11-01/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-5-1-cadastrar-uma-conta-manual.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** a 5.1 deixou Rafael cadastrar uma Conta manual, mas a tela Contas só mostra o que foi salvo na visita ("Salvas agora"). Ele não vê o que cadastrou ontem, o que ainda vale e o que já acabou (FR-16, UX-DR24).

**Approach:** Contas → lista de verdade. A tela lê `contas_manuais` pelo gerenciador de Realtime (`useLinhas("contas_manuais")`, AD-4), sem `supabase.from()`, e mostra Conta (com a descrição da repetição), Valor por mês, Responsável ou Divisão (etiquetas), Tipo e Situação (Ativa ou Encerrada), com os filtros "Ativas / Encerradas / Todas" e o ⋯ de cada linha (Editar, Encerrar, Excluir). Toda decisão (situação, filtro, ordem, etiquetas) é uma função pura em `src/domain/lista-contas.ts`. A Conta salva no formulário entra na lista porque `repoContas().salvar` passa a aplicar a Conta devolvida no gerenciador.

## Boundaries & Constraints

**Always:**
- **Núcleo puro (AD-1):** `src/domain/lista-contas.ts` (imports relativos) tem `situacaoDaConta`, `ultimoMesDaConta`, o filtro (`situacaoNoFiltro`, `contagemPorFiltro`, `filtroQueMostra`), `ordenarContas` e `linhaDaConta`/`linhasDaLista`. Reaproveita `descricaoDaRepeticao` (5.1), `lerDivisao`/`valoresDasPartes` (`divisao.ts`) e `formatarDinheiro`; nada é copiado. A tela só chama o núcleo e desenha. Textos pelo mapa `mensagens.ts` (`TEXTOS_CONTAS`).
- **Lê só pelo gerenciador (AD-4):** `useLinhas("contas_manuais")`, `"responsaveis"` e `"tipos"`. O gerenciador de `contas_manuais` é o genérico (lê a tabela inteira, relê ao reconectar por `recarregarTodos`, aplica evento só se o `updated_at` for mais novo).
- **Sem migração.** A tabela `contas_manuais` e a publicação do Realtime (com `replica identity full`) já vêm da migração da 5.1 (`20261124120000_contas_manuais.sql`, já aplicada em produção). Nada de schema muda aqui; `database.types.ts` não muda.
- **Sem internet, só consulta (AD-3):** a lista continua visível (é a memória do gerenciador). "＋ Nova conta" abre e o formulário desativa "Salvar" (5.1).
- Sem cor literal (só tokens) e alvos de 44 pt em tudo que toca.

**Never:** Editar, Encerrar e Excluir de verdade (5.4: recriar as parcelas, "Vale a partir de Mmm/AA", "A partir de qual mês?", "Excluído · Desfazer"); cron e `vercel.json` (5.3); materialização; Dívida programada (Épico 6); Pagamentos; Previsão; ordenar por coluna; `console.*`; `supabase.from()` em tela; alterar o schema.

## Decisões (registradas, nada implícito)

1. **Situação: "Ativa" e "Encerrada".** A Conta cobre os Meses de `mes_inicial` até o **último Mês dela**: o Mês da última parcela (`mes_inicial + parcela_total − 1`, só nas parcelas) ou o Mês anterior a `encerrada_em_mes` (a 5.1: "a Conta vale até o Mês anterior a este"), o que vier primeiro; sem nenhum dos dois, não tem fim. **Encerrada = o último Mês é anterior ao Mês atual** (a Conta já acabou, como diz o épico: "o que já acabou"). Casos limite, todos testados, com Mês atual nov/26:

   | Caso | Último Mês | Situação |
   |---|---|---|
   | Mensal sem `encerrada_em_mes` | sem fim | Ativa |
   | `encerrada_em_mes` = nov/26 (o Mês de hoje) | out/26 | **Encerrada** (hoje já não recebe a parcela) |
   | `encerrada_em_mes` = dez/26 (futuro) | nov/26 | **Ativa** (ainda vale neste Mês; o fim aparece na descrição, "Mensal · Jan/26 a Nov/26") e vira Encerrada em dez/26 |
   | 6 parcelas desde jul/26 | dez/26 | Ativa |
   | 5 parcelas desde jul/26 (a última é a de hoje) | nov/26 | **Ativa** |
   | 4 parcelas desde jul/26 | out/26 | **Encerrada**, mesmo sem `encerrada_em_mes` |
   | Conta que começa no futuro (`mes_inicial` > hoje) | depois de hoje | **Ativa** (não há terceira situação: "Ativa" é o estado cadastrado; a descrição "desde Mmm/AA" mostra quando começa) |
   | Parcelada encerrada antes do fim | o menor dos dois | pelo menor |
   | Encerrada antes de começar (`encerrada_em_mes` ≤ `mes_inicial`) | antes de `mes_inicial` | Encerrada (nunca vale) |
   | Mês ilegível | — | Ativa (nada some da lista por defeito de dado) |

   Um teste prova que a situação **concorda com `parcelasDaConta`** (AD-15): Ativa ⇔ a Conta ainda gera parcelas de hoje em diante. A situação é **derivada** a cada leitura (nunca gravada), então vira Encerrada sozinha quando o Mês muda, sem cron.

2. **O ⋯ nesta história.** Editar, Encerrar e Excluir ficam **visíveis e desativados, cada um com "Em breve"** sob o rótulo (`ItemMenuAcoes` ganhou `desativado` e `motivo`; Radix marca `aria-disabled`, e o motivo entra no nome acessível: "Editar Em breve"). Por quê: um item que abre um aviso "chega na próxima etapa" parece funcionar e não faz nada; o desativado diz a verdade antes do toque e some da conta quando a 5.4 ligar. **Gancho para a 5.4:** `ContasManuais` recebe `acoes?: { aoEditar?, aoEncerrar?, aoExcluir? }`, cada um `(conta: LinhaConta) => void` com a linha inteira do gerenciador. Sem a prop, o item fica desativado ("Em breve"); com ela, o item vale e a lista chama o callback, sem lógica. **Sem internet**, um item com callback fica desativado com "Sem conexão" (AD-3): os testes passam callbacks falsos para provar o gancho. A 5.4 não precisa mexer na lista, só passar os três callbacks.

3. **Valor, Responsável e Divisão.**
   - **Valor por mês** é sempre `valor_centavos` (R$ 400,00). Na **parcelada** é o valor da parcela e a célula traz a legenda "por parcela" (o formulário já chama de "Valor por parcela"); o Mensal não precisa de legenda. Com **Divisão**, o Valor é a soma das partes (a 5.1 só salva se a soma é igual ao Valor): R$ 318,00 na Bombinhas. O total da conta (R$ 1.908,00) não aparece na lista (é do formulário).
   - **Responsável ou Divisão:** sem Divisão, uma etiqueta (`person-tag`, a cor do Responsável). Com Divisão, **uma etiqueta por parte**, na ordem da Divisão (Mãe, Casal, Lucas). Os valores das partes vão na linha da Conta, como no mockup: "6 parcelas · Jul/26 a Dez/26 · 3 partes de R$ 106,00"; se as partes diferem, "2 partes: R$ 200,00 · R$ 118,00" (mesma ordem das etiquetas), pelos valores de `valoresDasPartes` (o arredondamento do AD-2). As etiquetas na lista **não filtram** (o atalho "toque na etiqueta filtra" é da grade do Painel).
   - **Em 834 pt:** as etiquetas quebram para baixo (`flex-wrap`), sem rolagem lateral.

4. **Ordem e filtro.**
   - **Ordem padrão:** Ativas primeiro, depois Encerradas; em cada grupo, por **Nome** (pt-BR, sem distinguir maiúsculas nem acento, "Conta 2" antes de "Conta 10"); empate pelo cadastro mais antigo (`created_at`) e pelo `id`. Por Nome porque a lista é para achar uma Conta ("cadê a Silvia?"), e uma Conta nova entra no lugar certo em vez de no fim. **Desvio do mockup:** o mockup mostra Silvia, William, TVbox, Bombinhas (ordem de cadastro, ilustrativa); a ordem é Bombinhas, Silvia, TVbox, William.
   - **Sem ordenar ao toque.** A lista tem dezenas de linhas no máximo; os cabeçalhos são texto, não botões (a grade do Painel, com centenas de linhas, é que ordena por coluna). Se Rafael sentir falta, entra depois sem mudar o núcleo (`ordenarContas` é a única ordem).
   - **Filtro:** estado **só da tela** (`useState`), abre em **"Ativas"** e volta a "Ativas" ao sair e voltar. Não vai para a URL nem para o aparelho: o formulário é uma janela por cima da lista (não há "voltar do formulário" que o perca) e o filtro é uma olhada rápida, não uma preferência. **Exceção que protege a Conta nova:** ao salvar, se o filtro atual esconderia a Conta salva (uma parcelada que já terminou, salva com "Ativas" ligado), o filtro passa para o que a mostra (`filtroQueMostra`); em "Todas" não muda.
   - **Contagem por filtro:** cada botão mostra o número ("Ativas 4") e o nome acessível o anuncia ("Ativas, 4 contas"). Filtro sem resultado: "Nenhuma conta ativa" / "Nenhuma conta encerrada". Sem nenhuma Conta: "Nenhuma conta manual", com "＋ Nova conta" (e a frase de apoio da 5.1); os filtros somem (não há o que filtrar).

5. **Layout, toque e cabeçalho.** Tabela por `role` (`table`, `rowgroup`, `row`, `columnheader`, `cell`): as linhas são grades CSS e o Safari perde a semântica de `<table>` quando o `display` muda. Seis colunas (Conta, Valor por mês, Responsável ou Divisão, Tipo, Situação, ⋯) **sem rolagem lateral** em 834 pt em pé e deitado: o nome e a repetição quebram linha, as etiquetas quebram para baixo, o Valor tem largura mínima de 6 rem. Em vez de cartões por linha: a tabela é o que o UX-DR24 e o mockup pedem, e 834 pt cabe. O cabeçalho é `sticky` no topo enquanto a página rola. **Toque de 44 pt:** linha `min-h-toque`, filtros `min-h-toque`, ⋯ com `area-toque` (26 px desenhados, toque de 44). **O toque na linha não faz nada** nesta história: a linha não é um botão (a 5.4 decide se tocar abre o Editar). Também não há toque longo (o ⋯ é o único caminho).

6. **Tipo e Responsável arquivados ou apagados (AD-16).** Arquivado some das escolhas mas não das somas, então a lista **mantém o nome e acrescenta "(arquivado)"**: "Rafael (arquivado)", "Saúde (arquivado)" (a mesma marca da 4.2, "Cita Rangel (arquivado)", só que no nome em vez da frase). A etiqueta arquivada **mantém a cor**. Apagado: excluir um cadastro em uso exige substituto (`contaUso`, 5.1), então uma Conta não deveria citar um id que não existe; se acontecer (dado velho, ou o Realtime ainda não trouxe o cadastro), a etiqueta ou o Tipo mostra **"Removido"**, em cinza e sem cor, e na Divisão só a parte afetada. A tela espera Contas, Responsáveis e Tipos carregarem antes de desenhar a tabela, para não piscar "Removido" na primeira pintura. Divisão ilegível (`lerDivisao` nula): sem etiquetas ("—") e sem texto de partes; o Valor e o resto da linha seguem.

7. **A Conta salva entra na lista.** `repoContas().salvar` aplica a Conta devolvida pela RPC no gerenciador de `contas_manuais` (`aplicarLote([conta])`), como os outros repositórios; recusa, resposta torta e sem internet não aplicam nada. O Realtime, quando traz o INSERT, não duplica (mesmo `id`, `updated_at` não mais novo). Mantém o toast "Conta salva: N lançamentos criados". O "Salvas agora" da 5.1 e o texto `salvas_agora` saem.

8. **Offline e Realtime (AD-3, AD-4).** O gerenciador de `contas_manuais` lê a tabela inteira (`select("*")`, sem `porMes`), abre o canal quando a tela assina e **relê a tabela a cada `SUBSCRIBED` e quando a conexão volta** (`recarregarTodos`). Uma Conta nova, alterada ou apagada em outro aparelho entra, muda ou sai sem recarregar (a tabela tem `replica identity full`, então o DELETE traz o `id`). **Limite de 1000 linhas do PostgREST:** a leitura não pagina; com mais de 1000 Contas ela seria cortada em silêncio. Não importa aqui: são contas da casa (Silvia, TVbox, Bombinhas...), dezenas em toda a vida do app, e a Conta é uma linha (as parcelas são Lançamentos, outra tabela, que tem o escopo por Mês justamente por causa disso). Se um dia chegar perto, o gerenciador ganha paginação; nada na tela muda. Sem internet, a lista fica como estava e os botões que gravam seguem a decisão 2 e a 5.1.

9. **Acessibilidade.** A lista é uma tabela por `role`, com nome ("Lista de contas manuais") e cabeçalhos de coluna (o do ⋯ é `sr-only`, "Ações"). Os filtros são um `role="group"` ("Filtrar contas") de botões com `aria-pressed`, nome com a contagem ("Ativas, 4 contas") e uma região `role="status"` (`sr-only`) que anuncia o resultado ao trocar ("3 contas ativas", "Nenhuma conta encerrada"). O ⋯ tem nome "Ações de Bombinhas". A situação é **texto** ("Ativa", "Encerrada") com cor, nunca só cor. Carregando: `role="status"` e `aria-busy` com "Carregando as contas" e esqueleto (nunca tela branca); erro: `role="alert"` com "Tentar de novo" (relê as três tabelas). 44 pt em tudo que toca (decisão 5).

10. **Onde cada coisa roda.** Núcleo, repositório e tela: `npm run lint`, `typecheck` e `test` (jsdom e fakes), neste computador. **Só o CI prova:** o Realtime de verdade entre aparelhos (`test/integracao/contas-manuais.test.ts`, teste novo: INSERT, UPDATE e DELETE de `contas_manuais` chegam a outro aparelho do mesmo dono, com a Série e os Lançamentos apagados antes do DELETE porque a FK os prende) e a igualdade dos tipos. A CLI do Supabase fica fora desta história (não há migração). **Não verificado:** iPad, VoiceOver e o layout em 834 pt (só o DOM e as classes, em jsdom).

## I/O & Edge-Case Matrix

| Cenário | Entrada / Estado | Esperado | Erro |
|---|---|---|---|
| Lista do mockup | Silvia, William, TVbox, Bombinhas (Mês atual nov/26) | 4 linhas: "Mensal · desde Jan/26" R$ 400,00 Rafael Saúde Ativa; William R$ 420,00 Casal Bobiças; TVbox R$ 30,00 Steams; Bombinhas "6 parcelas · Jul/26 a Dez/26 · 3 partes de R$ 106,00" R$ 318,00 "por parcela", etiquetas Mãe, Casal, Lucas, Viagem, Ativa; ordem por Nome | N/A |
| Filtro padrão | abre a tela | "Ativas" ligado (`aria-pressed`), contagens nos nomes | N/A |
| Ativas / Encerradas / Todas | 4 ativas + 1 encerrada | 4 / 1 / 5, Todas com as Ativas primeiro | N/A |
| Filtro sem resultado | só Ativas, filtro "Encerradas" | "Nenhuma conta encerrada", sem tabela, aviso anunciado | N/A |
| Encerrada por Mês | `encerrada_em_mes` = hoje; = mês que vem | Encerrada; Ativa (com "a Nov/26" na descrição) | N/A |
| Parcelada que acabou | 4 parcelas desde jul/26; 5 parcelas | Encerrada; Ativa (a última é a de hoje) | N/A |
| Sem Contas | tabela vazia | "Nenhuma conta manual", "＋ Nova conta" abre o formulário da 5.1; sem filtros | N/A |
| Carregando / erro | status `carregando` / `erro` | esqueleto com "Carregando as contas" / "Não foi possível carregar" e "Tentar de novo" que relê as três tabelas | N/A |
| Realtime | Conta nova, alterada, apagada em outro aparelho | entra, muda, some; contagem e situação acompanham; a última apagada leva ao vazio | N/A |
| Salvar | Bombinhas salva no formulário | entra na lista, toast "Conta salva: 6 lançamentos criados", formulário fecha | recusa: formulário aberto, nada na lista |
| Salva e já encerrada | parcelada que já terminou, filtro "Ativas" | o filtro passa a "Encerradas" e mostra a Conta | N/A |
| Sem internet | detector offline | lista visível, filtros funcionam, "＋ Nova conta" abre com "Salvar" desativado, ações do ⋯ com callback ficam "Sem conexão" | `conexao.gravar_sem_conexao` no repositório |
| ⋯ | Editar, Encerrar, Excluir | desativados "Em breve" sem callback; com callback, chamam-no com a Conta da linha | N/A |
| Arquivados | Responsável e Tipo arquivados | "Rafael (arquivado)", "Saúde (arquivado)", cor mantida | N/A |
| Apagados | Responsável, Tipo ou parte da Divisão sem cadastro | "Removido" cinza (só a parte afetada na Divisão) | N/A |
| Divisão desigual | partes de R$ 200,00 e R$ 118,00 | "2 partes: R$ 200,00 · R$ 118,00" | N/A |
| Divisão ilegível | `divisao` com formato torto | "—" nas etiquetas, linha segue | N/A |

</frozen-after-approval>

## Code Map

- `src/domain/lista-contas.ts` (novo, + teste) -- `situacaoDaConta`, `ultimoMesDaConta`, `situacaoNoFiltro`, `filtroQueMostra`, `contagemPorFiltro`, `ordenarContas`, `linhaDaConta`, `linhasDaLista`, `FILTRO_PADRAO_DE_CONTAS`.
- `src/domain/mensagens.ts` -- `TEXTOS_CONTAS` ganha os textos da lista (sai `salvas_agora`); `rotuloArquivado`, `rotuloFiltroDeContas`, `rotuloResultadoDaLista`, `rotuloAcoesDaConta`, `rotuloPartesDaConta`.
- `src/data/contas-repo.ts` (+ teste) -- `memoriaContas`: aplica a Conta devolvida no gerenciador de `contas_manuais`.
- `src/ui/MenuAcoes.tsx` -- `ItemMenuAcoes.desativado` e `.motivo` (item visível, sem efeito, com o motivo sob o rótulo).
- `src/features/contas-manuais/ListaContas.tsx` (novo) -- a tabela (`role`), etiquetas, situação e ⋯.
- `src/features/contas-manuais/ContasManuais.tsx` (+ teste jsdom reescrito) -- `useLinhas("contas_manuais")`, filtros, estados, `acoes` (o gancho da 5.4) e a Conta salva.
- `test/integracao/contas-manuais.test.ts`, `apoio.ts` -- Realtime de `contas_manuais` (só no CI).

## Tasks & Acceptance

**Execution:**
- [x] `lista-contas.ts` + testes -- situação, filtro, ordem, linha -- AD-1/15/16
- [x] `mensagens.ts` -- textos da lista e rótulos acessíveis
- [x] `contas-repo.ts` + teste -- aplica a Conta no gerenciador
- [x] `MenuAcoes.tsx`, `ListaContas.tsx`, `ContasManuais.tsx` + testes -- tela
- [x] `test/integracao/contas-manuais.test.ts` -- Realtime de `contas_manuais` (CI)
- [x] `spec`, `sprint-status.yaml`, `deferred-work.md`

**Acceptance Criteria:**
- Given a tela Contas com a Silvia, o William, o TVbox e a Bombinhas, when Rafael a abre, then vê Conta (com a repetição), Valor por mês, Responsável ou Divisão (etiquetas), Tipo e Situação, como no mockup.
- Given os filtros "Ativas / Encerradas / Todas", when Rafael toca em cada um, then a lista mostra o que o filtro diz e anuncia a contagem; abre em "Ativas".
- Given o ⋯ de uma linha, when Rafael o abre, then vê Editar, Encerrar e Excluir (desativados "Em breve" até a 5.4) e o nome acessível "Ações de NOME".
- Given nenhuma Conta, when a tela abre, then aparece "Nenhuma conta manual" com "＋ Nova conta", que abre o formulário da 5.1.
- Given uma Conta nova, alterada ou apagada em outro aparelho, when o Realtime avisa, then a lista muda sem recarregar.
- Given que Rafael salva uma Conta, when o formulário fecha, then ela já está na lista.
- Given que a internet cai, when Rafael olha a lista, then ela continua visível e "Salvar" fica desativado.

## Implementation Notes

- Implementado direto da spec, sem subagentes (Rafael não pediu). Revisão inline; nenhum revisor independente rodou.
- A situação mora no núcleo e **não** é gravada; `epic-5` segue `in-progress`.
- O teste "concorda com `parcelasDaConta`" amarra a lista ao materializador: se a regra de fim da Conta mudar num, o outro quebra.
- `ItemMenuAcoes` ganhou `desativado` e `motivo` (opcionais); quem não os usa não muda (o item sem `motivo` renderiza como antes).
- Com a janela do formulário aberta, o Radix esconde a lista do leitor de tela (`aria-hidden`); os testes da lista por trás usam `hidden: true`.
- O botão "＋ Nova conta" aparece no topo (nome acessível "Nova conta manual") e, sem Contas, também no estado vazio (nome "Nova conta"), para o fluxo do UX ("Nenhuma conta manual", com "＋ Nova conta") sem mudar o botão do topo de lugar.

## Spec Change Log

## Review Triage Log

Revisão inline do agente de implementação; nenhum revisor independente rodou.

| Achado | Veredito | Evidência |
|---|---|---|
| Uma parcelada já terminada, salva com "Ativas" ligado, sumiria da tela depois de "Conta salva" | corrigido | `filtroQueMostra` (decisão 4) e teste "uma Conta salva que já nasce Encerrada não some" |
| Primeira pintura com Responsáveis ainda carregando mostraria "Removido" falso | corrigido | a tabela espera as três tabelas (`carregando`); teste "carregando os Responsáveis também espera" |
| `esperarEvento` do DELETE de `contas_manuais` esbarraria na FK da Série | corrigido | o teste apaga Lançamentos e Série antes (a FK não tem `on delete`) |
| Dois botões "＋ Nova conta" (topo e estado vazio) com o mesmo nome acessível | corrigido | o do topo tem `aria-label` "Nova conta manual"; o do vazio, "Nova conta" |
| A lista não pagina (limite de 1000 linhas do PostgREST) | aceito (low) | decisão 8 e `deferred-work.md` |
| O "Total da conta" (R$ 1.908,00) não aparece na lista | aceito (low) | é do formulário; entra depois se Rafael quiser |

## Design Notes

**Efeito em cada tela:** *Contas* -- a lista substitui "Salvas agora". *Painel, Blocos, mensagem, Revisar* -- nada muda. *Realtime* -- só um gerenciador novo no mapa (o genérico, para `contas_manuais`), que já entra em `recarregarTodos`.

**O que a 5.4 herda:** os três callbacks de `acoes` (cada um recebe a `LinhaConta`), a situação derivada (encerrar grava `encerrada_em_mes` e a lista muda sozinha) e a decisão aberta de o que o toque na linha faz.

**Produção:** nada a aplicar (sem migração). Nada em produção foi lido nem alterado.

## Verification

**Commands:**
- `npm run lint`, `npm run typecheck`, `npm test` -- sem erro (os testes `eslint-nucleo` e `eslint-formatos` estouram 5 s na rodada completa e passam sozinhos).
- Job `supabase` do CI -- roda `test/integracao/contas-manuais.test.ts`, incluindo o Realtime de `contas_manuais` (INSERT, UPDATE, DELETE).

**Manual checks (iPad):** a lista em 834 pt em pé e deitado (sem rolagem lateral, etiquetas quebrando, cabeçalho fixo), o toque de 44 pt na linha e no ⋯, o VoiceOver lendo "Ativas, 4 contas", "Ações de Bombinhas" e "Editar Em breve", e a lista mudando ao salvar a Conta em outro aparelho.
