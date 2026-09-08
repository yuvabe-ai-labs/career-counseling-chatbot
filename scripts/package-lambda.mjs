#!/usr/bin/env node
// Packages apps/api/dist-lambda (built by `pnpm build:lambda`) into a self-contained
// function.zip for AWS Lambda: no pnpm/workspace symlinks, no dev dependencies, just the
// handful of plain npm packages the build keeps external (tsup already bundles every
// @yuvanext/* workspace package into dist-lambda/lambda.js itself).
//
// Exact dependency versions are read from apps/api's own already-installed node_modules
// (populated by `pnpm install --frozen-lockfile` earlier in the same CI job), so the deployed
// bundle always matches what typecheck/lint/test just ran against.
//
// Usage: node scripts/package-lambda.mjs
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Modern packages (e.g. helmet) restrict `exports` and refuse a direct require of
// "<name>/package.json", so resolve the package's main entry file instead and walk up
// directories until we find the package.json that actually declares this package name
// (handles scoped packages, whose directory name alone isn't the full "@scope/name").
const resolvePackageVersion = (require, name) => {
  let dir = dirname(require.resolve(name));
  while (true) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      const pkg = JSON.parse(readFileSync(candidate, "utf8"));
      if (pkg.name === name) return pkg.version;
    }
    const parent = dirname(dir);
    if (parent === dir || dir.endsWith(sep + "node_modules")) {
      throw new Error(`Could not find package.json for "${name}" above ${dirname(require.resolve(name))}`);
    }
    dir = parent;
  }
};

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const apiDir = join(repoRoot, "apps/api");
const distLambdaDir = join(apiDir, "dist-lambda");
const deployDir = join(repoRoot, ".deploy");
const zipPath = join(repoRoot, "function.zip");

if (!existsSync(distLambdaDir)) {
  throw new Error(`${distLambdaDir} not found — run "pnpm build:lambda" first.`);
}

// The authoritative list of runtime deps is whatever the "build:lambda" tsup command marks
// --external (parsed straight from its script string, not re-declared here) — those are
// exactly the packages tsup does NOT bundle into dist-lambda/lambda.js, so they're exactly
// what must exist as real node_modules alongside it. This includes transitive deps like
// nodemailer (pulled in by @yuvanext/assessment) that never appear in apps/api/package.json
// directly but still need to be external: esbuild bundling breaks packages that do dynamic,
// non-string-literal require() calls internally (nodemailer, pino) — the bundled code throws
// "Dynamic require of ... is not supported" once that code path actually runs.
const rootPackageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const buildLambdaScript = rootPackageJson.scripts?.["build:lambda"];
if (!buildLambdaScript) {
  throw new Error('package.json is missing a "build:lambda" script.');
}
const runtimeDepNames = [...buildLambdaScript.matchAll(/--external\s+(\S+)/g)].map((m) => m[1]);
if (runtimeDepNames.length === 0) {
  throw new Error('Found no "--external <pkg>" flags in the "build:lambda" script.');
}

// Resolve each dep's *exact installed* version from the workspace's own node_modules rather
// than re-declaring a range here, so this never drifts from what the CI job already tested.
// pnpm only links a package into node_modules for the workspace packages that actually declare
// it (no hoisting), and an external can be a *transitive* dep declared by some other workspace
// package (e.g. nodemailer, pulled in by @yuvanext/assessment, not by apps/api itself) — so try
// apps/api first, then fall back to scanning every other workspace package for one that resolves it.
const candidatePackageDirs = [
  apiDir,
  ...["apps", "packages"].flatMap((group) => {
    const groupDir = join(repoRoot, group);
    if (!existsSync(groupDir)) return [];
    return readdirSync(groupDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(groupDir, entry.name));
  }),
];

const resolveFromWorkspace = (name) => {
  for (const dir of candidatePackageDirs) {
    const pkgJsonPath = join(dir, "package.json");
    if (!existsSync(pkgJsonPath)) continue;
    try {
      return resolvePackageVersion(createRequire(pkgJsonPath), name);
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error(
    `Could not resolve "${name}" from any workspace package's node_modules. ` +
      `Is it installed (pnpm install) and declared as a dependency somewhere in the workspace?`,
  );
};

const pinnedDependencies = Object.fromEntries(
  runtimeDepNames.map((name) => [name, resolveFromWorkspace(name)]),
);

rmSync(deployDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(deployDir, { recursive: true });

cpSync(distLambdaDir, deployDir, { recursive: true });
writeFileSync(
  join(deployDir, "package.json"),
  JSON.stringify(
    {
      name: "yuvanext-api-lambda",
      private: true,
      type: "module",
      dependencies: pinnedDependencies,
    },
    null,
    2,
  ) + "\n",
);

console.log(`Installing ${runtimeDepNames.length} runtime dependencies into ${deployDir} ...`);
// npm ships as npm.cmd on Windows, which Node can only spawn through a shell (args are static
// and trusted here, not user input, so shell:true is safe).
execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], {
  cwd: deployDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

console.log(`Zipping ${deployDir} -> ${zipPath} ...`);
if (process.platform === "win32") {
  // Local Windows dev convenience; the CI runner (ubuntu-latest) takes the posix `zip` branch
  // below instead, which is the one that actually produces the artifact deploy.yml uploads.
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${deployDir}\\*' -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: "inherit" },
  );
} else {
  execFileSync("zip", ["-r", zipPath, "."], { cwd: deployDir, stdio: "inherit" });
}
console.log(`Wrote ${zipPath}`);
