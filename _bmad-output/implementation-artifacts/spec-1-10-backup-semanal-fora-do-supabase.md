---
title: 'História 1.10: Backup semanal fora do Supabase'
type: 'feature'
created: '2026-11-03'
status: 'done'
route: 'dispatch'
baseline_commit: '3c1b87306d12f97a9e5b9d815707257bb5345174'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Os dados do Conta Comigo vivem só no Supabase Free (um projeto, sem backup próprio); se o banco se perder, o histórico some (AD-17).

**Approach:** Um workflow `.github/workflows/backup.yml` (semanal e manual) faz `supabase db dump` de produção (papéis, schema e dados), empacota, cifra com `age` para a chave pública do repositório e guarda só o arquivo cifrado como artifact por 90 dias. O CI prova a restauração: gera dados de exemplo no Supabase local, roda os mesmos scripts de backup e de restauração num Supabase local novo (sem migrações) e compara tudo. O passo a passo fica em `docs/backup.md`.

## Boundaries & Constraints

**Always:**
- Backup e teste usam os mesmos scripts (`scripts/backup/gerar.sh`, `scripts/backup/restaurar.sh`); o workflow só os chama.
- Conexão de produção só pelo segredo do GitHub `SUPABASE_DB_URL` (URI do Session pooler, porta 5432, senha codificada em URL; o runner não tem IPv6). Sem o segredo, o job falha com mensagem que diz o nome e onde cadastrar.
- Só o `.age` sai do runner; os `.sql` em claro ficam em diretório com `umask 077` e são apagados logo após cifrar.
- Chave pública em `scripts/backup/destinatarios-age.txt`. A privada nunca entra no repositório nem no chat; `.gitignore` bloqueia nomes típicos de chave e de backup.
- Teste de restauração só no CI (Supabase local no Docker do runner), com par de chaves `age` descartável gerado no próprio job; nunca com dados nem chave de produção.
- "Completo" = para toda tabela de `public` e para `auth.users`/`auth.identities`: mesma contagem e mesmo hash do conteúdo; mais políticas RLS, tabelas da publicação `supabase_realtime`, `replica identity` e funções de `public` iguais. Toda tabela de `public` precisa ter ao menos uma linha nos dados de exemplo (o teste falha se faltar, para histórias futuras estenderem).
- Agenda: domingo 06:00 UTC (03:00 em São Paulo) e `workflow_dispatch`. `permissions: contents: read`.

**Never:** sem migração, sem código em `src`, sem chamar o banco de produção no CI de PR, sem guardar o dump em claro em artifact, cache ou log, sem pedir senha ou chave privada no chat.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Backup semanal | segredo e chave pública presentes | artifact `backup-AAAA-MM-DD` com um `.tar.gz.age` (roles, schema, data, info), 90 dias | N/A |
| Sem segredo | `SUPABASE_DB_URL` vazio | job falha antes do dump | `::error::` com o nome do segredo e Settings → Secrets and variables → Actions |
| Chave pública ausente/placeholder | arquivo sem linha `age1…` | job falha antes do dump | mensagem apontando `docs/backup.md` |
| Restauração no CI | dados de exemplo no local 1 | local 2 restaurado tem impressão digital idêntica | diff das impressões no log e job vermelho |

</frozen-after-approval>

## Code Map

- `.github/workflows/ci.yml` -- job `supabase` é o modelo (Node 22, `npm ci`, `npx supabase start`/`stop --no-backup`, `status -o env`); novo job `backup` ao lado.
- `supabase/config.toml` -- `project_id = "conta-comigo"`, porta 54322, `major_version = 17`; a CLI usa a imagem desta versão no `db dump`. O segundo Supabase local usa cópia com outro `project_id` numa pasta temporária, sem `migrations`.
- `supabase/migrations/*.sql` -- tabelas `responsaveis`, `tipos`, `status`, `configuracoes`, `config_ciclo` (colunas/checks para os dados de exemplo).
- CLI 2.122 (`npx supabase db dump --dry-run`): dados com `SET session_replication_role = replica` e incluem `auth`/`storage` (exceto tabelas de migração); schema exclui `auth`, `storage`, `supabase_migrations`; `--role-only` comenta papéis reservados. Histórico de migrações não vem no dump.
- `docs/infraestrutura.md`, `README.md` -- apontar para `docs/backup.md`.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/backup/gerar.sh` -- `gerar.sh <db-url> <destinatarios> <saida>`: `db dump` roles/schema/data (`--use-copy`), `info.txt` (data UTC, commit, versão da CLI, lista de migrações), `tar | age -R`, apaga os `.sql`, imprime o caminho.
- [x] `scripts/backup/restaurar.sh` -- `restaurar.sh <backup.tar.gz> <db-url>`: extrai em temporário e roda `psql --single-transaction -v ON_ERROR_STOP=1` com roles, schema e data, como no guia do Supabase.
- [x] `scripts/backup/impressao-digital.sql` -- consulta psql que imprime a impressão digital descrita em Always.
- [x] `scripts/backup/destinatarios-age.txt` -- chave pública do Rafael (gerada por ele).
- [x] `test/backup/dados-exemplo.sql` -- usuário em `auth.users`/`auth.identities` e linhas em todas as tabelas de `public` (acentos, emoji, nulos, arquivados).
- [x] `.github/workflows/backup.yml` -- agenda, checagens de segredo e chave, `apt-get install age`, `gerar.sh`, `upload-artifact@v4` com `retention-days: 90` e `if-no-files-found: error`.
- [x] `.github/workflows/ci.yml` -- job `backup`: local 1 + exemplo + impressão A + `gerar.sh` com chave descartável; `stop`; local 2 sem migrações; `age -d` + `restaurar.sh`; impressão B; `diff`; checagem de tabela vazia.
- [x] `docs/backup.md`, `docs/infraestrutura.md`, `README.md`, `.gitignore` -- gerar o par de chaves, guardar a privada, cadastrar `SUPABASE_DB_URL`, baixar (`gh run download`), decifrar, restaurar num projeto novo (e `supabase migration repair`, variáveis da Vercel), limites (agenda desativa após 60 dias sem atividade no repositório).

**Acceptance Criteria:**
- Given o PR, when o CI roda, then o job `backup` restaura num Supabase local novo e as impressões digitais são iguais.
- Given o merge e o segredo cadastrado, when o workflow é disparado à mão, then o run fica verde e o artifact tem só o `.age`, com 90 dias.

## Design Notes

Restauração num Supabase novo (não no que já tem migrações) é o cenário real de desastre e evita conflito do `schema.sql` com tabelas existentes. Depois de restaurar num projeto que vire produção, `supabase migration repair --status applied <versões de info.txt>` alinha o histórico.

## Verification

**Commands:**
- `bash -n scripts/backup/*.sh`, `npx eslint .`, `npx tsc --noEmit`, `npx vitest run` -- expected: verde no Mac.
- CI do PR -- expected: jobs `verificar`, `supabase` e `backup` verdes.

**Manual checks (if no CLI):**
- Depois do merge: disparar `Backup` à mão, conferir artifact `backup-…` com um `.tar.gz.age` e retenção de 90 dias.

## Implementation Notes

- Scripts em `scripts/backup/` (`gerar.sh`, `restaurar.sh`, `impressao-digital.sql`, `destinatarios-age.txt` com a chave pública do Rafael); dados de exemplo em `test/backup/dados-exemplo.sql`.
- Job `backup` no `ci.yml`: local 1 com migrações e exemplo → impressão A → `gerar.sh` com chave descartável → `stop` → local 2 (cópia do `config.toml` com `project_id = "conta-comigo-restauracao"`, sem migrações, em `$RUNNER_TEMP`) → `age -d` + `restaurar.sh` → impressão B → `diff`. Os dois locais sobem com `-x studio,imgproxy,edge-runtime,logflare,vector`.
- `config_ciclo` de exemplo usa o mês corrente (o gatilho recusa Mês no passado).
- Nada rodou no Mac (sem Docker, `age` nem `psql`); o primeiro teste real é o CI.

## Spec Change Log

## Review Triage Log

Revisão 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Achado | Veredito | Evidência | Rota |
|---|--------|----------|-----------|------|
| 1 | Impressão digital sem privilégios (ACL) de tabelas e funções (vg, blind) | medium | Migrações fazem GRANT/REVOKE em RPCs; `pg_get_functiondef` não muda se o ACL se perder | patch |
| 2 | Passo de recusa do gerar.sh passa sem as checagens (vg) | medium | URL fictícia em porta 1 falha sozinha e não deixa arquivo | patch |
| 3 | Falha ao ler migrações engolida; info.txt nunca conferido (vg, blind, edge) | medium | `2>/dev/null` com `echo` de reserva em gerar.sh; CI não lê info.txt | patch |
| 4 | `$(gerar.sh | tail -1)` sem pipefail esconde falha (edge) | low | Shell padrão do Actions sem `shell:` é `bash -e`, sem pipefail | patch |
| 5 | Nome do artifact e do arquivo calculam a data duas vezes (blind, edge) | low | Virada de meia-noite UTC entre as chamadas | patch |
| 6 | Índices fora da impressão digital (blind) | low | `tipos_owner_id_idx`, `config_ciclo_owner_id_vigente_desde_idx` não são restrições | patch |
| 7 | Sequências fora da impressão digital (blind, edge) | false | Nenhuma sequência: ids são `uuid` | rejeitado |
| 8 | Views, tipos e extensões fora da impressão digital (blind) | low | Não existem no schema; cobrir quando surgirem | rejeitado |
| 9 | Gatilhos/funções em `auth` não conferidos (blind) | false | Migrações não criam nada em `auth` | rejeitado |
| 10 | psql 16 no runner rejeita `restrict` (blind, edge) | false | A CLI comenta `restrict`/`unrestrict` no dump (`--dry-run`) | rejeitado |
| 11 | Comentário do restaurar.sh ambíguo sobre o SET (blind) | low | data.sql já tem o SET e o script repete | patch |
| 12 | URL com senha como argumento de processo (blind) | low | Runner efêmero, segredo mascarado; `--db-url` é argumento da CLI de qualquer jeito | rejeitado |
| 13 | AD-17 citado errado (blind) | false | ARCHITECTURE-SPINE.md: AD-17 é "Operação: plano gratuito com backup fora do Supabase" | rejeitado |
| 14 | Agenda desativada após 60 dias sem alerta (blind) | low | Documentado em Limites; alerta exige mecanismo novo | defer |
| 15 | Passo 5 sem comando para listar versões (blind) | low | info.txt tem `versão nome`; correção direta no doc | patch |
| 16 | Passo 6 sem lembrar chaves novas e configurações do painel (blind) | low | Correção direta no doc | patch |
| 17 | Job pesado em todo PR (blind) | low | Filtro por caminho exige separar workflow; schema muda em PRs comuns | rejeitado |
| 18 | Diff sem a spec e o sprint-status (blind) | false | Excluídos de propósito do diff de código | rejeitado |
| 19 | CRLF/espaço no arquivo de chave (edge) | low | Arquivo versionado com LF; improvável | rejeitado |
| 20 | `.age` parcial deixado em falha (edge) | low | Job falha e a pasta é do runner efêmero | rejeitado |
| 21 | Checagens do backup.yml só rodam em produção (vg) | low | Conferidas no disparo manual após o merge | rejeitado |
| 22 | Dois runs no mesmo dia com o mesmo nome de artifact (vg) | false | Artifacts são por run; download usa o id do run | rejeitado |
