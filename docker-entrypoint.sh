#!/bin/sh
set -eu

data_dir="${ZAKKA_DATA_DIR:-/data/zakka}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$data_dir"
  chown -R node:node "$data_dir"

  if command -v runuser >/dev/null 2>&1; then
    exec runuser -u node -- "$@"
  fi

  command_name="$1"
  shift
  command_path="$(command -v "$command_name")"
  exec su -s /bin/sh -c 'exec "$@"' -- node sh "$command_path" "$@"
fi

mkdir -p "$data_dir"
exec "$@"