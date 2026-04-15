#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, "..");
const scaffoldRoot = resolve(packageRoot, "scaffold", "minimal-stack");

type ServiceManifest = {
  enabled?: boolean;
  buildContext: string;
  dockerfile: string;
  internalPort: number;
  devTarget?: string;
  prodTarget?: string;
  healthPath?: string;
  routePrefix?: string;
};

type StacklaneManifest = {
  project: {
    name: string;
    edgePort: number;
  };
  services: {
    backend: ServiceManifest;
    frontend: ServiceManifest;
    admin: ServiceManifest;
  };
  routing: {
    apiPrefix: string;
    healthPath: string;
  };
};

type PartialStacklaneManifest = {
  project?: Partial<StacklaneManifest["project"]>;
  services?: {
    backend?: Partial<ServiceManifest>;
    frontend?: Partial<ServiceManifest>;
    admin?: Partial<ServiceManifest>;
  };
  routing?: Partial<StacklaneManifest["routing"]>;
};

const defaultManifest: StacklaneManifest = {
  project: {
    name: "stacklane-starter",
    edgePort: 8090,
  },
  services: {
    backend: {
      enabled: true,
      buildContext: "./services/backend",
      dockerfile: "Dockerfile",
      internalPort: 3000,
      devTarget: "dev",
      prodTarget: "prod",
      healthPath: "/health",
    },
    frontend: {
      enabled: true,
      buildContext: "./services/frontend",
      dockerfile: "Dockerfile",
      internalPort: 80,
    },
    admin: {
      enabled: true,
      buildContext: "./services/admin",
      dockerfile: "Dockerfile",
      internalPort: 80,
      routePrefix: "/admin",
    },
  },
  routing: {
    apiPrefix: "/api",
    healthPath: "/health",
  },
};

function printHelp(): void {
  console.log(`Letstack CLI\n\nUsage:\n  letstack init [target] [--force]\n  letstack generate [target]\n  letstack doctor [target]\n  letstack validate [target]\n  letstack up [target] [--build]\n  letstack down [target]\n  letstack smoke [target] [--keep-running]\n  letstack help\n\nCommands:\n  init      Copy the starter scaffold into a target directory and write files from stacklane.yaml\n  generate  Generate compose/env/edge files from stacklane.yaml\n  doctor    Check required tools and files; auto-install just and portless if missing\n  validate  Run docker compose config for a target repo\n  up        Bring up the stack and register a portless alias for a named local URL\n  down      Tear down the stack and remove the portless alias\n  smoke     Boot the stack, probe public routes, and tear it down by default\n`);
}

function parseDotEnv(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    env[key] = value;
  }
  return env;
}

function getEdgePort(targetDir: string, manifest: StacklaneManifest): number {
  const env = parseDotEnv(join(targetDir, ".env"));
  const configuredPort = Number(env.EDGE_PORT || manifest.project.edgePort);
  if (!Number.isFinite(configuredPort) || configuredPort <= 0) {
    return manifest.project.edgePort;
  }
  return configuredPort;
}

function composeCommand(targetDir: string, action: string): string {
  const envPath = join(targetDir, ".env");
  return `docker compose --env-file ${envPath} -f compose.yaml -f compose.dev.yaml ${action}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Wait for the service to become reachable.
    }

    await sleep(2000);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function assertHttpOk(url: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Expected ${url} to return 2xx, got ${response.status}`);
  }
}

function renderEnvExample(manifest: StacklaneManifest): string {
  const backendPort = manifest.services.backend.internalPort;
  return `# Public host port for the edge proxy\nEDGE_PORT=${manifest.project.edgePort}\n\n# Backend port inside the backend container\nBACKEND_PORT=${backendPort}\n\n# Example app metadata\nAPP_NAME=${manifest.project.name}\n`;
}

function renderCompose(manifest: StacklaneManifest): string {
  const lines: string[] = [];
  lines.push(`name: ${manifest.project.name}`);
  lines.push("");
  lines.push("services:");

  const backend = manifest.services.backend;
  if (backend.enabled !== false) {
    lines.push("  backend:");
    lines.push("    build:");
    lines.push(`      context: ${backend.buildContext}`);
    lines.push(`      dockerfile: ${backend.dockerfile}`);
    if (backend.prodTarget) {
      lines.push(`      target: ${backend.prodTarget}`);
    }
    lines.push("    expose:");
    lines.push(`      - \"${backend.internalPort}\"`);
    lines.push("    env_file:");
    lines.push("      - .env");
    lines.push("    environment:");
    lines.push("      - NODE_ENV=production");
    lines.push(`      - PORT=\${BACKEND_PORT:-${backend.internalPort}}`);
    lines.push("    restart: unless-stopped");
    lines.push("    healthcheck:");
    lines.push(`      test: [\"CMD\", \"node\", \"-e\", \"fetch('http://localhost:${backend.internalPort}${manifest.routing.healthPath}').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"]`);
    lines.push("      interval: 10s");
    lines.push("      timeout: 5s");
    lines.push("      retries: 5");
    lines.push("      start_period: 10s");
    lines.push("");
  }

  const frontend = manifest.services.frontend;
  if (frontend.enabled !== false) {
    lines.push("  frontend:");
    lines.push("    build:");
    lines.push(`      context: ${frontend.buildContext}`);
    lines.push(`      dockerfile: ${frontend.dockerfile}`);
    if (frontend.prodTarget) {
      lines.push(`      target: ${frontend.prodTarget}`);
    }
    lines.push("    expose:");
    lines.push(`      - \"${frontend.internalPort}\"`);
    lines.push("    restart: unless-stopped");
    lines.push("");
  }

  const admin = manifest.services.admin;
  if (admin.enabled !== false) {
    lines.push("  admin:");
    lines.push("    build:");
    lines.push(`      context: ${admin.buildContext}`);
    lines.push(`      dockerfile: ${admin.dockerfile}`);
    if (admin.prodTarget) {
      lines.push(`      target: ${admin.prodTarget}`);
    }
    lines.push("    expose:");
    lines.push(`      - \"${admin.internalPort}\"`);
    lines.push("    restart: unless-stopped");
    lines.push("");
  }

  lines.push("  edge:");
  lines.push("    image: caddy:2-alpine");
  lines.push("    ports:");
  lines.push(`      - \"127.0.0.1:\${EDGE_PORT:-${manifest.project.edgePort}}:80\"`);
  lines.push("    volumes:");
  lines.push("      - ./infra/Caddyfile:/etc/caddy/Caddyfile:ro");
  lines.push("    depends_on:");
  if (backend.enabled !== false) {
    lines.push("      backend:");
    lines.push("        condition: service_healthy");
  }
  if (frontend.enabled !== false) {
    lines.push("      frontend:");
    lines.push("        condition: service_started");
  }
  if (admin.enabled !== false) {
    lines.push("      admin:");
    lines.push("        condition: service_started");
  }
  lines.push("    restart: unless-stopped");
  lines.push("");

  return lines.join("\n");
}

function renderComposeDev(manifest: StacklaneManifest): string {
  const lines: string[] = [];
  lines.push("services:");
  const backend = manifest.services.backend;
  if (backend.enabled !== false) {
    lines.push("  backend:");
    lines.push("    build:");
    lines.push(`      context: ${backend.buildContext}`);
    lines.push(`      dockerfile: ${backend.dockerfile}`);
    if (backend.devTarget) {
      lines.push(`      target: ${backend.devTarget}`);
    }
    lines.push("    environment:");
    lines.push("      - NODE_ENV=development");
    lines.push("    volumes:");
    lines.push("      - ./services/backend/src:/app/src");
    lines.push("      - ./services/backend/package.json:/app/package.json:ro");
    lines.push("      - backend-node-modules:/app/node_modules");
    lines.push("");
  }
  const frontend = manifest.services.frontend;
  if (frontend.enabled !== false) {
    lines.push("  frontend:");
    lines.push("    volumes:");
    lines.push("      - ./services/frontend/public:/usr/share/nginx/html:ro");
    lines.push("");
  }
  const admin = manifest.services.admin;
  if (admin.enabled !== false) {
    lines.push("  admin:");
    lines.push("    volumes:");
    lines.push("      - ./services/admin/public:/usr/share/nginx/html:ro");
    lines.push("");
  }
  if (backend.enabled !== false) {
    lines.push("volumes:");
    lines.push("  backend-node-modules:");
  }
  return lines.join("\n");
}

function renderCaddyfile(manifest: StacklaneManifest): string {
  const backend = manifest.services.backend;
  const frontend = manifest.services.frontend;
  const admin = manifest.services.admin;
  const adminPrefix = admin.routePrefix || "/admin";
  const lines: string[] = [];
  lines.push(":80 {");
  if (backend.enabled !== false) {
    lines.push(`  @health path ${manifest.routing.healthPath}`);
    lines.push("  handle @health {");
    lines.push(`    reverse_proxy backend:${backend.internalPort}`);
    lines.push("  }");
    lines.push("");
    lines.push(`  @api path ${manifest.routing.apiPrefix}/*`);
    lines.push("  handle @api {");
    lines.push(`    reverse_proxy backend:${backend.internalPort}`);
    lines.push("  }");
    lines.push("");
  }
  if (admin.enabled !== false) {
    lines.push(`  handle ${adminPrefix}* {`);
    lines.push(`    uri strip_prefix ${adminPrefix}`);
    lines.push(`    reverse_proxy admin:${admin.internalPort}`);
    lines.push("  }");
    lines.push("");
  }
  if (frontend.enabled !== false) {
    lines.push("  handle {");
    lines.push(`    reverse_proxy frontend:${frontend.internalPort}`);
    lines.push("  }");
    lines.push("");
  }
  lines.push("  log {");
  lines.push("    output stdout");
  lines.push("    format console");
  lines.push("  }");
  lines.push("}");
  return lines.join("\n");
}

function readManifest(targetDir: string): StacklaneManifest {
  const manifestPath = join(targetDir, "stacklane.yaml");
  if (!existsSync(manifestPath)) {
    return structuredClone(defaultManifest);
  }

  const parsed = YAML.parse(readFileSync(manifestPath, "utf8")) as PartialStacklaneManifest | null;
  const merged = {
    project: {
      ...defaultManifest.project,
      ...(parsed?.project || {}),
    },
    services: {
      backend: {
        ...defaultManifest.services.backend,
        ...(parsed?.services?.backend || {}),
      },
      frontend: {
        ...defaultManifest.services.frontend,
        ...(parsed?.services?.frontend || {}),
      },
      admin: {
        ...defaultManifest.services.admin,
        ...(parsed?.services?.admin || {}),
      },
    },
    routing: {
      ...defaultManifest.routing,
      ...(parsed?.routing || {}),
    },
  } satisfies StacklaneManifest;

  return merged;
}

function ensureManifest(targetDir: string, force: boolean): void {
  const manifestPath = join(targetDir, "stacklane.yaml");
  if (existsSync(manifestPath) && !force) {
    return;
  }
  writeFileSync(manifestPath, YAML.stringify(defaultManifest));
}

function writeGeneratedFiles(targetDir: string, manifest: StacklaneManifest): string[] {
  const files = [
    { path: join(targetDir, ".env.example"), content: renderEnvExample(manifest) },
    { path: join(targetDir, "compose.yaml"), content: `${renderCompose(manifest)}\n` },
    { path: join(targetDir, "compose.dev.yaml"), content: `${renderComposeDev(manifest)}\n` },
    { path: join(targetDir, "infra", "Caddyfile"), content: `${renderCaddyfile(manifest)}\n` },
  ];

  for (const file of files) {
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content);
  }

  return files.map((file) => relative(targetDir, file.path));
}

function copyRecursive(sourceDir: string, targetDir: string, force: boolean): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];

  const walk = (source: string, target: string) => {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source)) {
      const from = join(source, entry);
      const to = join(target, entry);
      const stats = statSync(from);
      if (stats.isDirectory()) {
        walk(from, to);
        continue;
      }
      if (existsSync(to) && !force) {
        skipped.push(relative(targetDir, to) || entry);
        continue;
      }
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      created.push(relative(targetDir, to) || entry);
    }
  };

  walk(sourceDir, targetDir);
  return { created, skipped };
}

function run(command: string, cwd: string): void {
  execSync(command, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
}

function assertScaffold(): void {
  if (!existsSync(scaffoldRoot)) {
    console.error(`Scaffold not found at ${scaffoldRoot}`);
    process.exit(1);
  }
}

function commandInit(targetArg: string | undefined, force: boolean): void {
  assertScaffold();
  const targetDir = resolve(targetArg || ".");
  mkdirSync(targetDir, { recursive: true });
  ensureManifest(targetDir, force);
  const result = copyRecursive(scaffoldRoot, targetDir, force);
  const manifest = readManifest(targetDir);
  const generated = writeGeneratedFiles(targetDir, manifest);
  console.log(`Initialized Letstack starter in ${targetDir}`);
  if (result.created.length) {
    console.log("\nCreated:");
    for (const file of result.created) console.log(`  + ${file}`);
  }
  if (result.skipped.length) {
    console.log("\nSkipped existing files:");
    for (const file of result.skipped) console.log(`  - ${file}`);
  }
  console.log("\nGenerated from stacklane.yaml:");
  for (const file of generated) console.log(`  * ${file}`);
  console.log("\nNext steps:");
  console.log("  cp .env.example .env");
  console.log("  just doctor");
  console.log("  just up");
}

function commandGenerate(targetArg: string | undefined): void {
  const targetDir = resolve(targetArg || ".");
  const manifest = readManifest(targetDir);
  const generated = writeGeneratedFiles(targetDir, manifest);
  console.log(`Generated Letstack files in ${targetDir}`);
  for (const file of generated) console.log(`  * ${file}`);
}

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore", shell: "/bin/sh" });
    return true;
  } catch {
    return false;
  }
}

function installJust(): boolean {
  console.log("  Installing just...");
  if (isCommandAvailable("brew")) {
    try {
      execSync("brew install just", { stdio: "inherit" });
      return isCommandAvailable("just");
    } catch { /* continue */ }
  }
  if (process.platform === "linux" && isCommandAvailable("apt-get")) {
    try {
      execSync("sudo apt-get install -y just", { stdio: "inherit" });
      return isCommandAvailable("just");
    } catch { /* continue */ }
  }
  if (isCommandAvailable("cargo")) {
    try {
      execSync("cargo install just", { stdio: "inherit" });
      return isCommandAvailable("just");
    } catch { /* continue */ }
  }
  try {
    execSync(
      "curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | sudo bash -s -- --to /usr/local/bin",
      { stdio: "inherit", shell: "/bin/sh" },
    );
    return isCommandAvailable("just");
  } catch {
    return false;
  }
}

function installPortless(): boolean {
  console.log("  Installing portless...");
  try {
    execSync("npm install -g portless", { stdio: "inherit" });
    return isCommandAvailable("portless");
  } catch {
    return false;
  }
}

function commandDoctor(targetArg: string | undefined): void {
  const targetDir = resolve(targetArg || ".");
  const requiredFiles = ["compose.yaml", "compose.dev.yaml", "justfile", ".env.example", "stacklane.yaml"];
  const missing = requiredFiles.filter((file) => !existsSync(join(targetDir, file)));

  // docker must be pre-installed — we cannot install it automatically
  const missingDocker = !isCommandAvailable("docker");

  // just and portless are auto-installable
  const installable: Array<{ name: string; install: () => boolean }> = [
    { name: "just", install: installJust },
    { name: "portless", install: installPortless },
  ];

  const failedInstalls: string[] = [];
  for (const tool of installable) {
    if (!isCommandAvailable(tool.name)) {
      console.log(`${tool.name} not found — attempting install...`);
      const ok = tool.install();
      if (!ok) {
        failedInstalls.push(tool.name);
      } else {
        console.log(`  ${tool.name} installed`);
      }
    }
  }

  if (missingDocker || failedInstalls.length || missing.length) {
    if (missingDocker) {
      console.error("Missing: docker (install from https://docs.docker.com/get-docker/)");
    }
    if (failedInstalls.length) {
      console.error(`Failed to install: ${failedInstalls.join(", ")}`);
    }
    if (missing.length) {
      console.error(`Missing files in ${targetDir}: ${missing.join(", ")}`);
    }
    process.exit(1);
  }

  console.log(`Letstack doctor passed for ${targetDir}`);
}

function commandValidate(targetArg: string | undefined): void {
  const targetDir = resolve(targetArg || ".");
  const envPath = join(targetDir, ".env");
  if (!existsSync(envPath)) {
    console.error(`Missing ${envPath}. Copy .env.example first.`);
    process.exit(1);
  }

  run("docker compose --env-file .env -f compose.yaml -f compose.dev.yaml config >/dev/null", targetDir);
  console.log(`Letstack validate passed for ${targetDir}`);
}

function commandUp(targetArg: string | undefined, build: boolean): void {
  const targetDir = resolve(targetArg || ".");
  const manifest = readManifest(targetDir);
  const buildFlag = build ? " --build" : "";
  run(composeCommand(targetDir, `up${buildFlag} -d`), targetDir);

  const edgePort = getEdgePort(targetDir, manifest);
  const alias = manifest.project.name;

  if (isCommandAvailable("portless")) {
    try {
      execSync(`portless alias ${alias} ${edgePort} --force`, { stdio: "inherit" });
      console.log(`\nStack available at: https://${alias}.localhost`);
    } catch {
      console.log(`\nStack running at: http://127.0.0.1:${edgePort}`);
    }
  } else {
    console.log(`\nStack running at: http://127.0.0.1:${edgePort}`);
    console.log("  Run letstack doctor to install portless for named URLs.");
  }
}

function commandDown(targetArg: string | undefined): void {
  const targetDir = resolve(targetArg || ".");
  const manifest = readManifest(targetDir);
  const alias = manifest.project.name;

  run(composeCommand(targetDir, "down"), targetDir);

  if (isCommandAvailable("portless")) {
    try {
      execSync(`portless alias --remove ${alias}`, { stdio: "ignore" });
    } catch {
      // Alias may not exist — ignore.
    }
  }
}

async function commandSmoke(targetArg: string | undefined, keepRunning: boolean): Promise<void> {
  const targetDir = resolve(targetArg || ".");
  const envPath = join(targetDir, ".env");
  if (!existsSync(envPath)) {
    console.error(`Missing ${envPath}. Copy .env.example first.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  const edgePort = getEdgePort(targetDir, manifest);
  const baseUrl = `http://127.0.0.1:${edgePort}`;
  const probes: Array<{ label: string; url: string }> = [];

  if (manifest.services.backend.enabled !== false) {
    probes.push({ label: "health", url: `${baseUrl}${manifest.routing.healthPath}` });
  }
  if (manifest.services.frontend.enabled !== false) {
    probes.push({ label: "frontend", url: `${baseUrl}/` });
  }
  if (manifest.services.admin.enabled !== false) {
    probes.push({ label: "admin", url: `${baseUrl}${manifest.services.admin.routePrefix || "/admin"}` });
  }

  try {
    run(composeCommand(targetDir, "up --build -d"), targetDir);

    if (manifest.services.backend.enabled !== false) {
      await waitForHttp(`${baseUrl}${manifest.routing.healthPath}`, 60000);
    }

    for (const probe of probes) {
      await assertHttpOk(probe.url);
      console.log(`smoke ok: ${probe.label} -> ${probe.url}`);
    }

    console.log(`Letstack smoke passed for ${targetDir}`);
  } catch (error) {
    try {
      run(composeCommand(targetDir, "ps"), targetDir);
    } catch {
      // Ignore secondary diagnostics failures.
    }
    throw error;
  } finally {
    if (!keepRunning) {
      try {
        run(composeCommand(targetDir, "down"), targetDir);
      } catch {
        // Ignore teardown errors after a smoke failure.
      }
    }
  }
}

const args = process.argv.slice(2);
const command = args[0] || "help";
const force = args.includes("--force");
const keepRunning = args.includes("--keep-running");
const build = args.includes("--build");
const positional = args.filter((arg) => !arg.startsWith("--"));
const targetArg = positional[1];

async function main(): Promise<void> {
  switch (command) {
    case "init":
      commandInit(targetArg, force);
      break;
    case "generate":
      commandGenerate(targetArg);
      break;
    case "doctor":
      commandDoctor(targetArg);
      break;
    case "validate":
      commandValidate(targetArg);
      break;
    case "up":
      commandUp(targetArg, build);
      break;
    case "down":
      commandDown(targetArg);
      break;
    case "smoke":
      await commandSmoke(targetArg, keepRunning);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
