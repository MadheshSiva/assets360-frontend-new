// Builds the shell and its federated remotes and assembles them into one static site,
// so the whole app can be deployed as a single Cloudflare Worker (see wrangler.jsonc):
//
//   dist/site/                          <- shell (frontend)
//   dist/site/mf/<remote>/              <- each remote, served next to the shell
//   dist/site/federation.manifest.json  <- points the shell at /mf/<remote>/remoteEntry.json
//
// Usage: npm run build:site
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// Remotes the shell loads via loadRemoteModule (see src/app/app.routes.ts).
// Key = remote name used by the shell, value = Angular project name.
const REMOTES = {
  dashboard: 'dashboard',
  locating: 'locating',
};

const root = process.cwd();
const dist = join(root, 'dist');
const site = join(dist, 'site');
const ngCli = createRequire(import.meta.url).resolve('@angular/cli/bin/ng.js');

function ngBuild(project) {
  console.log(`\n> ng build ${project}`);
  const result = spawnSync(process.execPath, [ngCli, 'build', project], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nBuild failed for "${project}"`);
    process.exit(result.status ?? 1);
  }
}

function browserDir(project) {
  const dir = join(dist, project, 'browser');
  if (!existsSync(dir)) {
    console.error(`Expected build output at ${dir}`);
    process.exit(1);
  }
  return dir;
}

ngBuild('frontend');
for (const project of Object.values(REMOTES)) ngBuild(project);

rmSync(site, { recursive: true, force: true });
cpSync(browserDir('frontend'), site, { recursive: true });

const manifest = {};
for (const [name, project] of Object.entries(REMOTES)) {
  cpSync(browserDir(project), join(site, 'mf', project), { recursive: true });
  manifest[name] = `/mf/${project}/remoteEntry.json`;
}
writeFileSync(join(site, 'federation.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`\nSite assembled in ${site}`);
console.log('Remotes:', manifest);
