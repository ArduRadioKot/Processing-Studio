/**
 * Prefetch Electron zips with Node DNS (macOS system resolver), then copy them
 * into the cache root that electron-builder's Go downloader reads.
 * Go cannot resolve GitHub here because /etc/resolv.conf has no nameserver.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { downloadArtifact } = require('@electron/get');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = require(path.join(root, 'node_modules/electron/package.json')).version;
const cacheRoot = path.join(os.homedir(), 'Library/Caches/electron');

const artifacts = [
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'darwin', arch: 'x64' },
  { platform: 'linux', arch: 'arm64' },
  { platform: 'linux', arch: 'x64' },
  { platform: 'win32', arch: 'arm64' },
  { platform: 'win32', arch: 'x64' },
];

async function main() {
  fs.mkdirSync(cacheRoot, { recursive: true });
  console.log(`Prefetching Electron ${version} into ${cacheRoot}`);

  for (const artifact of artifacts) {
    const zipName = `electron-v${version}-${artifact.platform}-${artifact.arch}.zip`;
    const dest = path.join(cacheRoot, zipName);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
      console.log(`cached ${zipName}`);
      continue;
    }
    console.log(`downloading ${zipName} ...`);
    const downloaded = await downloadArtifact({
      version,
      artifactName: 'electron',
      platform: artifact.platform,
      arch: artifact.arch,
    });
    fs.copyFileSync(downloaded, dest);
    console.log(`OK ${zipName}`);
  }

  const sumsName = `SHASUMS256.txt-${version}`;
  const sumsDest = path.join(cacheRoot, sumsName);
  if (!fs.existsSync(sumsDest)) {
    const res = await fetch(
      `https://github.com/electron/electron/releases/download/v${version}/SHASUMS256.txt`,
    );
    if (!res.ok) {
      throw new Error(`SHASUMS256.txt HTTP ${res.status}`);
    }
    fs.writeFileSync(sumsDest, Buffer.from(await res.arrayBuffer()));
    console.log(`OK ${sumsName}`);
  } else {
    console.log(`cached ${sumsName}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
