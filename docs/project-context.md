# Project Context

## Purpose

This repo is the source of truth for Stacklane, a CLI that scaffolds local Docker deployments across sibling projects.
It contains both the CLI package and the starter scaffold copied into target repositories.

## Primary Goals

- Standardize local service orchestration patterns.
- Publish a reusable CLI instead of relying on manual copying.
- Keep one simple command surface via `just` in generated repos.
- Provide a test stack that proves routing and service integration.
- Document conventions so future projects remain aligned.

## Service Roles

- `edge`: public entrypoint and routing.
- `backend`: API and shared business logic.
- `frontend`: user-facing app.
- `admin`: internal/admin app.

## Design Principles

- Prefer `compose.yaml` + `compose.dev.yaml` over many ad hoc files.
- Every runtime service should have a health endpoint/check where practical.
- Internal service communication uses Docker DNS names.
- Host should expose only edge by default.
- Keep logs and startup scripts straightforward.
- CLI defaults should be safe and non-destructive.

## Non-Goals

- This repository is not a production platform.
- It does not enforce a specific frontend/backend framework.
- It does not yet generate custom stacks from a manifest; current CLI copies the minimal reference scaffold.
