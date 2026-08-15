# Dream Skin Linux 版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `linux/` 平台目录，以「bash + Node 脚本 + 交互菜单/子命令」形式移植 macOS 引擎，发布 `.deb` 与 `tar.gz` 两种资产，功能对齐 macOS/Windows 双端。

**Architecture:** 新建 `linux/` 目录镜像 `macos/` 结构。shell 层从 `common-macos.sh` 移植为 `common-linux.sh`（只改平台相关的状态根、通知、Codex 发现/验签/启动、进程探测），Node 层（injector.mjs、theme-config.mjs、write-theme.mjs 等）几乎原样复用，唯一改动是 injector 的 operation-state 从 plutil 解析改为直接读 JSON。共享渲染源仍由 `tools/sync-runtime-assets.mjs` 生成到 `linux/assets/`，不手写第三份。

**Tech Stack:** bash 4+（Ubuntu 24.04 默认）、Node.js >= 18（系统 node）、CDP over HTTP（node:http/fetch）、dpkg-deb（原生打包，无新依赖）、GitHub Actions（ubuntu-24.04 runner）。

**设计文档：** `docs/superpowers/specs/2026-08-15-linux-support-design.md`（本计划依据）。

---

### Task 1: 扩展 sync 工具生成 linux/assets/

**Files:**
- Modify: `tools/sync-runtime-assets.mjs`（outputs 数组 9 条目中 8 个 macos 相关条目加 `linux/...` 路径）

- [x] **Step 1: 在 outputs 数组里为每个条目追加 linux 路径**

`tools/sync-runtime-assets.mjs` outputs 数组共 9 个条目，其中 8 个涉及 macos/assets 或 macos/scripts，`paths` 都追加对应 linux 路径（`compileWindowsImageMetadata` 条目除外），最终为：

```js
  {
    content: selectorSource,
    paths: ["macos/assets/selectors.json", "windows/assets/selectors.json", "linux/assets/selectors.json"],
  },
  {
    content: compileSelectorTokens(sourceCss, "runtime/dream-skin.css"),
    paths: ["macos/assets/dream-skin.css", "windows/assets/dream-skin.css", "linux/assets/dream-skin.css"],
  },
  {
    content: compileRuntime(sourceRuntime),
    paths: ["macos/assets/renderer-inject.js", "windows/assets/renderer-inject.js", "linux/assets/renderer-inject.js"],
  },
  {
    content: sourceThemePackageValidator,
    paths: [
      "macos/assets/theme-package-validator.mjs",
      "windows/assets/theme-package-validator.mjs",
      "linux/assets/theme-package-validator.mjs",
    ],
  },
  {
    content: sourceSafeCssValidator,
    paths: [
      "macos/assets/safe-css-validator.mjs",
      "windows/assets/safe-css-validator.mjs",
      "linux/assets/safe-css-validator.mjs",
    ],
  },
  {
    content: sourceSafeCssPolicy,
    paths: [
      "macos/assets/safe-css-policy.json",
      "windows/assets/safe-css-policy.json",
      "linux/assets/safe-css-policy.json",
    ],
  },
  {
    content: compileSafeCssFileValidator(sourceSafeCssFileValidator),
    paths: [
      "macos/scripts/validate-safe-css-file.mjs",
      "windows/scripts/validate-safe-css-file.mjs",
      "linux/scripts/validate-safe-css-file.mjs",
    ],
  },
  {
    content: sourceImageMetadata,
    paths: ["macos/scripts/image-metadata.mjs", "linux/scripts/image-metadata.mjs"],
  },
```

（`compileWindowsImageMetadata` 条目不变，Windows 有独立的 image-metadata 变体。）

- [x] **Step 2: 先建 linux 骨架目录再生成**

```bash
mkdir -p linux/assets linux/scripts linux/tests linux/presets
```

- [x] **Step 3: 运行 sync 并确认生成**

Run: `node tools/sync-runtime-assets.mjs`
Expected: 输出含 8 行 `updated=linux/...`；`ls linux/assets/` 有 6 个文件（renderer-inject.js、selectors.json、dream-skin.css、theme-package-validator.mjs、safe-css-validator.mjs、safe-css-policy.json）、`ls linux/scripts/` 有 `image-metadata.mjs` 与 `validate-safe-css-file.mjs`

- [x] **Step 3b: 补齐默认主题资产（非 sync 生成，同 macos 直接入库）**

```bash
cp macos/assets/theme.json macos/assets/portal-hero.png linux/assets/
git add linux/assets/theme.json linux/assets/portal-hero.png
```

（macos/assets 有 8 个入库文件：6 个 sync 生成 + theme.json + portal-hero.png；linux 对齐后同为 8 个。）

- [x] **Step 4: 用 --check 验证幂等**

Run: `node tools/sync-runtime-assets.mjs --check`
Expected: 退出码 0，无 `out-of-date=` 输出

- [x] **Step 5: Commit**

```bash
git add tools/sync-runtime-assets.mjs linux/assets linux/scripts/image-metadata.mjs linux/scripts/validate-safe-css-file.mjs
git commit -m "feat(linux): generate linux assets via sync-runtime-assets"
```

### Task 2: linux 骨架 + VERSION + 本地化

**Files:**
- Create: `linux/VERSION`、`linux/scripts/localization-linux.sh`
- Create: `linux/tests/run-tests.sh`（本任务只放 bash -n + 本地化契约）
- Copy: `macos/scripts/localization-macos.sh` → `linux/scripts/localization-linux.sh`（改 1 处）

- [ ] **Step 1: 写失败测试（本地化契约）**

Create `linux/tests/localization-contract.test.sh`：

```bash
#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

ZH_COPY="$(DREAMSKIN_LANG=zh-CN /bin/bash -c '
  . "$1/scripts/localization-linux.sh"
  printf "%s|%s|%s" "$(dreamskin_language)" "$(dreamskin_text apply)" "$(dreamskin_text skin_applied)"
' _ "$ROOT")"
EN_COPY="$(DREAMSKIN_LANG=en-US /bin/bash -c '
  . "$1/scripts/localization-linux.sh"
  printf "%s|%s|%s" "$(dreamskin_language)" "$(dreamskin_text apply)" "$(dreamskin_text skin_applied)"
' _ "$ROOT")"
[ "$ZH_COPY" = 'zh|应用|皮肤已应用' ] \
  || { printf 'Chinese runtime localization contract failed: %s\n' "$ZH_COPY" >&2; exit 1; }
[ "$EN_COPY" = 'en|Apply|Skin applied' ] \
  || { printf 'English runtime localization contract failed: %s\n' "$EN_COPY" >&2; exit 1; }

# Fallback follows LANG when DREAMSKIN_LANG is unset
LANG_COPY="$(LANG=zh_CN.UTF-8 /bin/bash -c '
  . "$1/scripts/localization-linux.sh"
  dreamskin_language
' _ "$ROOT")"
[ "$LANG_COPY" = 'zh' ] || { printf 'LANG fallback failed: %s\n' "$LANG_COPY" >&2; exit 1; }
```

- [ ] **Step 2: 运行确认失败**

Run: `bash linux/tests/localization-contract.test.sh`
Expected: FAIL（`localization-linux.sh: No such file`）

- [ ] **Step 3: 复制并改写 localization**

```bash
cp macos/scripts/localization-macos.sh linux/scripts/localization-linux.sh
```

把文件头注释改为：

```bash
# Shared user-facing language resolver for Linux runtime scripts. Callers may
# set DREAMSKIN_LANG to zh-CN or en-US; otherwise LANG/LC_* is used.
```

把 `dreamskin_language()` 里 `defaults read -g AppleLanguages` 的 macOS 兜底分支（第 22–28 行整段 if）替换为：

```bash
          ;;
        *)
          DREAMSKIN_RESOLVED_LANG="en"
          ;;
```

（即 locale 已在前一个 case 匹配 zh，其余一律 en，删掉 `defaults` 调用。）文本表 36–137 行保持原样。

- [ ] **Step 4: 运行确认通过**

Run: `bash linux/tests/localization-contract.test.sh`
Expected: 退出码 0

- [ ] **Step 5: 建 VERSION 与测试运行器**

Create `linux/VERSION`（内容一行）：
```
1.5.14
```

Create `linux/tests/run-tests.sh`：

```bash
#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="${NODE:-$(command -v node)}"
[ -x "$NODE" ] || { printf 'node was not found. Install nodejs (>= 18) first.\n' >&2; exit 1; }

while IFS= read -r file; do /bin/bash -n "$file"; done < <(
  find "$ROOT" -type f -name '*.sh' ! -path '*/release/*' -print
)
while IFS= read -r file; do "$NODE" --check "$file" >/dev/null; done < <(
  find "$ROOT/scripts" "$ROOT/assets" -type f \( -name '*.mjs' -o -name '*.js' \) -print
)
for test in "$ROOT"/tests/*.test.sh "$ROOT"/tests/*.test.mjs; do
  [ -f "$test" ] || continue
  case "$test" in
    *.test.sh) /bin/bash "$test" ;;
    *.test.mjs) "$NODE" "$test" ;;
  esac
done
printf 'linux tests passed\n'
```

- [ ] **Step 6: Commit**

```bash
git add linux/VERSION linux/scripts/localization-linux.sh linux/tests/run-tests.sh linux/tests/localization-contract.test.sh
git commit -m "feat(linux): skeleton, VERSION and localization with tests"
```

### Task 3: common-linux.sh（移植主体）

**Files:**
- Create: `linux/scripts/common-linux.sh`（copy `macos/scripts/common-macos.sh` 后按下方补丁逐段改写）
- Create: `linux/tests/shell-braced-vars-before-cjk.test.mjs`（copy 自 macos 同名测试，改路径常量）
- Create: `linux/tests/localization-parity.test.mjs`（新：断言 linux 本地化表与 macos 源键集合一致——zh/en 键集对称、最少 35 键，忽略已批准的 2 处差异，防止未来两表漂移）

- [ ] **Step 1: 复制两份文件**

```bash
cp macos/scripts/common-macos.sh linux/scripts/common-linux.sh
cp macos/tests/shell-braced-vars-before-cjk.test.mjs linux/tests/shell-braced-vars-before-cjk.test.mjs
```

把测试文件里的 `scripts/localization-macos.sh`、`scripts/common-macos.sh` 引用改为 `localization-linux.sh`、`common-linux.sh`。

- [ ] **Step 2: 头部路径与常量改写**

第 5–10 行 HOME 兜底改为：

```bash
if [ -z "${HOME:-}" ]; then
  CURRENT_USER="$(/usr/bin/id -un 2>/dev/null || id -un)"
  HOME="$(/usr/bin/getent passwd "$CURRENT_USER" 2>/dev/null | /usr/bin/cut -d: -f6)"
  [ -n "$HOME" ] || { printf 'Codex Dream Skin: could not resolve the current Linux home directory.\n' >&2; exit 1; }
  export HOME
fi
```

第 12–37 行常量块替换为：

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
. "$SCRIPT_DIR/localization-linux.sh"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
INJECTOR="$SCRIPT_DIR/injector.mjs"
INSTALL_ROOT="$HOME/.local/share/codex-dream-skin"
STATE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/codex-dream-skin"
STATE_PATH="$STATE_ROOT/state.json"
OPERATION_STATE_PATH="$STATE_ROOT/operation-state.json"
OPERATION_ACK_PATH="$STATE_ROOT/operation-control-ack.json"
THEME_BACKUP_PATH="$STATE_ROOT/theme-backup.json"
THEME_DIR="$STATE_ROOT/theme"
CONFIG_PATH="$HOME/.codex/config.toml"
ELECTRON_FLAGS_PATH="$STATE_ROOT/electron-flags.conf"
INJECTOR_LOG="$STATE_ROOT/injector.log"
INJECTOR_ERROR_LOG="$STATE_ROOT/injector-error.log"
APP_LOG="$STATE_ROOT/codex-launch.log"
APP_ERROR_LOG="$STATE_ROOT/codex-launch-error.log"
START_ERROR_LOG="$STATE_ROOT/start-error.log"
SKIN_VERSION="1.5.14"
```

删除 `EXPECTED_CODEX_TEAM_ID`、`EXPECTED_CODEX_REQUIREMENT`、两个 JOB_LABEL 常量与三个 `DREAM_SKIN_VALIDATED_RUNTIME_*` 变量（Linux 不用）。

- [ ] **Step 3: 通知函数改写（osascript → notify-send）**

`notify_user` 与 `alert_user`（49–65 行）替换为：

```bash
notify_user() {
  local message="$*"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send "Dream Skin" "$message" >/dev/null 2>&1 || true
  else
    printf 'Dream Skin: %s\n' "$message" >&2 || true
  fi
}

alert_user() {
  local message="$*"
  if command -v zenity >/dev/null 2>&1; then
    zenity --info --title="Dream Skin" --text="$message" >/dev/null 2>&1 || true
  else
    printf 'Dream Skin: %s\n' "$message" >&2 || true
  fi
}
```

- [ ] **Step 4: operation-state 从 plutil 改为 Node 写 JSON**

`write_operation_state` 里 154–172 行（`if [ "$result" -eq 0 ]; then … /bin/rm -rf "$lock_path"` 段落）替换为（注意保留前面的 token/锁逻辑不变）：

```bash
  if [ "$result" -eq 0 ]; then
    updated_at="$(/bin/date +%s)"
    "$NODE" -e '
      const fs = require("node:fs");
      const [file, status, message, token, updatedAt] = process.argv.slice(1);
      const temporary = `${file}.${process.pid}.tmp`;
      const payload = `${JSON.stringify({ status, message, operationToken: token, updatedAt: Number(updatedAt) }, null, 2)}\n`;
      fs.writeFileSync(temporary, payload, { encoding: "utf8", mode: 0o600 });
      fs.renameSync(temporary, file);
    ' "$OPERATION_STATE_PATH" "$status" "$message" "$operation_token" "$updated_at" || result=1
  fi
  /bin/rm -rf "$lock_path"
  return "$result"
```

- [ ] **Step 5: Codex 发现/验签/启动/进程探测 → 引入 linux-launch.sh**

删除 `discover_codex_app`、`codesign_team_id`、`require_signed_node_runtime`、`verify_macos_app_signature`、`require_macos_runtime`、`remember_validated_runtime_identity`、`process_executable_path`、`listener_pids`、`launch_codex_with_cdp`、`launch_codex_normally`、`release_codex_launchd_job`（238–331 行、457–470 行、440–441 行、833–861 行），在文件顶部 `. localization-linux.sh` 之后加：

```bash
. "$SCRIPT_DIR/linux-launch.sh"
```

（这些函数由 Task 4 的 `linux-launch.sh` 以 Linux 实现提供，函数签名保持一致。）

- [ ] **Step 6: 其余 launchd/osascript 残留清理**

- `codex_main_pids`（339–348 行）：`/bin/ps -axo pid=,command=` 保持（Linux 兼容）。
- `stop_codex`（411–437 行）：删除 `release_codex_launchd_job` 与 osascript 两行，改为直接 TERM：

```bash
stop_codex() {
  local allow_force="${1:-false}"
  local deadline
  local pid
  codex_is_running || return 0
  while IFS= read -r pid; do
    [ -n "$pid" ] && /bin/kill -TERM "$pid" 2>/dev/null || true
  done < <(codex_main_pids)
  deadline=$((SECONDS + 15))
  while codex_is_running && [ "$SECONDS" -lt "$deadline" ]; do /bin/sleep 0.25; done
  codex_is_running || return 0
  [ "$allow_force" = "true" ] || fail "Codex did not close within 15 seconds; explicit restart authorization is required for a forced stop."
  while IFS= read -r pid; do
    [ -n "$pid" ] && /bin/kill -KILL "$pid" 2>/dev/null || true
  done < <(codex_main_pids)
  /bin/sleep 0.5
  codex_is_running && fail "Codex could not be stopped safely."
  return 0
}
```

- `stop_recorded_injector`（640–725 行）：删除其中 4 处 `/bin/launchctl remove …` 行（保留 kill 逻辑）。
- `launch_injector_daemon`（727–764 行）：整段替换为：

```bash
launch_injector_daemon() {
  local port="$1"
  local pid=""
  : > "$INJECTOR_LOG"
  : > "$INJECTOR_ERROR_LOG"
  /usr/bin/nohup "$NODE" "$INJECTOR" --watch --port "$port" --theme-dir "$THEME_DIR" \
    --operation-state "$OPERATION_STATE_PATH" --operation-ack "$OPERATION_ACK_PATH" \
    >>"$INJECTOR_LOG" 2>>"$INJECTOR_ERROR_LOG" &
  pid="$!"
  /bin/sleep 0.15
  if [ -n "$pid" ] && /bin/kill -0 "$pid" 2>/dev/null; then
    printf '%s\n' "$pid"
    return 0
  fi
  fail "The injector did not start. See $INJECTOR_ERROR_LOG and $INJECTOR_LOG"
}
```

- `ensure_node_runtime`（767–777 行）：替换为（校验系统 node >= 18）：

```bash
ensure_node_runtime() {
  if [ -n "${NODE:-}" ] && [ -x "$NODE" ]; then
    return 0
  fi
  NODE="$(command -v node || true)"
  [ -n "$NODE" ] && [ -x "$NODE" ] || fail "Node.js was not found. Install nodejs (>= 18) first."
  local node_major=""
  node_major="$("$NODE" --version)"
  node_major="${node_major#v}"
  node_major="${node_major%%.*}"
  case "$node_major" in ''|*[!0-9]*) fail "Could not parse Node.js version." ;; esac
  [ "$node_major" -ge 18 ] || fail "Node.js $("$NODE" --version) is too old; version 18 or newer is required."
  NODE_VERSION="$("$NODE" --version)"
  export NODE NODE_VERSION
}
```

- `hot_reapply_theme`（781–828 行）：其中 `state_field injectorProtocol` 分支的 `ps` 探测保持；`write_state` 调用不变，但 `write_state` 内 platform 字段（573 行 `platform: \`darwin-${arch}\``）改为 `\`linux-${arch}\``。
- `write_state` 里 `codexBundle/codexExe/codexTeamId` 三个参数在 Linux 上按空串传入，`codexExe` 传 `CODEX_EXE`。

- [ ] **Step 7: 残留平台 API 门禁**

Run（预期无输出）：
```bash
grep -n "osascript\|launchctl\|codesign\|plutil\|mdfind\|dscl\|defaults read\|open -na\|/usr/bin/open" linux/scripts/common-linux.sh
```
Expected: 无匹配（注释里的平台名说明除外；若命中真实调用则必须修掉重跑）。

- [ ] **Step 8: 语法与测试**

Run: `bash -n linux/scripts/common-linux.sh && node linux/tests/shell-braced-vars-before-cjk.test.mjs && node linux/tests/localization-parity.test.mjs`
Expected: 退出码 0

`localization-parity.test.mjs` 实现：解析 `linux/scripts/localization-linux.sh` 与 `macos/scripts/localization-macos.sh` 的 `case "$language:$key"` 分支，提取 `zh:`/`en:` 键集合；断言 (a) linux 表 zh 键集 == linux 表 en 键集（对称）；(b) linux zh 键集 == macos zh 键集（逐键一致）；(c) 键数 ≥ 35。用正则 `^\s*(zh|en):([a-z_0-9]+)\)` 提取，不解析 bash 语义。

- [ ] **Step 9: Commit**

```bash
git add linux/scripts/common-linux.sh linux/tests/shell-braced-vars-before-cjk.test.mjs
git commit -m "feat(linux): port common-macos.sh to common-linux.sh"
```

### Task 4: linux-launch.sh（Codex 发现、验签、渲染 flags、启动）

**Files:**
- Create: `linux/scripts/linux-launch.sh`（全量新代码；**不包含** codex_main_pids/pid_is_codex_executable/pid_is_codex_descendant —— 这三个保留在 common-linux.sh，由本任务 Step 0 修订）
- Modify: `linux/scripts/common-linux.sh`（Step 0 修订：进程探测 /proc 化 + 发现守卫 + AppImage 身份 + 端口默认值 + NODE 守卫）
- Test: `linux/tests/linux-launch.test.sh`

**Step 0（前置修订 common-linux.sh，Task 3 代码审查结论）:**

0a. `codex_main_pids` 整段替换为 /proc 版（含发现守卫与 AppImage cmdline 回退）：

```bash
codex_main_pids() {
  local pid
  local exe
  local exe_canonical
  local expected_canonical
  local cmdline
  # ensure_node_runtime no longer triggers discovery (unlike macOS), so every
  # probe function must resolve the Codex executable itself first.
  [ -n "${CODEX_EXE:-}" ] || discover_codex_app
  expected_canonical="$(canonical_existing_path "$CODEX_EXE" 2>/dev/null || true)"
  while read -r pid; do
    [ -n "$pid" ] || continue
    exe="$(readlink -f "/proc/$pid/exe" 2>/dev/null || true)"
    if [ -n "$exe" ]; then
      exe_canonical="$(canonical_existing_path "$exe" 2>/dev/null || true)"
      [ -n "$exe_canonical" ] && [ "$exe_canonical" = "$expected_canonical" ] \
        && printf '%s\n' "$pid" && continue
    fi
    # AppImage: the process exe resolves inside the FUSE mount, so fall back
    # to matching the AppImage path in the command line.
    cmdline="$(/usr/bin/tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    case " $cmdline " in
      *" $CODEX_EXE "*) printf '%s\n' "$pid" ;;
    esac
  done < <(/bin/ps -eo pid= 2>/dev/null)
}
```

0b. `pid_is_codex_executable` 整段替换为（exe 路径优先、AppImage cmdline 回退）：

```bash
pid_is_codex_executable() {
  local actual
  local actual_canonical
  local expected_canonical
  local cmdline
  actual="$(process_executable_path "$1")"
  actual_canonical="$(canonical_existing_path "$actual" 2>/dev/null || true)"
  expected_canonical="$(canonical_existing_path "$CODEX_EXE" 2>/dev/null || true)"
  if [ -n "$actual_canonical" ] && [ "$actual_canonical" = "$expected_canonical" ]; then
    return 0
  fi
  cmdline="$(/usr/bin/tr '\0' ' ' < "/proc/$1/cmdline" 2>/dev/null || true)"
  case " $cmdline " in
    *" $CODEX_EXE "*) return 0 ;;
    *) return 1 ;;
  esac
}
```

0c. `pid_is_codex_descendant` 函数体第一行（`local current="$1"` 后）加：

```bash
  [ -n "${CODEX_EXE:-}" ] || discover_codex_app
```

0d. `hot_reapply_theme` 的 `local port="${1:-9341}"` 改为 `local port="${1:-9335}"`。

0e. `write_operation_state` 中 Node 调用前加 NODE 守卫（函数开头 `ensure_state_root` 之前）：

```bash
  [ -n "${NODE:-}" ] && [ -x "$NODE" ] || ensure_node_runtime
```



- [ ] **Step 1: 写失败测试**

Create `linux/tests/linux-launch.test.sh`：

```bash
#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$ROOT/scripts/linux-launch.sh"

# session_type detection
[ "$(session_type_of x11 wayland)" = "x11" ]
[ "$(session_type_of wayland x11)" = "wayland" ]
[ "$(session_type_of '' wayland)" = "wayland" ]
[ "$(session_type_of '' wayland-0)" = "wayland" ]
[ "$(session_type_of '' bogus)" = "x11" ]
[ "$(session_type_of bogus x11)" = "x11" ]

# nvidia detection is rooted at a caller-supplied base (testable anywhere)
NV_ROOT="$(mktemp -d /tmp/dreamskin-nv.XXXXXX)"
FLAGS_FILE="$(mktemp /tmp/dreamskin-flags.XXXXXX)"
trap 'rm -rf "$NV_ROOT" "$FLAGS_FILE"' EXIT
mkdir -p "$NV_ROOT/sys/module/nvidia" "$NV_ROOT/sys/module/nvidia_drm"
[ "$(is_nvidia_present "$NV_ROOT")" = "true" ]
[ "$(is_nvidia_present "$NV_ROOT/empty")" = "false" ]

# flags assembly
FLAGS_X11="$(assemble_renderer_flags x11 false)"
case "$FLAGS_X11" in *"--ozone-platform=x11"*) ;; *) exit 1 ;; esac
FLAGS_WL_NVIDIA="$(assemble_renderer_flags wayland true)"
case "$FLAGS_WL_NVIDIA" in *"--ozone-platform=x11"*) ;; *) exit 1 ;; esac
FLAGS_WL="$(assemble_renderer_flags wayland false)"
case "$FLAGS_WL" in *"--enable-wayland-ime"*) ;; *) exit 1 ;; esac
case "$FLAGS_WL" in *"ozone-platform=x11"*) exit 1 ;; esac

# renderer override wins
case "$(assemble_renderer_flags x11 true x11)" in *"--ozone-platform=x11"*) ;; *) exit 1 ;; esac
case "$(assemble_renderer_flags wayland false wayland)" in *"--ozone-platform=wayland"*) ;; *) exit 1 ;; esac

# appimage approval path is a pure string helper
[ -n "$(appimage_approval_path sha256sum /tmp/Foo.AppImage)" ]
case "$(appimage_approval_path sha256sum /tmp/Foo.AppImage)" in *.json) ;; *) exit 1 ;; esac
[ "$(appimage_approval_path sha256sum /tmp/Foo.AppImage)" = "$(appimage_approval_path sha256sum /tmp/Foo.AppImage)" ]
[ "$(appimage_approval_path sha256sum /tmp/Foo.AppImage)" != "$(appimage_approval_path sha256dead /tmp/Foo.AppImage)" ]

# electron_flags_lines integration: source common-linux.sh in a subshell so
# the test stays hermetic (ELECTRON_FLAGS_PATH is reset at source time, so the
# env overrides are applied on the call itself).
printf -- '--disable-gpu-compositing\n' > "$FLAGS_FILE"
FLAGS_X11_LINES="$(/bin/bash -c '
  . "$1/scripts/common-linux.sh"
  XDG_SESSION_TYPE=x11 ELECTRON_FLAGS_PATH="$2" electron_flags_lines
' _ "$ROOT" "$FLAGS_FILE")"
case "$FLAGS_X11_LINES" in *"--disable-gpu-compositing"*) ;; *) exit 1 ;; esac
case "$FLAGS_X11_LINES" in *"--ozone-platform=x11"*) ;; *) exit 1 ;; esac
FLAGS_WL_OVERRIDE="$(/bin/bash -c '
  . "$1/scripts/common-linux.sh"
  is_nvidia_present() { printf "false"; }
  XDG_SESSION_TYPE=x11 CODEX_RENDERER=wayland ELECTRON_FLAGS_PATH="$2" electron_flags_lines
' _ "$ROOT" "$FLAGS_FILE")"
case "$FLAGS_WL_OVERRIDE" in *"--ozone-platform=wayland"*) ;; *) exit 1 ;; esac
case "$FLAGS_WL_OVERRIDE" in *"ozone-platform=x11"*) exit 1 ;; esac

# invalid renderer override must fail; fail() is normally provided by
# common-linux.sh, so stub it while sourcing linux-launch.sh alone. The call
# runs in a subshell because fail() exits the shell it runs in.
if ! command -v fail >/dev/null 2>&1; then
  fail() { printf 'Dream Skin: %s\n' "$*" >&2; exit 1; }
fi
if ( assemble_renderer_flags wayland false bogus 2>/dev/null ); then exit 1; fi

printf 'linux-launch tests passed\n'
```

- [ ] **Step 2: 运行确认失败**

Run: `bash linux/tests/linux-launch.test.sh`
Expected: FAIL（函数未定义）

- [ ] **Step 3: 实现 linux-launch.sh**

Create `linux/scripts/linux-launch.sh`：

```bash
#!/bin/bash

# Linux-only helpers: locate and verify the official Codex desktop app,
# assemble Electron renderer flags, and launch it with CDP enabled.
# Sourced by common-linux.sh; do not execute directly.

# Testable pure helpers (kept free of side effects so tests can source this file).
session_type_of() {
  local xdg="${1:-}"
  local wayland_display="${2:-}"
  case "$xdg" in
    wayland) printf 'wayland' ;;
    x11) printf 'x11' ;;
    *)
      # Only trust the fallback display when it looks like a Wayland socket
      # (e.g. wayland-0); anything else means an X11 session.
      case "$wayland_display" in
        wayland*) printf 'wayland' ;;
        *) printf 'x11' ;;
      esac
      ;;
  esac
}

is_nvidia_present() {
  local root="${1:-/}"
  if [ -d "$root/sys/module/nvidia" ] && [ -d "$root/sys/module/nvidia_drm" ]; then
    printf 'true'
  else
    printf 'false'
  fi
}

assemble_renderer_flags() {
  local session="${1:-x11}"
  local nvidia="${2:-false}"
  local override="${3:-}"
  if [ -n "$override" ]; then
    case "$override" in
      wayland|x11) ;;
      *) fail "Unknown renderer override: $override" ;;
    esac
    session="$override"
  fi
  case "$session" in
    x11) printf -- '--ozone-platform=x11\n' ;;
    wayland)
      if [ "$nvidia" = "true" ]; then
        printf -- '--ozone-platform=x11\n'
      else
        printf -- '--ozone-platform=wayland\n'
        printf -- '--enable-wayland-ime\n'
      fi
      ;;
    *) fail "Unknown session type: $session" ;;
  esac
}

appimage_approval_path() {
  local sha="$1"
  local appimage_path="$2"
  local canonical=""
  canonical="$(cd "$(dirname "$appimage_path")" 2>/dev/null && pwd -P)/$(basename "$appimage_path")" \
    || canonical="$appimage_path"
  local suffix=""
  suffix="$(/usr/bin/printf '%s\n%s' "$canonical" "$sha" | /usr/bin/sha256sum | /usr/bin/cut -c1-24)"
  /usr/bin/printf '%s/appimage-approval-%s.json' "${STATE_ROOT:-/tmp}" "$suffix"
}

require_linux_runtime() {
  local verification_mode="${1:-deep}"
  case "$verification_mode" in deep|quick) ;; *) fail "Unknown runtime verification mode: $verification_mode" ;; esac
  discover_codex_app
  ensure_node_runtime
  verify_codex_install
}

discover_codex_app() {
  local candidate=""
  local configured="${CODEX_APP_IMAGE:-}"
  local pkg=""
  local pkg_status=""

  CODEX_EXE=""
  CODEX_VERSION=""
  CODEX_LAUNCH_KIND=""

  # 1. dpkg-installed package (preferred: officially signed repository)
  for pkg in codex-desktop chatgpt-desktop chatgpt; do
    pkg_status="$(/usr/bin/dpkg-query -W -f='${Status}' "$pkg" 2>/dev/null || true)"
    case "$pkg_status" in
      "install ok installed")
        candidate="$(/usr/bin/dpkg-query -L "$pkg" 2>/dev/null \
          | /usr/bin/grep -E '/(bin|lib)/[^/]*(codex|chatgpt)[^/]*$' | /usr/bin/grep -v -E '\.(so|1)$' \
          | /usr/bin/head -n 1 || true)"
        if [ -n "$candidate" ] && [ -x "$candidate" ]; then
          CODEX_EXE="$(readlink -f "$candidate")"
          CODEX_VERSION="$(/usr/bin/dpkg-query -W -f='${Version}' "$pkg" 2>/dev/null || true)"
          CODEX_PACKAGE="$pkg"
          CODEX_LAUNCH_KIND="deb"
          break
        fi
        ;;
    esac
  done

  # 2. PATH binary (AppImage / manually added)
  if [ -z "${CODEX_EXE:-}" ]; then
    candidate="$(command -v codex-desktop 2>/dev/null || command -v chatgpt-desktop 2>/dev/null || true)"
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      CODEX_EXE="$(readlink -f "$candidate")"
      CODEX_VERSION="unknown"
      CODEX_LAUNCH_KIND="binary"
    fi
  fi

  # 3. AppImage search (configured path wins, then ~/Applications)
  if [ -z "${CODEX_EXE:-}" ]; then
    for candidate in "$configured" "$HOME/Applications"/Codex*.AppImage "$HOME/Applications"/ChatGPT*.AppImage; do
      [ -n "$candidate" ] || continue
      [ -f "$candidate" ] || continue
      CODEX_EXE="$(cd "$(dirname "$candidate")" && pwd -P)/$(basename "$candidate")"
      CODEX_VERSION="unknown"
      CODEX_LAUNCH_KIND="appimage"
      break
    done
  fi

  [ -n "${CODEX_EXE:-}" ] || fail "Could not find the official Codex desktop app. Install it from OpenAI's apt repository (codex-desktop) or download the AppImage."
  [ -x "$CODEX_EXE" ] || fail "Codex executable is missing or not executable: $CODEX_EXE"
  export CODEX_EXE CODEX_VERSION CODEX_PACKAGE CODEX_LAUNCH_KIND
}

verify_codex_install() {
  case "${CODEX_LAUNCH_KIND:-}" in
    deb)
      if command -v apt-cache >/dev/null 2>&1; then
        apt-cache policy "$CODEX_PACKAGE" 2>/dev/null \
          | /usr/bin/grep -qi 'platform\.openai\.com' \
          || fail "The installed Codex package does not come from the official OpenAI repository. Restore or reinstall the official app before continuing."
      fi
      local integrity_output=""
      integrity_output="$(/usr/bin/dpkg -V "$CODEX_PACKAGE" 2>/dev/null || true)"
      if [ -n "$integrity_output" ]; then
        fail "The installed Codex package files fail the dpkg integrity check. Reinstall the official app before continuing."
      fi
      ;;
    appimage|binary)
      verify_appimage_approval || fail "AppImage/binary Codex installs cannot be verified. Run this tool with --allow-unsigned once after confirming the file is the official OpenAI download."
      ;;
    *)
      fail "Unknown Codex launch kind: ${CODEX_LAUNCH_KIND:-missing}"
      ;;
  esac
}

verify_appimage_approval() {
  [ -n "${CODEX_EXE:-}" ] || return 1
  local sha=""
  sha="$("$NODE" -e 'const c=require("node:crypto");const fs=require("node:fs");process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$CODEX_EXE" 2>/dev/null || true)"
  [ -n "$sha" ] || return 1
  local approval_file=""
  approval_file="$(appimage_approval_path "$sha" "$CODEX_EXE")"
  [ -f "$approval_file" ]
}

record_appimage_approval() {
  ensure_state_root
  local sha=""
  sha="$("$NODE" -e 'const c=require("node:crypto");const fs=require("node:fs");process.stdout.write(c.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$CODEX_EXE" 2>/dev/null || true)"
  [ -n "$sha" ] || fail "Could not hash $CODEX_EXE"
  local approval_file=""
  approval_file="$(appimage_approval_path "$sha" "$CODEX_EXE")"
  "$NODE" -e '
    const fs = require("node:fs");
    const [file, exe, sha] = process.argv.slice(1);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify({ exe, sha256: sha, approvedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
  ' "$approval_file" "$CODEX_EXE" "$sha"
  printf 'Recorded one-time approval for unsigned Codex install: %s\n' "$CODEX_EXE" >&2
}

listener_pids() {
  local port="$1"
  local pids=""
  local lsof_bin=""
  if command -v ss >/dev/null 2>&1; then
    pids="$(/usr/bin/ss -ltnHp "sport = :$port" 2>/dev/null \
      | /usr/bin/sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | /usr/bin/sort -u || true)"
  fi
  # Debian/Ubuntu ship lsof at /usr/bin (not /usr/sbin); resolve it instead
  # of hardcoding a path and only run it when the resolver found a binary.
  lsof_bin="$(command -v lsof 2>/dev/null || true)"
  if [ -z "$pids" ] && [ -n "$lsof_bin" ]; then
    pids="$( "$lsof_bin" -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | /usr/bin/sort -u || true)"
  fi
  printf '%s\n' "$pids"
}

process_executable_path() {
  readlink -f "/proc/$1/exe" 2>/dev/null || true
}

electron_flags_lines() {
  local session=""
  local nvidia="false"
  local override="${CODEX_RENDERER:-}"
  session="$(session_type_of "${XDG_SESSION_TYPE:-}" "${WAYLAND_DISPLAY:-}")"
  nvidia="$(is_nvidia_present)"
  if [ -f "$ELECTRON_FLAGS_PATH" ]; then
    /usr/bin/grep -v -E '^\s*#|^\s*$' "$ELECTRON_FLAGS_PATH" || true
    printf '\n'
  fi
  assemble_renderer_flags "$session" "$nvidia" "$override"
}

launch_codex_with_cdp() {
  local port="$1"
  local flags=""
  : > "$APP_LOG"
  : > "$APP_ERROR_LOG"
  flags="$(electron_flags_lines)"
  # Disable pathname expansion for the flag list (word splitting only), so a
  # user flag can never be interpreted as a glob pattern.
  ( set -f
    /usr/bin/nohup "$CODEX_EXE" \
      --remote-debugging-address=127.0.0.1 \
      --remote-debugging-port="$port" \
      $flags \
      >>"$APP_LOG" 2>>"$APP_ERROR_LOG" &
  )
}

launch_codex_normally() {
  /usr/bin/nohup "$CODEX_EXE" >>"$APP_LOG" 2>>"$APP_ERROR_LOG" &
}
```

注意：`electron_flags_lines` 中用户自定义 `electron-flags.conf` 每行一个 flag；flag 列表经换行分词成为独立 argv（`set -f` 禁用路径名展开，flag 不含空白是写入约定，若含空白会被拆开——这是 Linux 端明确接受的限制，同社区 `ilysenko/codex-desktop-linux` 约定）。

- [ ] **Step 4: 运行测试确认通过**

Run: `bash linux/tests/linux-launch.test.sh`
Expected: `linux-launch tests passed`

- [ ] **Step 5: 与 common-linux.sh 联调语法**

Run: `bash -n linux/scripts/common-linux.sh linux/scripts/linux-launch.sh`
Expected: 退出码 0

- [ ] **Step 6: Commit**

```bash
git add linux/scripts/linux-launch.sh linux/tests/linux-launch.test.sh
git commit -m "feat(linux): codex discovery, verification and launch flags"
```

### Task 5: 移植 injector.mjs 与 Node 模块

**Files:**
- Copy: `macos/scripts/injector.mjs` → `linux/scripts/injector.mjs`（1 处补丁）
- Copy: `macos/scripts/theme-config.mjs`、`write-theme.mjs`、`stage-theme.mjs`、`snapshot-theme-zip.mjs`、`theme-content-fingerprint.mjs`、`publish-theme-import.mjs`、`check-image-dimensions.mjs` → `linux/scripts/`（原样）
- Test: 移植 `macos/tests/injector-bootstrap.test.mjs`、`theme-config.test.mjs`、`theme-stage.test.mjs`、`write-theme-contract.test.mjs`、`safe-css-validator.test.mjs`、`theme-package-validator.test.mjs`、`renderer-inject.test.mjs`、`runtime-css-nested-has.test.mjs`、`image-metadata.test.mjs` → `linux/tests/`（改引用路径）

- [ ] **Step 1: 复制 Node 模块**

```bash
for f in injector.mjs theme-config.mjs write-theme.mjs stage-theme.mjs snapshot-theme-zip.mjs theme-content-fingerprint.mjs publish-theme-import.mjs check-image-dimensions.mjs; do
  cp "macos/scripts/$f" "linux/scripts/$f"
done
```

- [ ] **Step 2: injector.mjs 唯一补丁：readOperationState 直读 JSON**

把 `readOperationState`（1500–1513 行）整段替换为：

```js
async function readOperationState(statePath) {
  const raw = await fs.readFile(statePath, "utf8");
  const parsed = JSON.parse(raw);
  return {
    token: String(parsed.operationToken || ""),
    status: String(parsed.status || ""),
    message: String(parsed.message || "").slice(0, 240),
    updatedAt: Number(parsed.updatedAt || 0),
  };
}
```

（写入侧由 Task 3 Step 4 的 Node 写 JSON 保证格式一致。）

- [ ] **Step 3: 平台 API 门禁**

Run（预期无输出）：
```bash
grep -n "plutil\|/usr/bin/open\|launchctl\|codesign\|osascript" linux/scripts/*.mjs
```
Expected: 无匹配

- [ ] **Step 4: 移植测试并改引用**

```bash
for f in injector-bootstrap theme-config theme-stage write-theme-contract safe-css-validator theme-package-validator renderer-inject runtime-css-nested-has image-metadata; do
  [ -f "macos/tests/$f.test.mjs" ] && cp "macos/tests/$f.test.mjs" "linux/tests/$f.test.mjs"
done
```

把每个移植测试里的 `macos/`、`scripts/image-metadata.mjs` 等路径常量改为 `linux/`（用 `sed -i 's#macos/#linux/#g' linux/tests/*.test.mjs`，然后逐个打开确认没有破坏 fixtures 相对路径——fixtures 用 `new URL` 相对本文件时不需要改）。

- [ ] **Step 5: 运行移植测试**

Run: `cd linux/tests && node injector-bootstrap.test.mjs && node theme-config.test.mjs && node theme-stage.test.mjs && node write-theme-contract.test.mjs && node safe-css-validator.test.mjs && node theme-package-validator.test.mjs && node renderer-inject.test.mjs && node runtime-css-nested-has.test.mjs && node image-metadata.test.mjs`
Expected: 全部通过（输出无 FAIL/Error）

- [ ] **Step 6: Commit**

```bash
git add linux/scripts/*.mjs linux/tests/*.test.mjs
git commit -m "feat(linux): port injector and node theme modules with tests"
```

### Task 6: start / restore / pause / status / verify 脚本移植

**Files:**
- Copy + patch: `macos/scripts/start-dream-skin-macos.sh` → `linux/scripts/start-dream-skin-linux.sh`
- Copy + patch: `restore-dream-skin-macos.sh` → `restore-dream-skin-linux.sh`、`pause-dream-skin-macos.sh` → `pause-dream-skin-linux.sh`、`status-dream-skin-macos.sh` → `status-dream-skin-linux.sh`、`verify-dream-skin-macos.sh` → `verify-dream-skin-linux.sh`、`snapshot-active-theme-macos.sh` → `snapshot-active-theme-linux.sh`、`recover-theme-imports-macos.sh` → `recover-theme-imports-linux.sh`

- [ ] **Step 1: 复制 7 个脚本**

```bash
for f in start-dream-skin restore-dream-skin pause-dream-skin status-dream-skin verify-dream-skin snapshot-active-theme recover-theme-imports; do
  cp "macos/scripts/$f-macos.sh" "linux/scripts/$f-linux.sh"
done
```

- [ ] **Step 2: 逐文件应用补丁（顺序执行）**

每个文件：
1. `sed -i 's/common-macos\.sh/common-linux.sh/g'` 该文件
2. `sed -i 's/localization-macos\.sh/localization-linux.sh/g'` 该文件
3. 默认端口：`start`、`pause`、`status`、`verify` 里的 `PORT=9341` 改为 `PORT=9335`；`start` 的 `--prompt-restart` 相关 `osascript` 交互块（若有）替换为 `notify_user` + 直接执行重启（Linux 菜单在终端里已确认，不需要二次弹窗）
4. `start` 里 `require_macos_runtime` → `require_linux_runtime`，`verify_macos_app_signature` → `verify_codex_install`（按调用处实际函数名对应）
5. `start` 里 `activate_codex_window`（`open -a`）改为空操作 + 日志：`[ -z "${CODEX_EXE:-}" ] || true`
6. `start` 的参数循环里加 `--renderer` 支持（映射到渲染覆盖环境变量）：

```bash
    --renderer) case "${2:-}" in wayland|x11) CODEX_RENDERER="$2"; export CODEX_RENDERER ;; *) fail "Unknown renderer: ${2:-}" ;; esac; shift 2 ;;
```

7. `verify` 里 `--screenshot` 用 `/usr/bin/open` 打开图片的结尾改为 `xdg-open`

- [ ] **Step 3: 平台 API 门禁**

Run（预期无输出）：
```bash
grep -n "osascript\|launchctl\|codesign\|plutil\|mdfind\|dscl\|open -na\|/usr/bin/open" linux/scripts/start-dream-skin-linux.sh linux/scripts/restore-dream-skin-linux.sh linux/scripts/pause-dream-skin-linux.sh linux/scripts/status-dream-skin-linux.sh linux/scripts/verify-dream-skin-linux.sh linux/scripts/snapshot-active-theme-linux.sh linux/scripts/recover-theme-imports-linux.sh
```
Expected: 无匹配（`xdg-open` 允许）

- [ ] **Step 4: 语法检查**

Run: `bash -n linux/scripts/*.sh`
Expected: 退出码 0

- [x] **Step 5: Commit**

```bash
git add linux/scripts/start-dream-skin-linux.sh linux/scripts/restore-dream-skin-linux.sh linux/scripts/pause-dream-skin-linux.sh linux/scripts/status-dream-skin-linux.sh linux/scripts/verify-dream-skin-linux.sh linux/scripts/snapshot-active-theme-linux.sh linux/scripts/recover-theme-imports-linux.sh
git commit -m "feat(linux): port start/restore/pause/status/verify scripts"
```

### Task 7: 主题管线移植（导入/切换/背景图/社区一键）

**Files:**
- Copy + patch: `import-theme-zip-macos.sh` → `import-theme-zip-linux.sh`、`extract-theme-zip-macos.sh` → `extract-theme-zip-linux.sh`、`switch-theme-macos.sh` → `switch-theme-linux.sh`、`theme-switch-lock-macos.sh` → `theme-switch-lock-linux.sh`、`load-image-theme-macos.sh` → `load-image-theme-linux.sh`、`apply-community-theme-macos.sh` → `apply-community-theme-linux.sh`
- Test: 移植 `macos/tests/theme-zip-extract.test.sh`、`theme-import-identity.test.sh`、`community-apply-transaction.test.sh`、`theme-zip-snapshot.test.mjs` → `linux/tests/`

- [ ] **Step 1: 复制脚本与测试**

```bash
for f in import-theme-zip extract-theme-zip switch-theme theme-switch-lock load-image-theme apply-community-theme; do
  cp "macos/scripts/$f-macos.sh" "linux/scripts/$f-linux.sh"
done
for f in theme-zip-extract.test.sh theme-import-identity.test.sh community-apply-transaction.test.sh theme-zip-snapshot.test.mjs; do
  [ -f "macos/tests/$f" ] && cp "macos/tests/$f" "linux/tests/$f"
done
```

- [ ] **Step 2: 逐文件补丁**

每个脚本：`common-macos.sh`→`common-linux.sh`、`localization-macos.sh`→`localization-linux.sh`；测试文件内脚本路径 `scripts/…-macos.sh`→`scripts/…-linux.sh`、fixtures 引用核对。

`load-image-theme-linux.sh` 额外处理：删除 osascript 选图弹窗分支，要求 `--image <path>` 参数必填（终端菜单在调用前已让用户输入路径）；若脚本原有 `--image` 支持则只删 osascript 分支。`apply-community-theme-linux.sh` 的参数契约（`--id/--expect-fingerprint/--expect-active-id/--transaction-root`）保持不变。

- [ ] **Step 3: 平台 API 门禁**

Run（预期无输出）：
```bash
grep -n "osascript\|launchctl\|codesign\|plutil\|mdfind\|dscl\|/usr/bin/open" linux/scripts/import-theme-zip-linux.sh linux/scripts/extract-theme-zip-linux.sh linux/scripts/switch-theme-linux.sh linux/scripts/theme-switch-lock-linux.sh linux/scripts/load-image-theme-linux.sh linux/scripts/apply-community-theme-linux.sh
```
Expected: 无匹配

- [ ] **Step 4: 跑测试**

Run: `bash linux/tests/theme-zip-extract.test.sh && bash linux/tests/theme-import-identity.test.sh && bash linux/tests/community-apply-transaction.test.sh && node linux/tests/theme-zip-snapshot.test.mjs`
Expected: 全部通过；若有失败逐条修（失败只能来自路径/平台适配，禁止改弱安全断言）

- [x] **Step 5: Commit**

```bash
git add linux/scripts/import-theme-zip-linux.sh linux/scripts/extract-theme-zip-linux.sh linux/scripts/switch-theme-linux.sh linux/scripts/theme-switch-lock-linux.sh linux/scripts/load-image-theme-linux.sh linux/scripts/apply-community-theme-linux.sh linux/tests/theme-zip-extract.test.sh linux/tests/theme-import-identity.test.sh linux/tests/community-apply-transaction.test.sh linux/tests/theme-zip-snapshot.test.mjs
git commit -m "feat(linux): port theme pipeline scripts with tests"
```

### Task 8: dreamskin.sh 主入口（菜单 + 子命令）

**Files:**
- Create: `linux/scripts/dreamskin.sh`
- Test: `linux/tests/dreamskin-dispatch.test.sh`

- [ ] **Step 1: 写失败测试（子命令分发）**

Create `linux/tests/dreamskin-dispatch.test.sh`：

```bash
#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
. "$ROOT/scripts/dreamskin.sh" --self-test-source 2>/dev/null || true

# resolve_command table
[ "$(resolve_command start)" = "start" ]
[ "$(resolve_command 1)" = "start" ]
[ "$(resolve_command bg)" = "bg" ]
[ "$(resolve_command theme)" = "theme" ]
[ "$(resolve_command import)" = "import" ]
[ "$(resolve_command restore)" = "restore" ]
[ "$(resolve_command autostart)" = "autostart" ]
[ "$(resolve_command nonsense)" = "" ]

# menu line rendering (no exec when --self-test-source)
[ "$(render_menu_item 1 start '启动 Codex 并应用换肤')" = "1" ]
printf 'dreamskin dispatch tests passed\n'
```

- [ ] **Step 2: 运行确认失败**

Run: `bash linux/tests/dreamskin-dispatch.test.sh`
Expected: FAIL（函数未定义）

- [ ] **Step 3: 实现 dreamskin.sh**

Create `linux/scripts/dreamskin.sh`：

```bash
#!/bin/bash

# Dream Skin Linux main entry. No arguments: interactive menu.
# With arguments: subcommand dispatch. Sourceable for tests via --self-test-source.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
. "$SCRIPT_DIR/common-linux.sh"

resolve_command() {
  local input="${1:-}"
  case "$input" in
    start|1) printf 'start' ;;
    pause|2) printf 'pause' ;;
    bg|background|3) printf 'bg' ;;
    import|4) printf 'import' ;;
    theme|themes|5) printf 'theme' ;;
    folder|6) printf 'folder' ;;
    restore|7) printf 'restore' ;;
    gallery|8) printf 'gallery' ;;
    studio|9) printf 'studio' ;;
    autostart|a|A) printf 'autostart' ;;
    doctor|d|D) printf 'doctor' ;;
    update|u|U) printf 'update' ;;
    status) printf 'status' ;;
    community|protocol) printf 'community' ;;
    *) printf '' ;;
  esac
}

render_menu_item() {
  local key="$1"
  local command="$2"
  local label="$3"
  printf '%s' "$key"
}

menu_loop() {
  local choice=""
  local key=""
  while true; do
    printf '\n Dream Skin (Linux)  v%s\n' "$SKIN_VERSION"
    printf ' 1  启动 Codex 并应用换肤\n'
    printf ' 2  暂停换肤\n'
    printf ' 3  更换背景图…\n'
    printf ' 4  导入主题 ZIP…\n'
    printf ' 5  已保存主题\n'
    printf ' 6  打开主题文件夹\n'
    printf ' 7  一键恢复官方外观\n'
    printf ' 8  主题库 Gallery\n'
    printf ' 9  在线 Studio\n'
    printf ' A  开机自启（开/关）\n'
    printf ' D  诊断信息\n'
    printf ' U  检查更新\n'
    printf ' 0  退出\n'
    printf ' 选择 > '
    read -r choice || { printf '\n'; exit 0; }
    key="$(resolve_command "${choice:-}")"
    case "$key" in
      '') printf ' 无效选择：%s\n' "$choice"; continue ;;
    esac
    dispatch "$key" || continue
  done
}

dispatch() {
  local key="$1"
  shift || true
  case "$key" in
    start) exec "$SCRIPT_DIR/start-dream-skin-linux.sh" "$@" ;;
    pause) exec "$SCRIPT_DIR/pause-dream-skin-linux.sh" ;;
    bg)
      local image=""
      printf ' 背景图路径 > '
      read -r image || return 0
      [ -n "$image" ] || { printf ' 未提供路径，已取消。\n'; return 0; }
      "$SCRIPT_DIR/load-image-theme-linux.sh" --image "$image" \
        && "$SCRIPT_DIR/start-dream-skin-linux.sh"
      ;;
    import)
      local zipfile=""
      printf ' 主题 ZIP 路径 > '
      read -r zipfile || return 0
      [ -n "$zipfile" ] || { printf ' 未提供路径，已取消。\n'; return 0; }
      "$SCRIPT_DIR/import-theme-zip-linux.sh" "$zipfile"
      ;;
    theme)
      local sub="${1:-list}"
      case "$sub" in
        list)
          if [ -d "$STATE_ROOT/themes" ]; then
            for d in "$STATE_ROOT"/themes/*/; do
              [ -d "$d" ] || continue
              [ -f "${d}theme.json" ] || continue
              local id="" name=""
              id="$(basename "$d")"
              name="$("$NODE" -e 'const fs=require("node:fs");try{const t=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(t.name||t.id||""))}catch{}' "${d}theme.json")"
              printf ' %s  %s\n' "$id" "$name"
            done
          else
            printf ' 还没有已保存的主题。先用菜单 4 导入一个。\n'
          fi
          ;;
        apply)
          local id="${2:-}"
          [ -n "$id" ] || { printf ' 用法：dreamskin theme apply <id>\n'; return 1; }
          "$SCRIPT_DIR/switch-theme-linux.sh" --id "$id" \
            && "$SCRIPT_DIR/start-dream-skin-linux.sh"
          ;;
        *) printf ' 用法：dreamskin theme list|apply <id>\n'; return 1 ;;
      esac
      ;;
    folder) xdg-open "$STATE_ROOT/themes" >/dev/null 2>&1 || printf ' 主题目录：%s\n' "$STATE_ROOT/themes" ;;
    restore) exec "$SCRIPT_DIR/restore-dream-skin-linux.sh" --restore-base-theme --restart-codex ;;
    gallery) xdg-open "https://dreamskin.cc/gallery" >/dev/null 2>&1 || true ;;
    studio) xdg-open "https://dreamskin.cc/studio" >/dev/null 2>&1 || true ;;
    autostart)
      local target="$HOME/.config/autostart/codex-dream-skin.desktop"
      if [ -f "$target" ]; then
        /bin/rm -f "$target"
        printf ' 开机自启已关闭。\n'
      else
        /bin/mkdir -p "$HOME/.config/autostart"
        /usr/bin/printf '%s\n' \
          '[Desktop Entry]' \
          'Type=Application' \
          'Name=Dream Skin' \
          'Exec=/bin/sh -c "exec dreamskin start"' \
          'X-GNOME-Autostart-enabled=true' \
          > "$target"
        printf ' 开机自启已开启（%s）。\n' "$target"
      fi
      ;;
    doctor) exec "$SCRIPT_DIR/status-dream-skin-linux.sh" --doctor ;;
    update) exec "$SCRIPT_DIR/check-update-linux.sh" ;;
    status) exec "$SCRIPT_DIR/status-dream-skin-linux.sh" ;;
    community) exec "$SCRIPT_DIR/community-apply-linux.sh" "$@" ;;
    *) return 1 ;;
  esac
}

main() {
  if [ "${1:-}" = "--self-test-source" ]; then
    return 0
  fi
  if [ "$#" -gt 0 ]; then
    local key=""
    key="$(resolve_command "$1")"
    [ -n "$key" ] || { printf '未知子命令：%s\n' "$1" >&2; exit 2; }
    dispatch "$key" "${@:2}" || exit 1
    return 0
  fi
  menu_loop
}

main "$@"
```

（`theme apply` 从菜单路径走时由 switch-theme 自身输出；子命令 `dreamskin theme apply <id>` 传 `--id`。`check-update-linux.sh` 在 Task 9 实现，先引用。）

- [ ] **Step 4: 运行测试确认通过**

Run: `bash linux/tests/dreamskin-dispatch.test.sh`
Expected: `dreamskin dispatch tests passed`

- [x] **Step 5: Commit**

```bash
git add linux/scripts/dreamskin.sh linux/tests/dreamskin-dispatch.test.sh
git commit -m "feat(linux): main entry with interactive menu and subcommands"
```

### Task 9: check-update、community 一键换肤、install 脚本

**Files:**
- Create: `linux/scripts/check-update-linux.sh`（copy `macos/scripts/check-update-macos.sh` + patch）
- Create: `linux/scripts/community-http.mjs`（新：受限 HTTP 客户端 + 链接/元数据校验，契约复刻 Swift 版）
- Create: `linux/scripts/community-apply.mjs`（新：一键换肤下载校验流水线）
- Create: `linux/scripts/community-apply-linux.sh`（新：编排解压/校验/发布/应用）
- Create: `linux/scripts/install-dream-skin-linux.sh`（copy `macos/scripts/install-dream-skin-macos.sh` + patch）
- Create: `linux/tests/community-http-bounded.test.mjs`（新写：Swift 测试无法在 Linux 跑，用 Node 复刻同一契约场景）

- [ ] **Step 1: 移植 check-update 与 install**

```bash
cp macos/scripts/check-update-macos.sh linux/scripts/check-update-linux.sh
cp macos/scripts/install-dream-skin-macos.sh linux/scripts/install-dream-skin-linux.sh
```

补丁：`common-macos.sh`→`common-linux.sh`；`require_macos_runtime`→`require_linux_runtime`；`install` 里 Desktop `.command` launcher 段（114–143 行）整体删除，替换为创建 `$HOME/.local/bin/dreamskin` 软链与 desktop entry：

```bash
if [ "$CREATE_LAUNCHERS" = "true" ]; then
  /bin/mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"
  /bin/ln -sf "$SCRIPT_DIR/dreamskin.sh" "$HOME/.local/bin/dreamskin"
  /usr/bin/printf '%s\n' \
    '[Desktop Entry]' \
    'Type=Application' \
    'Name=Dream Skin' \
    'Comment=External themes for Codex desktop' \
    "Exec=$SCRIPT_DIR/dreamskin.sh" \
    'Terminal=true' \
    'Categories=Utility;Development;' \
    'MimeType=x-scheme-handler/dreamskin;' \
    > "$HOME/.local/share/applications/codex-dream-skin.desktop"
  if command -v xdg-mime >/dev/null 2>&1; then
    xdg-mime default codex-dream-skin.desktop x-scheme-handler/dreamskin >/dev/null 2>&1 || true
  fi
fi
```

install 里 `--no-launch` 默认保持；`INSTALL_ROOT` 部署逻辑不变（走 common-linux.sh 的 `$HOME/.local/share/codex-dream-skin`）。

- [ ] **Step 2: 写失败测试（复刻 Swift 契约）**

Create `linux/tests/community-http-bounded.test.mjs`（node:test + 本地 http 服务器；场景与 `macos/tests/bounded-community-http.test.swift` 一致）：

```js
import assert from "node:assert/strict";
import http from "node:http";
import process from "node:process";
import test from "node:test";
import { boundedFetchBuffer, parseCommunityLink, validateCommunityMetadata } from "../scripts/community-http.mjs";

const server = http.createServer((request, response) => {
  switch (request.url) {
    case "/ok":
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      response.end("ok");
      break;
    case "/redirect":
      response.writeHead(302, { Location: "/ok" });
      response.end();
      break;
    case "/oversize-header":
      response.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": "32" });
      response.end("01234567890123456789012345678901");
      break;
    case "/oversize-body":
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      response.end("x".repeat(64));
      break;
    case "/not-found":
      response.writeHead(404);
      response.end();
      break;
    default:
      response.writeHead(500);
      response.end();
  }
});

test("bounded fetch contract", async (t) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => server.close());

  assert.equal(await boundedFetchBuffer(`${base}/ok`, { maximumBytes: 32 }), "ok");
  await assert.rejects(boundedFetchBuffer(`${base}/redirect`, { maximumBytes: 32 }));
  await assert.rejects(boundedFetchBuffer(`${base}/oversize-header`, { maximumBytes: 32 }));
  await assert.rejects(boundedFetchBuffer(`${base}/oversize-body`, { maximumBytes: 32 }));
  await assert.rejects(boundedFetchBuffer(`${base}/not-found`, { maximumBytes: 32 }));
});

test("community link parsing", () => {
  assert.equal(parseCommunityLink("dreamskin://apply?version=ver_abc12345"), "ver_abc12345");
  assert.equal(parseCommunityLink("dreamskin://apply?version=ver_ABC&x=1"), null);
  assert.equal(parseCommunityLink("https://dreamskin.cc/apply?version=ver_abc12345"), null);
  assert.equal(parseCommunityLink("dreamskin://apply?version=ver_"), null);
});

test("community metadata validation", () => {
  const base = {
    id: "ver_abc12345", themeId: "t-1", name: "N", version: "1.0.0",
    authorDisplayName: "A", license: "MIT",
    packageSha256: "a".repeat(64), packageBytes: 10, applyCompatible: true,
  };
  assert.deepEqual(validateCommunityMetadata(base, "ver_abc12345"), base);
  assert.throws(() => validateCommunityMetadata({ ...base, id: "ver_other1" }, "ver_abc12345"));
  assert.throws(() => validateCommunityMetadata({ ...base, name: "x y" }, "ver_abc12345"));
  assert.throws(() => validateCommunityMetadata({ ...base, name: "x‮y" }, "ver_abc12345"));
  assert.throws(() => validateCommunityMetadata({ ...base, packageSha256: "zz" }, "ver_abc12345"));
  assert.throws(() => validateCommunityMetadata({ ...base, packageBytes: 0 }, "ver_abc12345"));
  assert.throws(() => validateCommunityMetadata({ ...base, packageBytes: 33 * 1024 * 1024 }, "ver_abc12345"));
  assert.throws(() => validateCommunityMetadata({ ...base, applyCompatible: false }, "ver_abc12345"));
  assert.throws(() => validateCommunityMetadata({ ...base, version: "not-semver" }, "ver_abc12345"));
});
```

Run: `node linux/tests/community-http-bounded.test.mjs`
Expected: FAIL（`community-http.mjs` 不存在）

- [ ] **Step 3: 实现 community-http.mjs（契约来源已核实）**

契约来源（已从源码核实，勿凭记忆改）：`macos/menubar-app/Sources/DreamSkinCore/CommunityThemeLink.swift` 与 `macos/menubar-app/Sources/CodexDreamSkinMenuBar/BoundedCommunityHTTPClient.swift`：
- 链接：`^dreamskin://apply\?version=(ver_[a-z0-9]{8,64})$`
- 固定 API 源：`https://api.dreamskin.cc`；元数据 `GET /v1/themes/<versionID>`；下载 `GET /v1/themes/<versionID>/download`
- 元数据字段：`id`（必须等于 versionID）、`themeId`/`name`/`authorDisplayName`/`license`（安全文本 ≤80/120/120/80）、`version`（semver ≤32）、`packageSha256`（64 位 hex）、`packageBytes`（>0 且 ≤32 MiB）、`applyCompatible`（必须 true）
- 安全文本：不含控制字符 0x00–0x1F 及双向控制字符 0x061C, 0x200E, 0x200F, 0x2028–0x202E, 0x2066–0x2069
- HTTP：零重定向、Content-Length 预检、流式字节上限

Create `linux/scripts/community-http.mjs`：

```js
#!/usr/bin/env node
// Bounded HTTP client + DreamSkin.cc one-click link contract for Linux.
// Mirrors BoundedCommunityHTTPClient.swift / CommunityThemeLink.swift.

import http from "node:http";
import https from "node:https";

export const COMMUNITY_API_ORIGIN = "https://api.dreamskin.cc";
const MAX_HEADER_BYTES = 8 * 1024;
const MAXIMUM_PACKAGE_BYTES = 32 * 1024 * 1024;
const VERSION_ID_PATTERN = /^ver_[a-z0-9]{8,64}$/;
const LINK_PATTERN = /^dreamskin:\/\/apply\?version=(ver_[a-z0-9]{8,64})$/;
const UNSAFE_CODEPOINTS = new Set([
  0x061c, 0x200e, 0x200f, 0x2028, 0x2029, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2066, 0x2067, 0x2068, 0x2069,
]);

export function parseCommunityLink(input) {
  const match = /^dreamskin:\/\/apply\?version=(ver_[a-z0-9]{8,64})$/.exec(String(input || ""));
  return match ? match[1] : null;
}

export function isSafeDisplayText(value, maximum) {
  const text = String(value || "");
  if (text.length === 0 || text.length > maximum) return false;
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code <= 0x1f || UNSAFE_CODEPOINTS.has(code)) return false;
  }
  return true;
}

export function validateCommunityMetadata(metadata, expectedVersionID) {
  if (!metadata || typeof metadata !== "object") throw new Error("这个一键换肤链接无效。");
  const id = String(metadata.id || "");
  if (!VERSION_ID_PATTERN.test(id) || id !== expectedVersionID) throw new Error("这个一键换肤链接无效。");
  if (!isSafeDisplayText(metadata.themeId, 80)
    || !isSafeDisplayText(metadata.name, 120)
    || !isSafeDisplayText(metadata.authorDisplayName, 120)
    || !isSafeDisplayText(metadata.license, 80)) throw new Error("这个一键换肤链接无效。");
  const version = String(metadata.version || "");
  if (version.length > 32 || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("这个一键换肤链接无效。");
  if (!/^[0-9a-f]{64}$/.test(String(metadata.packageSha256 || ""))) throw new Error("这个一键换肤链接无效。");
  const bytes = Number(metadata.packageBytes);
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAXIMUM_PACKAGE_BYTES) throw new Error("这个一键换肤链接无效。");
  if (metadata.applyCompatible !== true) throw new Error("该主题暂不兼容当前客户端。");
  return metadata;
}

async function rawRequest(url, redirectsRemaining, maximumBytes, onChunk) {
  if (redirectsRemaining < 0) throw new Error("这个一键换肤链接无效。");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("这个一键换肤链接无效。");
  const transport = parsed.protocol === "https:" ? https : http;
  return await new Promise((resolve, reject) => {
    const request = transport.get(parsed, { headers: { Accept: "*/*" } }, (response) => {
      let headerBytes = 0;
      let bodyBytes = 0;
      const chunks = [];
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        const location = response.headers.location;
        if (!location) { reject(new Error("这个一键换肤链接无效。")); return; }
        const next = new URL(location, parsed);
        if (next.origin !== parsed.origin) { reject(new Error("这个一键换肤链接无效。")); return; }
        rawRequest(next.href, redirectsRemaining - 1, maximumBytes, onChunk).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error("这个一键换肤链接无效。")); return; }
      const declared = Number(response.headers["content-length"] || 0);
      if (declared > maximumBytes) { response.resume(); reject(new Error("这个一键换肤链接无效。")); return; }
      response.on("data", (chunk) => {
        bodyBytes += chunk.length;
        if (bodyBytes > maximumBytes) { response.destroy(); reject(new Error("这个一键换肤链接无效。")); return; }
        chunks.push(chunk);
        onChunk?.(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.setTimeout(30_000, () => { request.destroy(new Error("这个一键换肤链接无效。")); });
  });
}

export async function boundedFetchBuffer(url, { maximumBytes = MAXIMUM_PACKAGE_BYTES } = {}) {
  return await rawRequest(url, 0, maximumBytes);
}

export async function boundedFetchJson(url) {
  const body = await boundedFetchBuffer(url, { maximumBytes: 64 * 1024 });
  return JSON.parse(body.toString("utf8"));
}
```

Run: `node linux/tests/community-http-bounded.test.mjs`
Expected: 全部通过

- [ ] **Step 4: 实现 community-apply.mjs + community-apply-linux.sh**

Create `linux/scripts/community-apply.mjs`（CLI：`community-apply.mjs <dreamskin-url> <transaction-root>`）：

```js
#!/usr/bin/env node
// One-click apply downloader: parse the dreamskin:// link, fetch metadata and
// package from the fixed official API only, verify size and SHA-256, and
// leave package.zip + community-package.json in the transaction root.

import fs from "node:fs/promises";
import crypto from "node:crypto";
import process from "node:process";
import path from "node:path";
import {
  COMMUNITY_API_ORIGIN,
  boundedFetchBuffer,
  boundedFetchJson,
  parseCommunityLink,
  validateCommunityMetadata,
} from "./community-http.mjs";

const [link, transactionRoot] = process.argv.slice(2);
if (!link || !transactionRoot) {
  console.error("Usage: community-apply.mjs <dreamskin-url> <transaction-root>");
  process.exit(2);
}
const versionID = parseCommunityLink(link);
if (!versionID) {
  console.error("这个一键换肤链接无效。");
  process.exit(1);
}
const metadataURL = `${COMMUNITY_API_ORIGIN}/v1/themes/${versionID}`;
const downloadURL = `${COMMUNITY_API_ORIGIN}/v1/themes/${versionID}/download`;
try {
  const metadata = validateCommunityMetadata(await boundedFetchJson(metadataURL), versionID);
  const body = await boundedFetchBuffer(downloadURL, { maximumBytes: metadata.packageBytes });
  if (body.length !== metadata.packageBytes) throw new Error("这个一键换肤链接无效。");
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  if (digest !== metadata.packageSha256) throw new Error("这个一键换肤链接无效。");
  await fs.mkdir(transactionRoot, { recursive: true });
  await fs.writeFile(path.join(transactionRoot, "package.zip"), body, { mode: 0o600 });
  await fs.writeFile(
    path.join(transactionRoot, "community-package.json"),
    `${JSON.stringify({
      themeId: metadata.themeId,
      name: metadata.name,
      version: metadata.version,
      packageSha256: metadata.packageSha256,
      packageBytes: metadata.packageBytes,
    }, null, 2)}\n`,
    { mode: 0o600 },
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "这个一键换肤链接无效。");
  process.exit(1);
}
```

Create `linux/scripts/community-apply-linux.sh`：

```bash
#!/bin/bash

# One-click apply from DreamSkin.cc via dreamskin://apply?version=ver_...
# Strict: fixed official API host only, no redirects, size + SHA-256 verified,
# then reuses the exact ZIP/manifest/image/Safe-CSS import pipeline.

set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd -P)/common-linux.sh"

URL="${1:-}"
case "$URL" in
  dreamskin://apply?*) ;;
  *) fail "Unsupported Dream Skin link." ;;
esac

ensure_node_runtime
TRANSACTION_ROOT="$(/bin/mktemp -d "$STATE_ROOT/community-apply.XXXXXX")"
cleanup() { /bin/rm -rf "$TRANSACTION_ROOT"; }
trap cleanup EXIT

"$NODE" "$SCRIPT_DIR/community-apply.mjs" "$URL" "$TRANSACTION_ROOT"

read_package_field() {
  "$NODE" -e '
    const fs = require("node:fs");
    process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[process.argv[2]] || ""));
  ' "$TRANSACTION_ROOT/community-package.json" "$1"
}

# Import validates the ZIP contract, manifest, image, Safe CSS and the exact
# downloaded byte identity; its JSON output carries the content fingerprint.
IMPORT_RESULT="$("$SCRIPT_DIR/import-theme-zip-linux.sh" \
  --file "$TRANSACTION_ROOT/package.zip" \
  --expected-sha256 "$(read_package_field packageSha256)" \
  --expected-bytes "$(read_package_field packageBytes)")"
THEME_ID="$(printf '%s' "$IMPORT_RESULT" | "$NODE" -e '
  let id = "";
  process.stdin.on("data", (chunk) => {
    try { id = String(JSON.parse(chunk.toString("utf8")).id || ""); } catch {}
  });
  process.stdin.on("end", () => process.stdout.write(id));
')"
FINGERPRINT="$(printf '%s' "$IMPORT_RESULT" | "$NODE" -e '
  let fp = "";
  process.stdin.on("data", (chunk) => {
    try { fp = String(JSON.parse(chunk.toString("utf8")).contentFingerprint || ""); } catch {}
  });
  process.stdin.on("end", () => process.stdout.write(fp));
')"
ACTIVE_ID="$( "$SCRIPT_DIR/status-dream-skin-linux.sh" --json --deep 2>/dev/null | "$NODE" -e '
  let id = "";
  process.stdin.on("data", (chunk) => {
    try { id = String(JSON.parse(chunk.toString("utf8")).appliedThemeId || ""); } catch {}
  });
  process.stdin.on("end", () => process.stdout.write(id));
')"

"$SCRIPT_DIR/apply-community-theme-linux.sh" \
  --id "$THEME_ID" \
  --expect-fingerprint "$FINGERPRINT" \
  --expect-active-id "$ACTIVE_ID" \
  --transaction-root "$TRANSACTION_ROOT"
```

- [ ] **Step 5: 语法与测试**

Run: `node linux/tests/community-http-bounded.test.mjs && node --check linux/scripts/community-apply.mjs && bash -n linux/scripts/community-apply-linux.sh linux/scripts/install-dream-skin-linux.sh linux/scripts/check-update-linux.sh`
Expected: 全部通过

- [ ] **Step 3: 跑测试**

Run: `node linux/tests/community-http-bounded.test.mjs && bash -n linux/scripts/community-apply-linux.sh linux/scripts/install-dream-skin-linux.sh linux/scripts/check-update-linux.sh`
Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add linux/scripts/check-update-linux.sh linux/scripts/install-dream-skin-linux.sh linux/scripts/community-apply-linux.sh linux/tests/community-http-bounded.test.mjs
git commit -m "feat(linux): install, check-update and one-click community apply"
```

### Task 10: .deb 打包（installer/ + build-deb.sh）

**Files:**
- Create: `linux/installer/control`、`linux/installer/postinst`、`linux/installer/prerm`、`linux/installer/postrm`、`linux/installer/codex-dream-skin.desktop`
- Create: `linux/scripts/build-deb.sh`
- Modify: `linux/tests/run-tests.sh`（bash -n 循环追加 `linux/installer` 无扩展名脚本：postinst/prerm/postrm，以及 node 版本 ≥ 18 检查）
- Test: `linux/tests/deb-content.test.sh`

- [ ] **Step 1: 写失败测试（deb 内容断言）**

Create `linux/tests/deb-content.test.sh`：

```bash
#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
DEB="${1:-}"

if [ -z "$DEB" ]; then
  printf 'usage: deb-content.test.sh <path-to.deb>\n' >&2
  exit 2
fi
[ -f "$DEB" ] || { printf 'deb not found: %s\n' "$DEB" >&2; exit 1; }

CONTENTS="$(dpkg-deb -c "$DEB")"
for required in \
  'opt/codex-dream-skin/scripts/dreamskin.sh' \
  'opt/codex-dream-skin/scripts/injector.mjs' \
  'opt/codex-dream-skin/scripts/common-linux.sh' \
  'opt/codex-dream-skin/scripts/linux-launch.sh' \
  'opt/codex-dream-skin/assets/renderer-inject.js' \
  'opt/codex-dream-skin/assets/theme-package-validator.mjs' \
  'opt/codex-dream-skin/assets/safe-css-validator.mjs' \
  'opt/codex-dream-skin/assets/safe-css-policy.json' \
  'usr/bin/dreamskin' \
  'usr/share/applications/codex-dream-skin.desktop'; do
  case "$CONTENTS" in
    *"$required"*) ;;
    *) printf 'missing from deb: %s\n' "$required" >&2; exit 1 ;;
  esac
done

INFO="$(dpkg-deb -f "$DEB" Package Depends Architecture)"
case "$INFO" in
  *"codex-dream-skin"*) ;;
  *) printf 'bad package name\n' >&2; exit 1 ;;
esac
case "$INFO" in
  *"nodejs"*) ;;
  *) printf 'nodejs dependency missing\n' >&2; exit 1 ;;
esac
printf 'deb content tests passed\n'
```

- [ ] **Step 2: 运行确认失败**

Run: `bash linux/tests/deb-content.test.sh`
Expected: FAIL（用法提示，退出码 2）

- [ ] **Step 3: 写 installer 素材**

Create `linux/installer/control`：

```
Package: codex-dream-skin
Version: 1.5.14
Section: utils
Priority: optional
Architecture: amd64
Depends: bash, coreutils, curl, nodejs (>= 18.0), xdg-utils, iproute2
Maintainer: Codex Dream Skin <noreply@dreamskin.cc>
Description: External themes for the official Codex desktop app
 Dream Skin applies local CSS themes to the official Codex desktop app
 through a local CDP connection. It never modifies the official package.
```

Create `linux/installer/postinst`：

```bash
#!/bin/bash
set -e
ln -sf /opt/codex-dream-skin/scripts/dreamskin.sh /usr/bin/dreamskin
update-desktop-database /usr/share/applications >/dev/null 2>&1 || true
command -v xdg-mime >/dev/null 2>&1 \
  && xdg-mime default codex-dream-skin.desktop x-scheme-handler/dreamskin >/dev/null 2>&1 || true
exit 0
```

Create `linux/installer/prerm`：

```bash
#!/bin/bash
set -e
command -v xdg-mime >/dev/null 2>&1 \
  && xdg-mime uninstall /usr/share/applications/codex-dream-skin.desktop >/dev/null 2>&1 || true
exit 0
```

Create `linux/installer/postrm`：

```bash
#!/bin/bash
set -e
rm -f /usr/bin/dreamskin
rm -rf /opt/codex-dream-skin
exit 0
```

Create `linux/installer/codex-dream-skin.desktop`：

```ini
[Desktop Entry]
Type=Application
Name=Dream Skin
Comment=External themes for Codex desktop
Exec=dreamskin
Terminal=true
Categories=Utility;Development;
MimeType=x-scheme-handler/dreamskin;
```

- [ ] **Step 4: 写 build-deb.sh**

Create `linux/scripts/build-deb.sh`：

```bash
#!/bin/bash

# Build codex-dream-skin_<version>_amd64.deb with dpkg-deb (no extra tooling).
# Usage: build-deb.sh [--version X.Y.Z]  (defaults to linux/VERSION)

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) VERSION="${2:-}"; shift 2 ;;
    *) printf 'Unknown build-deb argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done
case "$VERSION" in
  ''|*[!0-9.]*) printf 'Invalid version: %s\n' "$VERSION" >&2; exit 1 ;;
esac

STAGE="$(/bin/mktemp -d /tmp/dreamskin-deb.XXXXXX)"
trap '/bin/rm -rf "$STAGE"' EXIT

/usr/bin/mkdir -p "$STAGE/opt/codex-dream-skin" "$STAGE/usr/bin" \
  "$STAGE/usr/share/applications" "$STAGE/DEBIAN"
# Stage the engine (scripts + assets + presets; exclude packaging-only dirs).
/usr/bin/rsync -a --exclude 'installer/' --exclude 'tests/' --exclude 'release/' \
  "$ROOT/" "$STAGE/opt/codex-dream-skin/"
/usr/bin/rm -f "$STAGE/opt/codex-dream-skin/scripts/build-deb.sh" \
  "$STAGE/opt/codex-dream-skin/scripts/build-tarball.sh" \
  "$STAGE/opt/codex-dream-skin/scripts/build-release-linux.sh"

/usr/bin/sed "s/^Version: .*/Version: $VERSION/" "$ROOT/installer/control" \
  > "$STAGE/DEBIAN/control"
/usr/bin/cp "$ROOT/installer/postinst" "$ROOT/installer/prerm" "$ROOT/installer/postrm" \
  "$STAGE/DEBIAN/"
/bin/chmod 755 "$STAGE/DEBIAN/postinst" "$STAGE/DEBIAN/prerm" "$STAGE/DEBIAN/postrm"
/usr/bin/cp "$ROOT/installer/codex-dream-skin.desktop" "$STAGE/usr/share/applications/"

/usr/bin/find "$STAGE/opt" -type f -exec /bin/chmod 644 {} \;
/usr/bin/find "$STAGE/opt" -type f -name '*.sh' -exec /bin/chmod 755 {} \;

OUT_DIR="$ROOT/release"
/usr/bin/mkdir -p "$OUT_DIR"
/usr/bin/dpkg-deb --root-owner-group --build "$STAGE" \
  "$OUT_DIR/codex-dream-skin_${VERSION}_amd64.deb"
printf 'built %s\n' "$OUT_DIR/codex-dream-skin_${VERSION}_amd64.deb"
```

- [ ] **Step 5: 构建并用测试验证**

Run: `bash linux/scripts/build-deb.sh && bash linux/tests/deb-content.test.sh release/codex-dream-skin_1.5.14_amd64.deb`
Expected: `built release/...` 后输出 `deb content tests passed`

- [ ] **Step 6: Commit**

```bash
git add linux/installer/ linux/scripts/build-deb.sh linux/tests/deb-content.test.sh
git commit -m "feat(linux): dpkg packaging with content assertions"
```

### Task 11: tar.gz 打包与 build-release-linux.sh

**Files:**
- Create: `linux/scripts/build-tarball.sh`、`linux/scripts/build-release-linux.sh`

- [ ] **Step 1: 写 build-tarball.sh**

Create `linux/scripts/build-tarball.sh`：

```bash
#!/bin/bash

# Portable tarball: CodexDreamSkin-v<version>-linux-amd64.tar.gz
# Contains the engine tree plus install.sh, usable without root.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
VERSION="$(/usr/bin/tr -d '[:space:]' < "$ROOT/VERSION")"
case "$VERSION" in
  ''|*[!0-9.]*) printf 'Invalid version: %s\n' "$VERSION" >&2; exit 1 ;;
esac

STAGE="$(/bin/mktemp -d /tmp/dreamskin-tar.XXXXXX)"
trap '/bin/rm -rf "$STAGE"' EXIT
/usr/bin/mkdir -p "$STAGE/codex-dream-skin"
/usr/bin/rsync -a --exclude 'installer/' --exclude 'tests/' --exclude 'release/' \
  --exclude 'scripts/build-deb.sh' --exclude 'scripts/build-tarball.sh' \
  --exclude 'scripts/build-release-linux.sh' \
  "$ROOT/" "$STAGE/codex-dream-skin/"

/usr/bin/printf '%s\n' \
  '#!/bin/bash' \
  'set -euo pipefail' \
  'SRC="$(cd "$(dirname "$0")" && pwd -P)"' \
  "exec \"\$SRC/scripts/install-dream-skin-linux.sh\" --no-launch \"\$@\"" \
  > "$STAGE/codex-dream-skin/install.sh"
/bin/chmod 755 "$STAGE/codex-dream-skin/install.sh"

OUT_DIR="$ROOT/release"
/usr/bin/mkdir -p "$OUT_DIR"
/usr/bin/tar -C "$STAGE" -czf \
  "$OUT_DIR/CodexDreamSkin-v${VERSION}-linux-amd64.tar.gz" codex-dream-skin
printf 'built %s\n' "$OUT_DIR/CodexDreamSkin-v${VERSION}-linux-amd64.tar.gz"
```

- [ ] **Step 2: 写 build-release-linux.sh（含 sync 与测试闸门）**

Create `linux/scripts/build-release-linux.sh`：

```bash
#!/bin/bash

# Full Linux release pipeline: sync shared assets, run the test suite,
# then build tar.gz and deb. Fails fast if anything is out of date.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd -P)"
LINUX_ROOT="$ROOT/linux"

/usr/bin/node "$ROOT/tools/sync-runtime-assets.mjs"
/usr/bin/node "$ROOT/tools/sync-runtime-assets.mjs" --check \
  || { printf 'Shared runtime assets are out of date; sync them first.\n' >&2; exit 1; }

/bin/bash "$LINUX_ROOT/tests/run-tests.sh"

/bin/bash "$LINUX_ROOT/scripts/build-tarball.sh"
/bin/bash "$LINUX_ROOT/scripts/build-deb.sh"
/bin/bash "$LINUX_ROOT/tests/deb-content.test.sh" \
  "$LINUX_ROOT/release/codex-dream-skin_$(/usr/bin/tr -d '[:space:]' < "$LINUX_ROOT/VERSION")_amd64.deb"

( cd "$LINUX_ROOT/release" && /usr/bin/sha256sum *.deb *.tar.gz > SHA256SUMS.txt )
printf 'Linux release artifacts are ready in %s\n' "$LINUX_ROOT/release"
```

- [ ] **Step 3: 全量跑通**

Run: `bash linux/scripts/build-release-linux.sh`
Expected: 输出 updated=…（若有变更）、`linux tests passed`、`built …tar.gz`、`built …deb`、`deb content tests passed`、`Linux release artifacts are ready`

- [ ] **Step 4: Commit**

```bash
git add linux/scripts/build-tarball.sh linux/scripts/build-release-linux.sh
git commit -m "feat(linux): tarball and release pipeline scripts"
```

### Task 12: 三端版本同步断言 + CI

**Files:**
- Modify: `macos/tests/release-workflow.test.mjs`（加 linux/VERSION 断言）
- Modify: `.github/workflows/ci.yml`（加 linux 测试 job）
- Modify: `.github/workflows/release.yml`（加 linux 构建 + 资产上传）

- [ ] **Step 1: 先看现有版本同步断言再改**

Run: `grep -n "windows/VERSION\|VERSION" macos/tests/release-workflow.test.mjs | head -20`
Expected: 找到现存的版本一致性断言（按实际实现追加 linux 分支）

在版本一致性断言中加：
```js
const linuxVersion = fs.readFileSync(new URL("../linux/VERSION", import.meta.url), "utf8").trim();
assert.equal(linuxVersion, macosVersion, "linux/VERSION must match macos/VERSION");
```

Run: `node macos/tests/release-workflow.test.mjs`
Expected: PASS（linux/VERSION=1.5.14 与 macos 一致）

- [ ] **Step 2: ci.yml 加 linux job**

在 `.github/workflows/ci.yml` 的 jobs 末尾追加：

```yaml
  linux-tests:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Sync check
        run: node tools/sync-runtime-assets.mjs --check
      - name: Linux tests
        run: bash linux/tests/run-tests.sh
      - name: Linux release build
        run: bash linux/scripts/build-release-linux.sh
      - name: Upload linux artifacts
        uses: actions/upload-artifact@v4
        with:
          name: linux-packages
          path: linux/release/*
          if-no-files-found: error
```

- [ ] **Step 3: release.yml 加 linux 资产**

读 `.github/workflows/release.yml` 现有的 exe/dmg 上传步骤，按同样模式追加：

```yaml
      - name: Download linux packages
        uses: actions/download-artifact@v4
        with:
          name: linux-packages
          path: linux/release
      - name: Upload linux release assets
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          for f in linux/release/*.deb linux/release/*.tar.gz; do
            gh release upload "${{ github.ref_name }}" "$f" --clobber
          done
```

（若现有 workflow 用别的资产收集机制，按实际结构接入；不得改变现有 macOS/Windows 资产路径。）

- [ ] **Step 4: 本地验证 workflow YAML 语法**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); yaml.safe_load(open('.github/workflows/release.yml'))"`（若环境无 PyYAML 则用 `ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml")'` 或跳过并标注）
Expected: 无解析错误

- [x] **Step 5: Commit**

```bash
git add macos/tests/release-workflow.test.mjs .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "feat(linux): version sync assertion and CI build"
```

### Task 13: 文档

**Files:**
- Create: `docs/install-linux.md`、`docs/install-linux.en.md`（如双端双语文档惯例如此）
- Modify: `docs/platforms.md`（能力矩阵加 Linux 列 + 路径速查加 Linux 表）
- Modify: `README.md`、`README.en.md`（安装段加 Linux、能力矩阵加 Linux）

- [ ] **Step 1: 写 docs/install-linux.md**

内容必须覆盖（双语结构参照 `docs/install-windows.md`）：

1. 前置：官方 Codex Linux 版安装（官方 apt 源两条命令、或 AppImage 下载 + 执行权限）
2. `.deb` 安装：`sudo dpkg -i codex-dream-skin_<version>_amd64.deb`；首跑 `dreamskin`
3. tar.gz：解压 → `./install.sh`（无 root）→ `~/.local/bin/dreamskin`（提示 PATH）
4. 使用：菜单各项说明 + 常用子命令表（start/pause/restore/import/theme list|apply/bg/autostart on|off）
5. AppImage 用户首次运行需确认（`--allow-unsigned` 一次性记录 SHA-256）
6. 故障排查（从 spec 调研存档移植）：
   - 白屏/卡 logo：清 `~/.config/Codex/` 缓存 → 备份重置 `~/.codex`（auth.json 需重登）
   - Wayland 模糊：`dreamskin start --renderer=x11`
   - NVIDIA 花屏：`--renderer=x11` + 在 `~/.local/state/codex-dream-skin/electron-flags.conf` 加 `--disable-gpu-compositing`
   - 输入法候选框不显示：flags 里加 `--enable-wayland-ime`
   - 卸载：`sudo dpkg -r codex-dream-skin`（或删 `~/.local/share/codex-dream-skin` 与 `~/.local/bin/dreamskin`）
7. 恢复官方外观：菜单 7 / `dreamskin restore`

- [ ] **Step 2: 更新 platforms.md 与 README**

- `docs/platforms.md` 能力矩阵加「Linux」列（脚本/菜单 ✅、安装包 ✅ deb+tar.gz、原生控制入口 = 终端菜单、签名校验 = apt 源溯源 + dpkg -V、客户部署提示词 ❌）
- 路径速查加 Linux 表（源码 `linux/`、安装后引擎 `/opt/codex-dream-skin` 或 `~/.local/share/codex-dream-skin`、状态/日志 `~/.local/state/codex-dream-skin`、Codex 配置 `~/.codex/config.toml`、默认 CDP 端口 9335 起自动换口）
- `README.md`/`README.en.md` 直接安装段加 Linux 条目 + Release 资产列表加 `.deb`/`tar.gz`

- [ ] **Step 3: Commit**

```bash
git add docs/install-linux.md docs/install-linux.en.md docs/platforms.md README.md README.en.md
git commit -m "docs(linux): installation guide and platform matrix"
```

### Task 14: 全量回归 + 自检 + 推送

- [ ] **Step 1: 全量测试**

Run:
```bash
node tools/sync-runtime-assets.mjs --check
bash linux/tests/run-tests.sh
node macos/tests/release-workflow.test.mjs
```
Expected: 全部通过。macOS 测试本机若依赖 macOS 专用 node 路径则只跑 `release-workflow.test.mjs` 并注明其余交给 CI。

- [ ] **Step 2: 残留平台 API 全目录门禁**

Run（预期无输出）：
```bash
grep -rn "osascript\|launchctl\|codesign\|plutil\|mdfind\|dscl\|open -na" linux/scripts/ linux/installer/
```
Expected: 无匹配

- [ ] **Step 3: git 状态自查并推送**

```bash
git status --short
git log --oneline main..HEAD
git push -u origin feat/linux-support
```

- [ ] **Step 4: 打开 PR**

```bash
gh pr create --title "feat(linux): Dream Skin for Ubuntu / Pop!_OS" \
  --body "Implements the Linux port per docs/superpowers/specs/2026-08-15-linux-support-design.md. deb + tar.gz, menu + subcommands, feature parity with macOS/Windows.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## 实机验收清单（PR 合并后、Release 前）

- [ ] Pop!_OS 实机：官方 apt 源装 codex-desktop → `sudo dpkg -i codex-dream-skin_*_amd64.deb` → `dreamskin` 菜单启动 → CDP 截图确认换肤可见
- [ ] 导入/切换主题、换背景图、一键恢复（外观 + `~/.codex/config.toml`）实机逐一确认
- [ ] 注入失败回滚且如实报告
- [ ] Ubuntu 24.04（CI 容器）deb 安装/卸载干净
- [ ] tar.gz 无 root 解压 + install.sh
- [ ] 三端 VERSION 一致、CI 全绿、Release 资产（deb/tar.gz/SHA256SUMS）可下载
- [ ] `readlink /usr/bin/codex-desktop` 输出指向真实二进制路径（确认 deb 布局符号链接假设成立）
- [ ] 终端里裸命令启动 `codex-desktop` 后 `codex_is_running` 必须能发现（argv[0] 不带路径的场景）
