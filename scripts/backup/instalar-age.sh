#!/usr/bin/env bash
# Instala o `age` (cifra o backup, História 1.10) no runner do GitHub Actions
# pelo binário oficial da release, com versão e SHA-256 fixos. O `apt-get
# install age` dependia do espelho do Ubuntu, que passou a falhar com
# "Temporary failure resolving 'security.ubuntu.com'" e derrubava o CI e o
# backup semanal; o GitHub (onde o runner já baixa o código) responde.
#
# Uso: scripts/backup/instalar-age.sh
# Para trocar de versão: baixe o tar.gz da release, confira o SHA-256 e mude
# as duas constantes abaixo.
set -euo pipefail

VERSAO="v1.2.1"
SHA256="7df45a6cc87d4da11cc03a539a7470c15b1041ab2b396af088fe9990f7c79d50"
URL="https://github.com/FiloSottile/age/releases/download/${VERSAO}/age-${VERSAO}-linux-amd64.tar.gz"

pasta="$(mktemp -d)"
trap 'rm -rf "$pasta"' EXIT

curl --fail --silent --show-error --location --retry 5 --retry-all-errors --retry-delay 3 \
  --output "$pasta/age.tar.gz" "$URL"
echo "${SHA256}  ${pasta}/age.tar.gz" | sha256sum --check --status \
  || { echo "SHA-256 do age diferente do esperado; nada foi instalado." >&2; exit 1; }
tar -xzf "$pasta/age.tar.gz" -C "$pasta"
sudo install -m 0755 "$pasta/age/age" "$pasta/age/age-keygen" /usr/local/bin/
age --version
