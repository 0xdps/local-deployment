# Letstack

Letstack is an npm CLI for bootstrapping and validating local multi-service deployment setups.

It ships a minimal starter stack with:

- `backend`: Express API service
- `frontend`: static web app
- `admin`: static admin web app
- `edge`: Caddy reverse proxy that routes everything through one entrypoint

The goal is to standardize how local service stacks are created across repos instead of copying ad hoc `docker-compose` setups by hand.

## CLI Usage

Scaffold into the current repo:

```bash
pnpm dlx letstack init
```

Or scaffold into a target directory:

```bash
pnpm dlx letstack init my-app
```

Then inside the target repo:

```bash
cp .env.example .env
just doctor
just up
```

## Local Development In This Repo

Install and build the package:

```bash
npm install
npm run build
```

Run the CLI locally:

```bash
node dist/cli.js help
node dist/cli.js init ./tmp-stack --force
node dist/cli.js smoke .
```

## Commands

- `stacklane init [target]`
- `stacklane generate [target]`
- `stacklane doctor [target]`
- `stacklane validate [target]`
- `stacklane smoke [target] [--keep-running]`

## Manifest-Driven Usage

Each generated repo includes a `stacklane.yaml` file. Edit that manifest, then regenerate the deployment files:

```bash
stacklane generate
```

To boot the stack and verify the public routes end to end:

```bash
cp .env.example .env
stacklane smoke
```

Current manifest-driven fields support:

- project name
- edge port
- backend/frontend/admin build paths
- Dockerfile names
- internal ports
- admin route prefix
- API and health route prefixes

## Repo Structure

```text
.
├── src/                  CLI source
├── dist/                 Built CLI output
├── scaffold/
│   └── minimal-stack/    Starter files copied by `stacklane init`
├── docs/                 Package and contract docs
├── compose.yaml          Repo's own reference stack
├── compose.dev.yaml
├── justfile
└── package.json
```

## Contract Highlights

- Base `compose.yaml` stays production-like.
- `compose.dev.yaml` contains bind mounts and local overrides.
- Role-based service naming: `backend`, `frontend`, `admin`, `edge`.
- Healthchecks are required for startup sequencing.
- `just` remains the operator interface in generated repos.

See [docs/local-deployment-contract.md](docs/local-deployment-contract.md), [docs/cli-package.md](docs/cli-package.md), and [docs/publishing.md](docs/publishing.md) for details.
