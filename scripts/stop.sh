#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${RESUME_EDITOR_STATE_DIR:-"$ROOT_DIR/.resume-editor"}"

CLIENT_PID_FILE="$STATE_DIR/client.pid"
SERVER_PID_FILE="$STATE_DIR/server.pid"

is_running() {
  local pid="${1:-}"

  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local pid_file="$1"

  if [[ -f "$pid_file" ]]; then
    tr -d '[:space:]' < "$pid_file"
  fi
}

descendants_of() {
  local parent="$1"
  local child

  if ! command -v pgrep >/dev/null 2>&1; then
    return
  fi

  while read -r child; do
    [[ -n "$child" ]] || continue
    echo "$child"
    descendants_of "$child"
  done < <(pgrep -P "$parent" 2>/dev/null || true)
}

stop_process() {
  local name="$1"
  local pid_file="$2"
  local pid
  local pid_list

  pid="$(read_pid "$pid_file")"

  if ! is_running "$pid"; then
    rm -f "$pid_file"
    echo "$name is not running."
    return
  fi

  pid_list="$(
    {
      echo "$pid"
      descendants_of "$pid"
    } | awk 'NF && !seen[$0]++'
  )"

  echo "Stopping $name..."
  # shellcheck disable=SC2086
  kill -TERM $pid_list 2>/dev/null || true

  for _ in {1..20}; do
    if ! is_running "$pid"; then
      rm -f "$pid_file"
      echo "$name stopped."
      return
    fi
    sleep 0.25
  done

  # shellcheck disable=SC2086
  kill -KILL $pid_list 2>/dev/null || true
  rm -f "$pid_file"
  echo "$name stopped."
}

stop_process "Vite client" "$CLIENT_PID_FILE"
stop_process "API server" "$SERVER_PID_FILE"
