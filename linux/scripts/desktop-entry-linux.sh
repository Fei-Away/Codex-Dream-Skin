#!/bin/bash

# Encode one executable path for the freedesktop Desktop Entry Exec key.
# Desktop entries use their own quoting rules: shell quoting is not enough for
# spaces, backslashes, quotes, backticks, dollar signs, or literal percent
# characters (the latter introduce field codes).
desktop_exec_arg() {
  local value="$1"
  case "$value" in
    *$'\n'*|*$'\r'*)
      printf 'desktop executable path contains a newline\n' >&2
      return 1
      ;;
  esac
  value="${value//\\/\\\\\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\`/\\\\\`}"
  value="${value//\$/\\\\$}"
  value="${value//%/%%}"
  printf '"%s"\n' "$value"
}
