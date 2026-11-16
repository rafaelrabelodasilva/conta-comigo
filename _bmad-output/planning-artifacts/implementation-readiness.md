---
title: "Prontidão para implementação: Conta Comigo"
date: 2026-11-01
gate: CONCERNS
skill: bmad-sprint-planning
---

# Prontidão para implementação: Conta Comigo

**Veredito: CONCERNS.** Dá para implementar o plano. São cinco pontos pequenos; só o 4 (monitoramento de erros) toca o Épico 1, e cada um pode ser resolvido na história indicada antes de ela começar.

## O que foi conferido

- PRD (final): FR-1 a FR-36 e FR-44 a FR-55 da v1, além dos NFR.
- UX (final): DESIGN.md e EXPERIENCE.md.
- Arquitetura (final): ARCHITECTURE-SPINE.md, de AD-1 a AD-17.
- Épicos (final): 7 épicos e 54 histórias.

**O que está bem:**

- Todos os FR da v1 aparecem no mapa de cobertura e chegam a pelo menos uma história.
- Os UX-DR 1 a 34 e as AD estão referenciados nos critérios de aceite.
- As fases 2 e 3 ficam de fora de forma explícita.
- Não há dependência de uma história em outra que venha depois. Quando uma história precisa de algo de um épico posterior, ela diz que esse algo "chega no Épico N", como em 2.3 → 3.11, 4.4 → 6.1 e 3.11 → 6.9.
- Os testes de aceite com os números de outubro/2026 estão repetidos nas histórias certas.

## Pontos de atenção

1. **Origem da classificação pela Regra (FR-12, Histórias 3.4 e 3.8).** "Reaplicar só aos Lançamentos que vieram daquela Regra" e a mensagem "Divisão aplicada pela Regra de NOME" pedem que o Lançamento guarde qual Regra o classificou. Nenhuma coluna para isso está registrada na Arquitetura nem nos épicos (por exemplo, `lancamentos.regra_id`).
   *Resolver:* incluir a coluna na migração da História 3.1, ou pedir um ajuste pontual via `bmad-architecture`.

2. **Dia exato em que o Lançamento fica "Atrasado" (FR-49, Histórias 6.4 e 7.4).** Os documentos não batem:
   - a UJ-2 do PRD diz que o atraso aparece em 17/11/26 (vencimento 06/11 + 10 dias);
   - o EXPERIENCE.md e a História 7.4 dizem "em atraso desde 16/11/26".

   Também não está definido se o dia do limite ainda conta como em dia.
   *Resolver:* Rafael decide antes da História 6.4 se o primeiro dia de atraso é o vencimento + tolerância + 1. Depois, alinhar o texto com `bmad-correct-course` ou direto na história.
   *Resolvido na História 6.4 (16/11/2026, decisão do Rafael):* o dia do vencimento e o da tolerância ainda estão em dia; o primeiro dia de atraso é vencimento + tolerância + 1 (17/11/26 no exemplo). Falta alinhar o texto do EXPERIENCE.md e da História 7.4 ("desde 16/11/26"), registrado no `deferred-work.md`.

3. **Arredondamento (FR-54 × AD-2).** O PRD diz "meio para cima" e o AD-2 diz "meio para longe do zero". Os dois só dão resultados diferentes com valores negativos.
   *Resolver:* vale o AD-2, que é mais específico e já está na História 2.2. É só uma observação.

4. **Monitoramento de erros sem história (Arquitetura → Deferred; epics.md, Additional Requirements).** A Arquitetura diz que o CI e o monitoramento de erros são definidos "na primeira story de infraestrutura", mas os critérios da História 1.1 só cobrem o CI. A ferramenta (ex.: Sentry, Vercel Logs) e a regra de não registrar texto de Fatura nem valores não estão em nenhuma história.
   *Resolver:* Rafael decide antes da História 1.1 se o monitoramento entra nela (e com qual ferramenta) ou se fica para depois. Afeta diretamente o próximo `bmad-build`.

5. **Herança de Divisão antes de a Divisão existir (FR-8, Histórias 3.7 e 3.8).** A História 3.7 diz que a parcela herda "Divisão", mas a coluna `divisao` só é criada na 3.8.
   *Resolver:* na 3.7, herdar a Divisão só se a coluna já existir, ou implementar a 3.8 antes da 3.7. Não bloqueia o Épico 1.

## Pré-requisitos que não são de planejamento

- **História 1.1:** precisa das contas do Rafael na Vercel (Hobby) e no Supabase (dois projetos Free, produção e desenvolvimento) ligadas ao repositório.
- **História 2.1:** precisa do PDF de outubro/2026 com a senha, de uma chave do Gemini e de um teste manual no Safari do iPad.
