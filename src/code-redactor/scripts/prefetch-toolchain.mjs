/**
 * Скачивает JDK, Gradle, Node и Android SDK 34 в vendor/toolchain/<os>-<arch>/
 * перед electron-builder. Установщик приложения кладёт эти архивы в extraResources.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { toolchainPackages, builderOs, nodePlatform } = require('../lib/toolchain-pack.js');

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'ProcessingStudio/4.2 (toolchain-prefetch)';

function parseArgs(argv) {
  const targets = [];
  let osKey = null;
  let arch = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--os') osKey = argv[++i];
    else if (arg === '--arch') arch = argv[++i];
    else if (arg === '--platform') osKey = argv[++i];
  }
  if (osKey || arch) {
    const plat = nodePlatform(osKey || builderOs());
    targets.push({ platform: plat, arch: arch || process.arch });
  } else {
    targets.push({ platform: process.platform, arch: process.arch });
  }
  return targets;
}

async function download(url, dest) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, Accept: '*/*' },
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  if (!res.body) throw new Error(`Пустой ответ ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  const size = fs.statSync(tmp).size;
  if (size < 64) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Пустой файл ${url}`);
  }
  fs.renameSync(tmp, dest);
  return size;
}

async function fetchPackage(pkg, destDir) {
  const dest = path.join(destDir, pkg.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1024 * 1024) {
    console.log(`cached ${pkg.file}`);
    return dest;
  }
  let lastErr = null;
  for (const url of pkg.urls || []) {
    try {
      console.log(`downloading ${pkg.id} …`);
      const size = await download(url, dest);
      console.log(`OK ${pkg.file} (${Math.round(size / 1048576)} МБ)`);
      return dest;
    } catch (err) {
      lastErr = err;
      console.warn(`${pkg.id}: ${err.message}`);
    }
  }
  throw lastErr || new Error(`Не удалось скачать ${pkg.id}`);
}

async function prefetchTarget({ platform, arch }) {
  const osKey = builderOs(platform);
  const destDir = path.join(root, 'vendor', 'toolchain', `${osKey}-${arch}`);
  fs.mkdirSync(destDir, { recursive: true });
  console.log(`\nToolchain ${osKey}-${arch} → ${destDir}`);
  const files = {};
  for (const pkg of toolchainPackages({ platform, arch })) {
    await fetchPackage(pkg, destDir);
    files[pkg.id] = pkg.file;
  }
  const manifest = {
    platform,
    arch,
    os: osKey,
    created: new Date().toISOString(),
    files,
  };
  fs.writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`manifest ${osKey}-${arch}`);
}

async function main() {
  const extra = [];
  if (process.argv.includes('--all')) {
    extra.push(
      { platform: 'darwin', arch: 'arm64' },
      { platform: 'darwin', arch: 'x64' },
      { platform: 'win32', arch: 'x64' },
      { platform: 'linux', arch: 'x64' },
      { platform: 'linux', arch: 'arm64' },
    );
  }
  const targets = extra.length ? extra : parseArgs(process.argv.slice(2));
  for (const target of targets) await prefetchTarget(target);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
