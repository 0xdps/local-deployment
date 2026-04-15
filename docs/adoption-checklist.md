# Adoption Checklist

Use this checklist when applying this setup to another project.

## 1. Baseline Setup

- Copy `compose.yaml`, `compose.dev.yaml`, `.env.example`, and `justfile`.
- Rename services only if absolutely necessary.
- Ensure backend exposes `/health`.

## 2. Service Integration

- Update `edge` routing rules for project paths.
- Verify frontend and admin internal service ports.
- Confirm `depends_on` health conditions are correct.

## 3. Local UX

- Validate `just doctor` works on a fresh machine.
- Validate `just up` starts all services.
- Validate `/`, `/admin`, `/health`, and key API routes.

## 4. Stability

- Run `docker compose config` with dev override.
- Check restart behavior and logs.
- Keep runbook notes in `docs/project-context.md`.
