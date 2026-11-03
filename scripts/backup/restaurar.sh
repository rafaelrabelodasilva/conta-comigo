#!/usr/bin/env bash
# Restaura um backup já decifrado (História 1.10).
#
# Uso: scripts/backup/restaurar.sh <backup.tar.gz> <db-url>
#
#   <backup.tar.gz>  saída de `age -d` sobre o `.tar.gz.age` de gerar.sh.
#   <db-url>         banco de destino: um Supabase NOVO, sem as migrações
#                    aplicadas (o schema.sql cria as tabelas).
#
# Roda papéis, schema e dados numa transação só, parando no primeiro erro,
# como no guia de restauração do Supabase. Antes do data.sql, o script roda
# `SET session_replication_role = replica` (o data.sql também o faz), o que
# desliga os gatilhos: `updated_at` e as checagens dos gatilhos não
# reescrevem nada. Usado pelo CI para provar a restauração.

set -euo pipefail
umask 077

if [ "$#" -ne 2 ]; then
  echo "Uso: $0 <backup.tar.gz> <db-url>" >&2
  exit 2
fi

backup="$1"
db_url="$2"

command -v psql >/dev/null || { echo "Comando 'psql' não encontrado." >&2; exit 1; }
test -f "$backup" || { echo "Arquivo '$backup' não existe." >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
tar -C "$tmp" -xzf "$backup"
pasta="$tmp/backup"

for f in roles.sql schema.sql data.sql info.txt; do
  test -f "$pasta/$f" || { echo "Backup sem $f." >&2; exit 1; }
done

echo "Restaurando backup:" >&2
sed -n '1,4p' "$pasta/info.txt" >&2

# Privilégios padrão do Supabase: toda tabela, função e sequência que o
# `postgres` cria em `public` já nasce com GRANT para anon, authenticated e
# service_role. O dump traz só os GRANT/REVOKE em relação ao padrão do Postgres,
# então sem isto as funções restauradas ganhariam EXECUTE para `anon` (que a
# origem revogou). Desliga o padrão enquanto o schema é criado e religa depois;
# a impressão digital confere objetos e padrões (acl_funcao, acl_padrao).
papeis='anon, authenticated, service_role'
sem_padrao=""
com_padrao=""
for tipo in TABLES FUNCTIONS SEQUENCES; do
  sem_padrao+="ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON $tipo FROM $papeis; "
  com_padrao+="ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON $tipo TO $papeis; "
done

psql -X \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file "$pasta/roles.sql" \
  --command "$sem_padrao" \
  --file "$pasta/schema.sql" \
  --command "$com_padrao" \
  --command 'SET session_replication_role = replica' \
  --file "$pasta/data.sql" \
  --dbname "$db_url" >/dev/null

echo "Restauração concluída. Migrações registradas no backup:" >&2
sed -n '/^migracoes:/,$p' "$pasta/info.txt" >&2
