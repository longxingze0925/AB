#!/usr/bin/env bash
set -Eeuo pipefail

APK_REPO="${APK_REPO:-longxingze0925/AB}"
APK_REF="${APK_REF:-main}"
APK_RAW_BASE="${APK_RAW_BASE:-https://raw.githubusercontent.com/${APK_REPO}/${APK_REF}}"

# 本地运行时直接 exec 同目录的 apkctl.sh
script_dir=""
if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]}" ]]; then
  script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P || true)"
fi

if [[ -n "$script_dir" && -f "$script_dir/apkctl.sh" ]]; then
  exec bash "$script_dir/apkctl.sh"
fi

# 远程运行：下载 apkctl.sh 到临时目录再执行
tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT

curl -fsSL "$APK_RAW_BASE/ops/apkctl.sh" -o "$tmp_dir/apkctl.sh"
exec bash "$tmp_dir/apkctl.sh"
