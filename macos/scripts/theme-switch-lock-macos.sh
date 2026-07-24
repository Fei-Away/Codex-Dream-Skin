#!/bin/bash

# Shared cross-process lock for active-theme publication and renderer apply.

THEME_SWITCH_LOCK=""
THEME_SWITCH_LOCK_TOKEN=""
THEME_SWITCH_LOCK_OWNED="false"

theme_switch_lock_age_seconds() {
  local lock="$1"
  local modified=""
  local now=""
  modified="$(/usr/bin/stat -f '%m' "$lock" 2>/dev/null || true)"
  now="$(/bin/date '+%s')"
  case "$modified" in ''|*[!0-9]*) return 1 ;; esac
  [ "$now" -ge "$modified" ] || return 1
  /usr/bin/expr "$now" - "$modified"
}

write_theme_switch_lock_identity() {
  local lock="$1"
  local token="$2"
  (
    set -C
    /usr/bin/printf '%s\n' "$$" > "$lock/owner"
    /usr/bin/printf '%s\n' "$token" > "$lock/token"
  ) || return 1
  /bin/chmod 600 "$lock/owner" "$lock/token"
}

acquire_theme_switch_lock() {
  local token="$1"
  local owner=""
  local age=""
  local reap=""
  operation_token_is_valid "$token" || fail "Theme switch lock token is invalid."
  ensure_state_root
  THEME_SWITCH_LOCK="$STATE_ROOT/.theme-switch.lock"
  THEME_SWITCH_LOCK_TOKEN="$token"

  if ! /bin/mkdir "$THEME_SWITCH_LOCK" 2>/dev/null; then
    [ -d "$THEME_SWITCH_LOCK" ] && [ ! -L "$THEME_SWITCH_LOCK" ] \
      || fail "Theme switch lock is not a regular private directory."
    if [ -f "$THEME_SWITCH_LOCK/owner" ] && [ ! -L "$THEME_SWITCH_LOCK/owner" ]; then
      owner="$(/bin/cat "$THEME_SWITCH_LOCK/owner" 2>/dev/null || true)"
    fi
    case "$owner" in ''|*[!0-9]*) owner="" ;; esac
    if [ -n "$owner" ] && /bin/kill -0 "$owner" 2>/dev/null; then
      fail "Another theme switch is still running."
    fi
    if [ -z "$owner" ]; then
      age="$(theme_switch_lock_age_seconds "$THEME_SWITCH_LOCK" 2>/dev/null || true)"
      case "$age" in ''|*[!0-9]*) fail "Another theme switch is initializing." ;; esac
      [ "$age" -ge 600 ] || fail "Another theme switch is initializing."
    fi
    reap="$STATE_ROOT/.theme-switch.reap.$$"
    [ ! -e "$reap" ] && [ ! -L "$reap" ] || fail "Could not reserve stale-lock cleanup path."
    /bin/mv "$THEME_SWITCH_LOCK" "$reap" || fail "Could not retire a stale theme switch lock."
    if ! /bin/mkdir "$THEME_SWITCH_LOCK" 2>/dev/null; then
      /bin/rm -rf "$reap"
      fail "Another theme switch started concurrently."
    fi
    /bin/rm -rf "$reap"
  fi

  THEME_SWITCH_LOCK_OWNED="true"
  /bin/chmod 700 "$THEME_SWITCH_LOCK"
  if ! write_theme_switch_lock_identity "$THEME_SWITCH_LOCK" "$token"; then
    release_theme_switch_lock
    fail "Could not publish the theme switch lock identity."
  fi
}

assert_inherited_theme_switch_lock() {
  local token="$1"
  local expected_owner="$2"
  local owner=""
  local stored_token=""
  ensure_state_root
  THEME_SWITCH_LOCK="$STATE_ROOT/.theme-switch.lock"
  [ -d "$THEME_SWITCH_LOCK" ] && [ ! -L "$THEME_SWITCH_LOCK" ] \
    || fail "The inherited theme switch transaction lock is missing."
  [ -f "$THEME_SWITCH_LOCK/owner" ] && [ ! -L "$THEME_SWITCH_LOCK/owner" ] \
    && [ -f "$THEME_SWITCH_LOCK/token" ] && [ ! -L "$THEME_SWITCH_LOCK/token" ] \
    || fail "The inherited theme switch transaction identity is invalid."
  owner="$(/bin/cat "$THEME_SWITCH_LOCK/owner" 2>/dev/null || true)"
  stored_token="$(/bin/cat "$THEME_SWITCH_LOCK/token" 2>/dev/null || true)"
  [ "$owner" = "$expected_owner" ] && /bin/kill -0 "$owner" 2>/dev/null \
    && [ "$stored_token" = "$token" ] \
    || fail "The inherited theme switch transaction no longer owns the lock."
}

release_theme_switch_lock() {
  [ "$THEME_SWITCH_LOCK_OWNED" = "true" ] || return 0
  if [ -n "${THEME_SWITCH_LOCK:-}" ] && [ -d "$THEME_SWITCH_LOCK" ] \
    && [ ! -L "$THEME_SWITCH_LOCK" ] \
    && [ -f "$THEME_SWITCH_LOCK/owner" ] && [ ! -L "$THEME_SWITCH_LOCK/owner" ] \
    && [ -f "$THEME_SWITCH_LOCK/token" ] && [ ! -L "$THEME_SWITCH_LOCK/token" ] \
    && [ "$(/bin/cat "$THEME_SWITCH_LOCK/owner" 2>/dev/null || true)" = "$$" ] \
    && [ "$(/bin/cat "$THEME_SWITCH_LOCK/token" 2>/dev/null || true)" = "$THEME_SWITCH_LOCK_TOKEN" ]; then
    /bin/rm -rf "$THEME_SWITCH_LOCK"
  fi
  THEME_SWITCH_LOCK_OWNED="false"
}
