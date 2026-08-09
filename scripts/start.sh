#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${RESUME_EDITOR_STATE_DIR:-"$ROOT_DIR/.resume-editor"}"
LOG_DIR="$STATE_DIR/logs"

CLIENT_PORT="${RESUME_EDITOR_CLIENT_PORT:-5173}"
SERVER_PORT="${RESUME_EDITOR_PORT:-43871}"
APP_URL="http://127.0.0.1:$CLIENT_PORT"
API_URL="http://127.0.0.1:$SERVER_PORT/api/project"

CLIENT_PID_FILE="$STATE_DIR/client.pid"
SERVER_PID_FILE="$STATE_DIR/server.pid"
CLIENT_LOG="$LOG_DIR/client.log"
SERVER_LOG="$LOG_DIR/server.log"

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

port_in_use() {
  local port="$1"

  command -v lsof >/dev/null 2>&1 &&
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

guard_port() {
  local name="$1"
  local port="$2"
  local pid_file="$3"
  local port_variable="$4"
  local pid

  pid="$(read_pid "$pid_file")"
  if is_running "$pid"; then
    return
  fi

  if port_in_use "$port"; then
    echo "$name port $port is already in use and was not started by this script."
    echo "Stop that process first, or choose another port with $port_variable."
    exit 1
  fi
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local log_file="$3"

  for _ in {1..40}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done

  echo "$name did not become ready: $url"
  echo "Log: $log_file"
  return 1
}

start_process() {
  local name="$1"
  local pid_file="$2"
  local log_file="$3"
  shift 3

  local pid
  pid="$(read_pid "$pid_file")"

  if is_running "$pid"; then
    echo "$name is already running with PID $pid."
    return
  fi

  rm -f "$pid_file"
  echo "Starting $name..."
  node -e '
    const { openSync, writeFileSync } = require("node:fs");
    const { spawn } = require("node:child_process");

    const [rootDir, pidFile, logFile, command, ...args] = process.argv.slice(1);
    const logFd = openSync(logFile, "a");
    const child = spawn(command, args, {
      cwd: rootDir,
      detached: true,
      env: process.env,
      stdio: ["ignore", logFd, logFd]
    });

    child.unref();
    writeFileSync(pidFile, `${child.pid}\n`);
  ' "$ROOT_DIR" "$pid_file" "$log_file" "$@"
}

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "node_modules is missing. Run npm install first."
  exit 1
fi

mkdir -p "$LOG_DIR"

guard_port "API server" "$SERVER_PORT" "$SERVER_PID_FILE" "RESUME_EDITOR_PORT"
guard_port "Vite client" "$CLIENT_PORT" "$CLIENT_PID_FILE" "RESUME_EDITOR_CLIENT_PORT"

start_process "API server" "$SERVER_PID_FILE" "$SERVER_LOG" npm run server
start_process "Vite client" "$CLIENT_PID_FILE" "$CLIENT_LOG" npm run client

if ! wait_for_url "API server" "$API_URL" "$SERVER_LOG"; then
  "$ROOT_DIR/scripts/stop.sh"
  exit 1
fi

if ! wait_for_url "Vite client" "$APP_URL" "$CLIENT_LOG"; then
  "$ROOT_DIR/scripts/stop.sh"
  exit 1
fi

echo "Resume LaTeX Editor is running:"
echo "  $APP_URL"
echo
echo "Logs:"
echo "  $SERVER_LOG"
echo "  $CLIENT_LOG"
