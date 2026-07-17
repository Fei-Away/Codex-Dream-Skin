#!/bin/bash

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-macos.sh"

PACKAGE_FILE=""
DRY_RUN="false"
REPLACE="false"
APPLY_NOW="false"
APPLY_EXPLICIT="false"
NO_PROMPT="false"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --file) PACKAGE_FILE="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    --replace) REPLACE="true"; shift ;;
    --apply) APPLY_NOW="true"; APPLY_EXPLICIT="true"; shift ;;
    --no-apply) APPLY_NOW="false"; APPLY_EXPLICIT="true"; shift ;;
    --yes|--no-prompt) NO_PROMPT="true"; shift ;;
    *) fail "Unknown theme import argument: $1" ;;
  esac
done

if [ -z "$PACKAGE_FILE" ]; then
  [ "$DRY_RUN" = "false" ] || fail "--dry-run requires --file."
  PACKAGE_FILE="$(/usr/bin/osascript <<'APPLESCRIPT' 2>/dev/null || true
try
  return POSIX path of (choose file with prompt "选择 .dreamskin 主题包")
on error number -128
  return ""
end try
APPLESCRIPT
)"
  [ -n "$PACKAGE_FILE" ] || exit 0
fi
[ -f "$PACKAGE_FILE" ] || fail "Theme package does not exist: $PACKAGE_FILE"

ensure_node_runtime
if [ -f "$PROJECT_ROOT/tools/theme-package.mjs" ]; then
  THEME_PACKAGE_TOOL="$PROJECT_ROOT/tools/theme-package.mjs"
else
  THEME_PACKAGE_TOOL="$PROJECT_ROOT/../tools/theme-package.mjs"
fi
[ -f "$THEME_PACKAGE_TOOL" ] || fail "Theme package runtime is missing. Reinstall Dream Skin."
THEME_IMPORT_CORE="$(cd "$(dirname "$THEME_PACKAGE_TOOL")/../lib/theme-package" && pwd -P)/import-core.mjs"
[ -f "$THEME_IMPORT_CORE" ] || fail "Theme package report runtime is missing. Reinstall Dream Skin."

run_import() {
  "$NODE" "$THEME_PACKAGE_TOOL" import "$PACKAGE_FILE" \
    --platform macos --dream-skin-version "$SKIN_VERSION" "$@"
}

json_field() {
  /usr/bin/printf '%s' "$1" | "$NODE" -e '
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { text += chunk; });
    process.stdin.on("end", () => {
      try { const value = JSON.parse(text); process.stdout.write(String(value[process.argv[1]] ?? "")); } catch {}
    });
  ' "$2"
}

if ! DRY_REPORT="$(run_import --dry-run)"; then
  /usr/bin/printf '%s\n' "$DRY_REPORT"
  [ "$NO_PROMPT" = "true" ] || alert_user "主题包校验失败：$(json_field "$DRY_REPORT" message)"
  exit 1
fi
if [ "$DRY_RUN" = "true" ]; then
  /usr/bin/printf '%s\n' "$DRY_REPORT"
  exit 0
fi

SUMMARY_FIELDS="$(/usr/bin/printf '%s' "$DRY_REPORT" | "$NODE" -e '
  let text = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { text += chunk; });
  process.stdin.on("end", () => {
    const report = JSON.parse(text);
    process.stdout.write([
      report.packageId,
      report.packageVersion,
      report.contentHash,
      report.runtimeTheme.name,
      report.author?.name || "",
      (report.targets || []).join(", "),
      report.preview?.available ? "已提供" : "未提供",
      (report.warnings || []).map((warning) => warning.message || String(warning)).join("\n"),
    ].join("\u001f"));
  });
')"
IFS="$(/usr/bin/printf '\037')" read -r \
  PACKAGE_ID PACKAGE_VERSION CONTENT_HASH THEME_NAME AUTHOR_NAME TARGETS PREVIEW_STATUS WARNING_TEXT <<EOF
$SUMMARY_FIELDS
EOF

if [ "$NO_PROMPT" = "false" ]; then
  CHOICE="$(/usr/bin/osascript - "$THEME_NAME" "$PACKAGE_ID" "$PACKAGE_VERSION" "$AUTHOR_NAME" "$TARGETS" "$PREVIEW_STATUS" "$WARNING_TEXT" <<'APPLESCRIPT' 2>/dev/null || true
on run argv
  set summary to "名称：" & item 1 of argv & return & "包 ID：" & item 2 of argv & return & "版本：" & item 3 of argv & return & "作者：" & item 4 of argv & return & "目标：" & item 5 of argv & return & "预览图：" & item 6 of argv
  if item 7 of argv is not "" then set summary to summary & return & return & "兼容性提示：" & return & item 7 of argv
  return button returned of (display dialog summary with title "导入 Codex Dream Skin" buttons {"取消", "仅安装", "安装并应用"} default button "安装并应用" cancel button "取消")
end run
APPLESCRIPT
)"
  case "$CHOICE" in
    安装并应用) APPLY_NOW="true" ;;
    仅安装) APPLY_NOW="false" ;;
    *) exit 0 ;;
  esac
elif [ "$APPLY_EXPLICIT" = "false" ]; then
  APPLY_NOW="false"
fi

INSTALL_ARGS=(--install --state-root "$STATE_ROOT" --expected-content-hash "$CONTENT_HASH")
[ "$REPLACE" = "false" ] || INSTALL_ARGS+=(--replace)
if ! INSTALL_REPORT="$(run_import "${INSTALL_ARGS[@]}")"; then
  ERROR_CODE="$(json_field "$INSTALL_REPORT" code)"
  if [ "$ERROR_CODE" = "CONFLICT_CONFIRMATION_REQUIRED" ] && [ "$REPLACE" = "false" ] \
    && [ "$NO_PROMPT" = "false" ]; then
    CONFIRM="$(/usr/bin/osascript - "$THEME_NAME" <<'APPLESCRIPT' 2>/dev/null || true
on run argv
  return button returned of (display dialog "同一包 ID 已安装其他版本。要用“" & item 1 of argv & "”替换吗？" with title "替换主题" buttons {"取消", "替换"} default button "替换" cancel button "取消" with icon caution)
end run
APPLESCRIPT
)"
    [ "$CONFIRM" = "替换" ] || exit 0
    INSTALL_REPORT="$(run_import --install --state-root "$STATE_ROOT" --replace \
      --expected-content-hash "$CONTENT_HASH")" || {
      /usr/bin/printf '%s\n' "$INSTALL_REPORT"
      alert_user "主题替换失败：$(json_field "$INSTALL_REPORT" message)"
      exit 1
    }
  else
    /usr/bin/printf '%s\n' "$INSTALL_REPORT"
    [ "$NO_PROMPT" = "true" ] || alert_user "主题安装失败：$(json_field "$INSTALL_REPORT" message)"
    exit 1
  fi
fi

report_with_apply() {
  /usr/bin/printf '%s' "$1" | "$NODE" -e '
    let text = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { text += chunk; });
    process.stdin.on("end", async () => {
      const report = JSON.parse(text);
      const { pathToFileURL } = await import("node:url");
      const { addApplyResult } = await import(pathToFileURL(process.argv[2]).href);
      process.stdout.write(`${JSON.stringify(addApplyResult(report, process.argv[1]), null, 2)}\n`);
    });
  ' "$2" "$THEME_IMPORT_CORE"
}

if [ "$APPLY_NOW" = "true" ]; then
  if ! "$SCRIPT_DIR/switch-theme-macos.sh" --id "$PACKAGE_ID" \
    --expected-content-hash "$CONTENT_HASH"; then
    report_with_apply "$INSTALL_REPORT" "failed-after-install"
    alert_user "主题已安装，但未能应用：${THEME_NAME}"
    exit 1
  fi
  notify_user "已安装并应用：${THEME_NAME}"
  report_with_apply "$INSTALL_REPORT" "applied"
else
  notify_user "已安装：${THEME_NAME}（可稍后从已保存主题应用）"
  report_with_apply "$INSTALL_REPORT" "not-requested"
fi
