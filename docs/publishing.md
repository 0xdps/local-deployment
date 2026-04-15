# Publishing Guide

## Before Publishing

- Ensure package name and scope are correct in `package.json`.
- Run `npm install`.
- Run `npm run build`.
- Run `node dist/cli.js help`.
- Run `node dist/cli.js generate .`.
- Run `cp .env.example .env && node dist/cli.js smoke .`.
- Optionally test with a temporary directory using `node dist/cli.js init ./tmp-test`.

## Publish

```bash
npm publish --access public
```

## Post Publish Smoke Test

```bash
mkdir /tmp/stacklane-check
cd /tmp/stacklane-check
pnpm dlx letstack init .
cp .env.example .env
just doctor
pnpm dlx letstack smoke .
```
