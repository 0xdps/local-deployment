default:
  @just --list

doctor:
  #!/usr/bin/env bash
  set -euo pipefail
  command -v docker >/dev/null 2>&1 || { echo "docker is required"; exit 1; }
  docker info >/dev/null 2>&1 || { echo "docker daemon is not running"; exit 1; }
  command -v just >/dev/null 2>&1 || { echo "just is required"; exit 1; }
  [ -f .env ] || { echo ".env missing. Run: cp .env.example .env"; exit 1; }
  docker compose --env-file .env -f compose.yaml -f compose.dev.yaml config >/dev/null
  echo "doctor: environment is ready"

up:
  docker compose --env-file .env -f compose.yaml -f compose.dev.yaml up --build

up-d:
  docker compose --env-file .env -f compose.yaml -f compose.dev.yaml up --build -d

down:
  docker compose --env-file .env -f compose.yaml -f compose.dev.yaml down

logs:
  docker compose --env-file .env -f compose.yaml -f compose.dev.yaml logs -f

ps:
  docker compose --env-file .env -f compose.yaml -f compose.dev.yaml ps

health:
  curl -fsS http://localhost:${EDGE_PORT:-8090}/health && echo

hello:
  curl -fsS http://localhost:${EDGE_PORT:-8090}/api/hello && echo

reset:
  docker compose --env-file .env -f compose.yaml -f compose.dev.yaml down -v
