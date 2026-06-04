#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
codex_home="${CODEX_HOME:-$repo_root/.codex}"
global_codex_home="${HOME}/.codex"

ln -sfn "$repo_root/docs/skills" "$codex_home/skills"

if [ -d "$global_codex_home/skills/.system" ]; then
  ln -sfn "$global_codex_home/skills/.system" "$repo_root/docs/skills/.system"
fi

if [ -f "$global_codex_home/auth.json" ]; then
  ln -sfn "$global_codex_home/auth.json" "$codex_home/auth.json"
fi

if [ -f "$global_codex_home/config.toml" ]; then
  ln -sfn "$global_codex_home/config.toml" "$codex_home/config.toml"
fi

exec env CODEX_HOME="$codex_home" codex "$@"
