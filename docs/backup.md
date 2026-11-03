# Backup do banco (História 1.10)

Cópia semanal e criptografada do banco de produção, guardada fora do Supabase (AD-17). Nenhum segredo fica neste arquivo.

## Como funciona

- Workflow `.github/workflows/backup.yml` (nome **Backup**): todo domingo às 06:00 UTC (03:00 em São Paulo) e quando disparado à mão.
- `scripts/backup/gerar.sh` faz `supabase db dump` de papéis (`roles.sql`), schema (`schema.sql`) e dados (`data.sql`, inclui `auth.users`/`auth.identities`), escreve `info.txt` (data UTC, commit, versão da CLI e migrações aplicadas), empacota em `tar.gz` e cifra com `age` para a chave pública de `scripts/backup/destinatarios-age.txt`.
- Só o arquivo cifrado `backup-AAAA-MM-DD.tar.gz.age` sai do runner, como artifact `backup-AAAA-MM-DD`, guardado por **90 dias**. Os `.sql` em claro ficam numa pasta temporária fechada (`umask 077`) e são apagados logo após cifrar.
- A conexão com produção vem só do segredo do GitHub `SUPABASE_DB_URL`. Sem ele, ou sem chave pública, o job falha antes do dump, dizendo o que falta.
- O CI de todo PR prova a restauração (job `backup` em `ci.yml`): sobe um Supabase local com as migrações e os dados de `test/backup/dados-exemplo.sql`, roda o mesmo `gerar.sh` com um par de chaves descartável, sobe um Supabase local novo **sem** migrações, decifra, roda `scripts/backup/restaurar.sh` e compara a impressão digital (`scripts/backup/impressao-digital.sql`) dos dois bancos: contagem e hash do conteúdo de toda tabela de `public` e de `auth.users`/`auth.identities`, políticas RLS, tabelas do Realtime, `replica identity`, funções, gatilhos e restrições. O CI nunca acessa produção.
- Toda tabela nova de `public` precisa de ao menos uma linha em `test/backup/dados-exemplo.sql`; senão o job `backup` falha.

## Preparar (uma vez, Rafael)

### 1. Gerar o par de chaves `age`

No Mac:

```bash
brew install age
age-keygen -o ~/conta-comigo-backup-chave-privada.txt
```

- O comando mostra a chave pública (`age1…`). Ela vai, numa linha, em `scripts/backup/destinatarios-age.txt` (já cadastrada).
- O arquivo `~/conta-comigo-backup-chave-privada.txt` é a **chave privada**. Guarde o conteúdo inteiro (a linha `AGE-SECRET-KEY-1…`) no gerenciador de senhas e numa cópia offline (pendrive) e depois apague o arquivo do Mac. Nunca no repositório, nunca no chat, nunca no Supabase nem na Vercel. Sem ela, nenhum backup pode ser aberto.
- Para trocar de chave: gere outra, troque a linha em `destinatarios-age.txt` por PR e guarde a privada antiga enquanto houver backups cifrados com ela (até 90 dias).

### 2. Cadastrar o segredo `SUPABASE_DB_URL`

1. Supabase → projeto `conta-comigo` → **Connect** → **Session pooler** (porta **5432**). Use o Session pooler: o runner do GitHub não tem IPv6 e a conexão direta é só IPv6.
2. Copie a URI (`postgresql://postgres.dpewdzsweowgyyadhjbk:[SENHA]@aws-…pooler.supabase.com:5432/postgres`) e troque `[SENHA]` pela senha do banco **codificada em URL** (por exemplo, `@` vira `%40`, `#` vira `%23`, `/` vira `%2F`). Se não lembrar a senha, redefina em **Project Settings → Database → Reset database password**.
3. GitHub → repositório `conta-comigo` → **Settings → Secrets and variables → Actions → New repository secret**: nome `SUPABASE_DB_URL`, valor a URI. Ou, no terminal, `gh secret set SUPABASE_DB_URL` (o `gh` pede o valor sem mostrá-lo).

### 3. Conferir

```bash
gh workflow run backup.yml
gh run list --workflow backup.yml --limit 1
```

O run deve ficar verde e o artifact `backup-AAAA-MM-DD` deve ter um único arquivo `.tar.gz.age`, com expiração em 90 dias.

## Restaurar (desastre)

Restaure sempre num projeto Supabase **novo** (sem as migrações aplicadas). Requisitos no Mac: `age`, `gh`, `psql` 17 (`brew install libpq && brew link --force libpq`) e Node 22 com `npm ci` feito no repositório.

1. **Baixar** o backup mais recente:
   ```bash
   gh run list --workflow backup.yml --status success --limit 5
   gh run download <id-do-run> -n backup-AAAA-MM-DD -D ~/restauracao
   ```
2. **Decifrar** (fora do repositório). Recrie `~/conta-comigo-backup-chave-privada.txt` com o conteúdo guardado no gerenciador de senhas e apague-o de novo no fim:
   ```bash
   age -d -i ~/conta-comigo-backup-chave-privada.txt -o ~/restauracao/backup.tar.gz ~/restauracao/backup-AAAA-MM-DD.tar.gz.age
   ```
3. **Criar um projeto novo** no Supabase (mesma região `sa-east-1`, Postgres 17). Pegue a URI do Session pooler dele, como no passo 2 de Preparar.
4. **Restaurar**, na raiz do repositório:
   ```bash
   bash scripts/backup/restaurar.sh ~/restauracao/backup.tar.gz "<URI do projeto novo>"
   ```
   Roda `roles.sql`, `schema.sql` e `data.sql` numa transação só (ou entra tudo, ou nada) e mostra as migrações registradas no backup.
5. **Alinhar o histórico de migrações** (o dump não traz a tabela de migrações). As versões ficam no `info.txt`, dentro do `backup.tar.gz` (linhas `versão nome` depois de `migracoes:`). Na raiz do repositório:
   ```bash
   tar -xzf ~/restauracao/backup.tar.gz -C ~/restauracao backup/info.txt
   npx supabase link --project-ref <ref-novo>
   awk '/^migracoes:/{f=1;next} f{print $1}' ~/restauracao/backup/info.txt \
     | xargs npx supabase migration repair --status applied
   npx supabase migration list   # local e remoto iguais
   ```
6. **Apontar o app** para o projeto novo: na Vercel (só Production), troque `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SECRET_KEY` pelas do projeto novo e faça redeploy. As chaves e a assinatura dos JWT do projeto novo são outras: todos os aparelhos (iPad e PC) precisam entrar de novo. O dump também não leva as configurações do painel (Auth, SMTP, templates de e-mail, URLs): refaça-as conferindo `docs/infraestrutura.md` (cadastro desligado, Site URL e Redirect URLs).
7. **Atualizar** o segredo `SUPABASE_DB_URL` com a URI do projeto novo e o ref em `docs/infraestrutura.md`.
8. Apague `~/restauracao` (tem os dados em claro) e `~/conta-comigo-backup-chave-privada.txt`.

## Limites

- O GitHub desativa workflows agendados depois de **60 dias sem atividade** no repositório. Se isso acontecer, reative em **Actions → Backup → Enable workflow** (ou faça qualquer commit).
- Artifacts expiram em **90 dias**: há no máximo ~13 backups semanais disponíveis.
- O backup é do banco (inclui usuários do Auth). Arquivos do Storage não entram (o app não usa Storage).
- Se o projeto Free estiver pausado, o dump falha e o run fica vermelho; o GitHub avisa por e-mail sobre runs que falham.
