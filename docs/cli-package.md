# Stacklane CLI Package

## Chosen Name

The recommended product name is **Letstack**.

Why this name works:
- It is broader than Docker-only branding.
- It fits local service stacks and routing flows.
- It gives a clean CLI command: `letstack`.
- It can grow from starter template into a real deployment toolkit.

## Package Goal

Publish this repository as an npm CLI so other projects can install or run it with:

```bash
pnpm dlx letstack init
```

## Initial Commands

- `letstack init [target]`
- `letstack generate [target]`
- `letstack doctor [target]`
- `letstack validate [target]`
- `letstack smoke [target] [--keep-running]`

## Manifest

Stacklane now uses `stacklane.yaml` as the source of truth for generated files.

The current generator supports:

- `project.name`
- `project.edgePort`
- `services.backend|frontend|admin.*`
- `routing.apiPrefix`
- `routing.healthPath`

Typical flow in a target repo:

```bash
pnpm dlx letstack init
# edit stacklane.yaml
letstack generate
cp .env.example .env
letstack smoke
```

## Publish Flow

```bash
npm install
npm run build
npm publish --access public
```

## Future Commands

- `stacklane add service`
- `stacklane adopt`
