---
title: 'PR de correção: 10 defeitos do deferred-work'
type: 'bugfix'
created: '2026-11-21'
status: 'review'
baseline_commit: '966754e'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-conta-comigo-2026-11-01/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

# PR de correção: 10 defeitos do `deferred-work.md`

Não é uma história nova. Uma PR (`correcao-10-defeitos-do-deferred-work`), **um commit por defeito** (`Defeito N: ...`), para o Rafael reverter um sem perder os outros. Cada defeito foi **reproduzido com um teste que falha** antes de corrigir (o SQL do defeito 1, no Postgres em memória, pglite, fora do projeto), corrigido no **núcleo** quando a regra é de negócio (AD-1), e a entrada do `deferred-work.md` foi fechada com o motivo. Onde a correção mudou uma decisão de uma spec antiga, a spec ganhou uma nota "revista na PR de correção" (o texto antigo ficou).

## Os 10 defeitos

| # | Defeito | Reproduzia? | O que mudou, onde | Teste | Ficou de fora |
|---|---|---|---|---|---|
| 1 | A parcela de Conta excluída à mão volta no dia seguinte (5.4) | Sim (pglite: o Cron recriou a parcela, 4 linhas em vez de 3) | **Migração** `20261205120000_parcela_pulada_da_conta.sql`: coluna `lancamentos.excluido_pela_conta`; `materializar_contas_manuais` não recria uma mãe excluída da Série sem a marca; `excluir_linhas_da_conta` grava a marca; `restaurar_conta_manual` a zera. Núcleo: `parcelasPuladas` (`alterar-conta.ts`), a prévia do Editar e do Encerrar a desconta; repositório com leitura tolerante (banco antigo). | `alterar-conta.test.ts`, `contas-repo-alterar.test.ts`, `test/integracao/contas-manuais.test.ts` (reescrito), 8 cenários no pglite | As parcelas que o Cron já recriou antes (AD-16, só daqui para a frente); o job `supabase` do CI prova RLS, Realtime e a igualdade de `database.types.ts` |
| 2 | Fatura ou Conta num Mês que já tem histórico da planilha duplica o Mês (3.10, 5.1) | Sim (a RPC e a 3.12 só olham as linhas da Fatura) | Aviso com o número e o Mês, **só aviso com confirmação** ("Importar mesmo assim", "Salvar mesmo assim"), nada é apagado sozinho. Núcleo: `historico-do-mes.ts`; `lerPrevistosDoMes` devolve `historico`; `repoContas().mesesComHistorico`; formulário de Conta nova e passo 3 da importação. | `historico-do-mes.test.ts`, `faturas-repo.test.ts`, `contas-repo-alterar.test.ts`, `FormularioConta.test.tsx`, `ImportarFatura.test.tsx` | A reimportação não mudou (já avisava) |
| 3 | O histórico da planilha vira "Atrasado" e pendente (6.4) | Sim (3 testes falharam) | Regra única `ehLinhaDeHistorico`, usada por `podeAtrasar` e `separarPendentes`: o histórico **fica fora** do atraso e do Saldo pendente (não é marcado como pago na importação). Grade, filtro, lembrete e Cron, cartões de Recebimentos, Saldo e "Cobrar pendências" concordam (AD-10). | `atraso.test.ts`, `projecoes-pendente.test.ts`, `lembretes.test.ts`, `recebimentos.test.ts`, `cobrar-pendencias.test.ts`, `Painel.test.tsx` | O histórico segue somando onde a soma é "tudo" (FR-26, Previsão, Meu gasto) |
| 4 | O "Falta receber" do hero soma duas vezes e um Bloco que não calcula some em silêncio (6.5) | Sim (4 testes falharam) | `faltaReceberDoMes` soma **linhas distintas**, cada uma uma vez, na Fórmula do primeiro Bloco que a cita (ordem `ordem`); o hero diz "N Blocos não entraram na soma"; se nenhum calcula, "—". Texto em `mensagens.ts`. | `recebimentos.test.ts` (Casal e Casal ÷ 2), `FaturaDoMes.test.tsx`, `Painel.test.tsx` | Os cartões de Recebimentos não mudam |
| 5 | "Dispensar" e "Desfazer" trazem de volta o aviso do Revisar já lido (8.2, 8.3) | Sim (2 testes falharam) | **Sem migração (opção A):** a chave do aviso do Revisar usa o dia do maior `created_at` entre as Faturas e os cartões (`fatura_cartoes`, apagados e regravados a cada reimportação), não o `updated_at` da Fatura. | `avisos-revisar.test.ts`, `Avisos.test.tsx` | A coluna "importada em" (B) não foi preciso; custo: uma vez depois do deploy o aviso pode voltar como "Novo" |
| 6 | O Cron falha em silêncio e a leitura de `contas_manuais` corta em 1000 linhas (5.3) | Sim (a leitura não era paginada) | Leitura paginada (`order("id")` + `range`); as outras leituras do Cron já eram paginadas. Decisão: **basta o log da Vercel**, com `falhas` na linha de erro (sem tabela, rota nem aviso no app). | `route.test.ts` (1001 Contas no fake, 1000 exatas, página que falha, cabeçalho de falha) | Aviso dentro do app: decisão do Rafael |
| 7 | O lembrete do dia se perde por erro transitório do push (7.5) | Sim (o teste antigo documentava a perda) | Regra pura `envioFoiTransitorio` e `deveTentarDeNovoAmanha` (`lembretes.ts`): se nenhum aparelho aceitou e houve erro transitório (rede, 408, 429, 5xx), o Cron apaga a chave. Não repete 404, 410, 401, 403 nem quando algum aparelho aceitou. Log: só `reagendadas`. | `lembretes-notificacao.test.ts`, `notificar-lembretes.test.ts`, `route.notificacoes.test.ts` | Texto, chave e `check` de `tipo` não mudam |
| 8 | O aparelho fica sem notificação quando o navegador troca a inscrição (7.5) | Sim (por leitura do código; não havia refazer) | O app refaz a inscrição ao abrir (`ReativarNotificacoes` no layout), só com a permissão já dada, sem pedi-la, e diz em texto "Notificações reativadas neste aparelho."; marca no aparelho (`ativa`/`desativada`) para não reativar quem desativou. Regra do núcleo: `deveReativarNotificacoes`. Sem rota sem sessão. | `notificacoes.test.ts`, `reativar-notificacoes.test.ts`, `ReativarNotificacoes.test.tsx`, `AtivarNotificacoes.test.tsx` | Inscrição que o navegador ainda devolve mas o push recusou (404/410) não é detectada |
| 9 | Na fila do Revisar, a mãe dividida mostra um seletor que não faz nada (3.8) | Sim (6 testes falharam) | Núcleo: `controlesDoItem`, `montarItem`: na mãe dividida o "Mudar" não tem seletor de Responsável, diz "Editar divisão", exige só o Tipo; o ✓ existe com Tipo e grava só o Tipo (o lote usa o mesmo). | `revisar.test.ts`, `JanelaMudar.test.tsx` | Link direto para a janela de Divisão (o Painel não tem endereço que a abra) |
| 10 | Sair e entrar sem recarregar deixa o estado da sessão anterior (1.4, "talvez") | **Sim** (a doc do Next diz que o redirect de Server Action é navegação no cliente) | `Gerenciador.zerar()` e `zerarGerenciadores()` em `realtime.ts` (mesmo objeto, repositórios guardam a referência); a página de entrar zera ao abrir; evento atrasado de canal trocado é ignorado. | `realtime-sessao.test.ts`, `ZerarAoEntrar.test.tsx` | Que o canal novo recebe com o token novo só o navegador prova (é do `supabase-js`) |

## Defeito 11 (pedido do Rafael depois de abrir a PR): Recebimentos e Painel

Duas queixas ao ver Recebimentos no iPad: (a) o Bloco "Rangel" parece contar o Casal inteiro; (b) o que se marca como pago em Recebimentos "não aparece direito" no Painel nas despesas divididas (Bombinhas). Investigação: os números do Saldo e do Pagamento já estavam certos (a mãe dividida nunca soma, o Pagamento quita as PARTES; provado em `projecoes-pendente.test.ts`), mas as telas não diziam isso.

| Defeito | O que mudou, onde | Teste |
|---|---|---|
| 11a: a lista "Ver" mostra o Casal pelo valor cheio e parece que o Rangel deve tudo | `partesDoBloco` (`recebimentos.ts`): parte exata por linha (as partes somam o Saldo); a lista "Ver" mostra "parte do Rangel: R$ 50,00" sob o valor cheio, só quando difere | `recebimentos.test.ts`, `Recebimentos.test.tsx` |
| 11b: o Painel não refletia o Pagamento | O cartão de Bloco de cobrança do Painel mostra "Falta R$ X" ou "Nada a receber" do Mês (mesmas `pendentesDosLancamentos` e Fórmula de Recebimentos); o cabeçalho da despesa dividida mostra "1 de 2 pagas" ou "Todas pagas" (`resumoDaDivisao`) | `BlocosDoMes.test.tsx`, `GradeLancamentos.test.tsx`, `divisao.test.ts`, `projecoes-pendente.test.ts` |

Ficou de fora: o Pagamento continua pelo valor cheio da linha (o modo "minha parte" cobre pagar menos); não achei um caso em que o Status de uma parte paga não chegasse ao Painel e peço ao Rafael o caso concreto se ainda ver divergência.

## Migração (só o defeito 1)

`supabase/migrations/20261205120000_parcela_pulada_da_conta.sql`: `alter table public.lancamentos add column excluido_pela_conta boolean not null default false`, uma marcação das linhas que a Conta já tinha excluído (Conta excluída, Meses depois do Encerramento, `parcela_n` acima do total) e três funções refeitas por `create or replace` com a mesma assinatura e os mesmos `grant`. **Não foi aplicada em produção; nenhum `supabase db push` foi rodado.** Compatível com o código antigo e com o novo em qualquer ordem; o Cron das 09:00 nunca responde 500 por causa dela (veja `docs/infraestrutura.md`).

## Verificação

Lint, typecheck e o build (Next 16.4.6, sem atualizar) passam neste computador; a suíte do Vitest passa (4388 testes; `eslint-nucleo.test.mts` e `eslint-formatos.test.mts` estouram 5 s na rodada completa e passam sozinhos). Nenhum teste fala com a rede. **Só o CI prova:** o SQL do defeito 1 contra o Supabase de verdade (RLS, Realtime e a igualdade de `src/data/database.types.ts`, editado à mão), o job "Backup gera e restaura" e a paginação do Cron e do PostgREST contra o banco real.
