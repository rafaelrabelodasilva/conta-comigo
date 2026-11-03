#!/usr/bin/env bash
# Gera um backup cifrado do banco (História 1.10, AD-17).
#
# Uso: scripts/backup/gerar.sh <db-url> <destinatarios-age> <pasta-de-saida>
#
#   <db-url>             URI do Postgres, com a senha codificada em URL.
#   <destinatarios-age>  arquivo com uma chave pública `age1…` por linha.
#   <pasta-de-saida>     onde fica o `backup-AAAA-MM-DD.tar.gz.age`.
#
# Faz `supabase db dump` de papéis, schema e dados (como no guia de backup do
# Supabase), escreve `info.txt` (data UTC, commit, versão da CLI e migrações
# aplicadas), empacota e cifra com `age`. Os `.sql` em claro ficam numa pasta
# temporária com `umask 077` e são apagados logo após cifrar; só o `.age` fica.
# Imprime o caminho do arquivo cifrado na última linha.
#
# Usado pelo workflow `Backup` (produção) e pelo job `backup` do CI (Supabase
# local), para que o teste de restauração prove exatamente este script.

set -euo pipefail
umask 077

if [ "$#" -ne 3 ]; then
  echo "Uso: $0 <db-url> <destinatarios-age> <pasta-de-saida>" >&2
  exit 2
fi

db_url="$1"
destinatarios="$2"
saida="$3"

for cmd in age tar npx psql; do
  command -v "$cmd" >/dev/null || { echo "Comando '$cmd' não encontrado." >&2; exit 1; }
done

if [ -z "$db_url" ]; then
  echo "URL do banco vazia." >&2
  exit 1
fi

if [ ! -f "$destinatarios" ] || ! grep -qE '^age1[0-9a-z]+$' "$destinatarios"; then
  echo "Nenhuma chave pública age1… em '$destinatarios'. Veja docs/backup.md." >&2
  exit 1
fi

# Caminhos absolutos antes de mudar de pasta.
destinatarios="$(cd "$(dirname "$destinatarios")" && pwd)/$(basename "$destinatarios")"
mkdir -p "$saida"
saida="$(cd "$saida" && pwd)"

# A CLI lê `supabase/config.toml` (major_version) a partir da raiz do repositório.
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$raiz"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
pasta="$tmp/backup"
mkdir "$pasta"

echo "Papéis…" >&2
npx supabase db dump --db-url "$db_url" --role-only -f "$pasta/roles.sql" >&2
# Permissões de parâmetro (ex.: `GRANT SET ON PARAMETER "log_min_messages" TO
# "supabase_realtime_admin"`) são da plataforma: o projeto novo já as tem e o
# `postgres` não pode concedê-las. A CLI não as filtra; ficam comentadas.
sed -i.orig -E 's/^GRANT .+ ON PARAMETER .+/-- &/' "$pasta/roles.sql" && rm -f "$pasta/roles.sql.orig"
echo "Schema…" >&2
npx supabase db dump --db-url "$db_url" -f "$pasta/schema.sql" >&2
echo "Dados…" >&2
npx supabase db dump --db-url "$db_url" --data-only --use-copy -f "$pasta/data.sql" >&2
# Tira os COPY sem nenhuma linha: não restauram nada, e os de tabelas da
# plataforma (ex.: storage.buckets_vectors) falham por permissão no projeto novo.
awk '
  /^COPY .* FROM stdin;$/ { cabecalho = $0; pendente = 1; next }
  pendente { pendente = 0; if ($0 == "\\.") next; print cabecalho }
  { print }
' "$pasta/data.sql" > "$pasta/data.sql.tmp" && mv "$pasta/data.sql.tmp" "$pasta/data.sql"

for f in roles schema data; do
  test -s "$pasta/$f.sql" || { echo "$f.sql saiu vazio." >&2; exit 1; }
done

# O histórico de migrações não vem no dump (schema `supabase_migrations` é
# excluído); fica em info.txt para o `supabase migration repair` depois.
if ! migracoes="$(psql -X -At -d "$db_url" \
  -c "select version || ' ' || coalesce(name, '') from supabase_migrations.schema_migrations order by version")"; then
  echo "Não foi possível ler o histórico de migrações (supabase_migrations.schema_migrations)." >&2
  exit 1
fi

{
  echo "Backup do Conta Comigo"
  echo "data_utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "commit: ${GITHUB_SHA:-$(git rev-parse HEAD 2>/dev/null || echo desconhecido)}"
  echo "supabase_cli: $(npx supabase --version 2>/dev/null | head -1)"
  echo "arquivos: roles.sql schema.sql data.sql"
  echo "migracoes:"
  printf '%s\n' "$migracoes" | sed 's/^/  /'
} > "$pasta/info.txt"

arquivo="$saida/backup-$(date -u +%Y-%m-%d).tar.gz.age"
tar -C "$tmp" -czf - backup | age -R "$destinatarios" -o "$arquivo"
rm -rf "$pasta"

test -s "$arquivo" || { echo "Arquivo cifrado vazio." >&2; exit 1; }
echo "$arquivo"
