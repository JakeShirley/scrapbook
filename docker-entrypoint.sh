#!/bin/sh
set -eu

data_dir="${SCRAPBOOK_DATA_DIR:-/data/scrapbook}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$data_dir"
  chown -R node:node "$data_dir"
  exec su node -s /bin/sh -c 'exec "$@"' sh "$@"
fi

mkdir -p "$data_dir"
exec "$@"