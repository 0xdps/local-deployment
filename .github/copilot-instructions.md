# Stacklane — Copilot Instructions

## What this repo is

An npm CLI package that scaffolds and validates local multi-service deployment setups.
This repository also contains the reference starter scaffold used by the CLI.

## Core Rules

1. Keep generated `compose.yaml` production-like and stable.
2. Put local-only bind mounts and hot-reload behavior in `compose.dev.yaml`.
3. Expose host ports through `edge` only unless there is a strong reason not to.
4. Maintain role-based service names: `backend`, `frontend`, `admin`, `edge`.
5. Keep `just` commands stable; treat them as the public operator interface.
6. Prefer changing scaffold files under `scaffold/minimal-stack/` when evolving the starter.

## Editing Guidelines

- Prefer small, explicit compose edits.
- Keep healthchecks and dependency ordering intact.
- Update docs when changing contract or command behavior.
- Avoid introducing project-specific logic into the generic scaffold files.
- Keep CLI behavior non-destructive by default unless force is explicitly requested.

## Validation

After significant changes:

- `npm run build`
- `node dist/cli.js help`
- `docker compose --env-file .env -f compose.yaml -f compose.dev.yaml config`
- Optional runtime check: `just up-d` then `just health` and `just hello`
