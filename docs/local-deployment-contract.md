# Local Deployment Contract

This contract defines what Stacklane generates into target repositories.

## Required Files

- `compose.yaml`: baseline wiring and stable services.
- `compose.dev.yaml`: local dev overrides (bind mounts, dev targets).
- `.env.example`: documented env defaults.
- `justfile`: standard operator commands.

## Standard Command Surface

Every project should implement at least:

- `just doctor`
- `just up`
- `just up-d`
- `just down`
- `just logs`
- `just ps`
- `just reset`

## Service Naming

Use role names for consistency:

- `backend`
- `frontend`
- `admin`
- `edge`
- optional: `worker`, `redis`, `db`

## Networking Rules

- Services talk via Docker DNS (`backend:3000`, etc.).
- External host ports are exposed only by `edge` whenever possible.
- Prefer one base URL for local QA (for example `http://localhost:8090`).

## Healthcheck Rules

- `backend` should expose `/health`.
- `edge` should depend on backend service health.
- Prefer health-based startup ordering, not sleep loops.

## Environment Rules

- Keep `.env.example` complete and minimal.
- Put project-specific secrets only in `.env`.
- Keep env variable names stable and role-scoped.

## Dev Override Rules

- Dev override may switch docker build target to `dev`.
- Use bind mounts only in dev file.
- Keep base file production-like and predictable.
