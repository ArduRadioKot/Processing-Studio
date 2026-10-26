/**
 * Упаковка Processing Studio. Toolchain в extraResources — по возможности;
 * если скачать не удалось, установщик всё равно собирается и докачает JDK/SDK при первом запуске.
 *
 *   node scripts/pack.mjs all
 *   node scripts/pack.mjs mac
 *   node scripts/pack.mjs mac-arm64
 *   node scripts/pack.mjs mac-x64
 *   node scripts/pack.mjs win
 *   node scripts/pack.mjs linux
 */
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const builder = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');

function run(cmd, args, { ignoreFail = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve(0);
        return;
      }
      const err = new Error(`${path.basename(cmd)} ${args.join(' ')} → ${signal || code}`);
      if (ignoreFail) {
        console.warn(err.message);
        resolve(code || 1);
        return;
      }
      reject(err);
    });
  });
}

async function prefetch(args) {
  if (process.env.SKIP_TOOLCHAIN === '1') {
    console.log('SKIP_TOOLCHAIN=1 — JDK/SDK в пакет не кладутся');
    return;
  }
  console.log(`\n--- toolchain ${args.join(' ')} ---`);
  const code = await run(process.execPath, ['scripts/prefetch-toolchain.mjs', ...args], { ignoreFail: true });
  if (code !== 0) {
    console.warn('Toolchain не скачался. Пакет соберётся, JDK/SDK встанут при первом запуске.');
  }
}

async function pack(args) {
  console.log(`\n--- electron-builder ${args.join(' ')} ---`);
  await run(builder, [...args, '--publish=never']);
}

function validDeb(file) {
  if (!existsSync(file)) return false;
  const fd = openSync(file, 'r');
  try {
    const header = Buffer.alloc(68);
    if (readSync(fd, header, 0, header.length, 0) !== header.length) return false;
    return header.subarray(0, 8).toString() === '!<arch>\n'
      && header.subarray(8, 24).toString().trim().replace(/\/$/, '') === 'debian-binary';
  } finally {
    closeSync(fd);
  }
}

async function packLinux() {
  await prefetch(['--os', 'linux', '--arch', 'x64']);
  await pack(['--linux', '--x64']);
  const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const file = path.join(root, 'dist', `processing-studio_${version}_amd64.deb`);
  if (!validDeb(file)) {
    console.warn('electron-builder left an invalid .deb; rebuilding the Debian archive from linux-unpacked');
    await run(process.platform === 'win32' ? 'python' : 'python3', ['scripts/repair-deb.py']);
    if (!validDeb(file)) throw new Error('Debian package validation failed');
  }
}

function macArches(target) {
  if (target === 'mac-x64' || target === 'mac-amd64') return ['x64'];
  if (target === 'mac-arm64') return ['arm64'];
  return ['arm64', 'x64'];
}

async function packMac(arches) {
  for (const arch of arches) {
    await prefetch(['--os', 'mac', '--arch', arch]);
    await pack(['--mac', `--${arch}`]);
  }
}

async function main() {
  const target = (process.argv[2] || 'all').replace(/^--/, '');
  if (target === 'mac' || target === 'mac-arm64' || target === 'mac-x64' || target === 'mac-amd64') {
    await packMac(macArches(target));
    return;
  }
  if (target === 'win') {
    await prefetch(['--os', 'win', '--arch', 'x64']);
    await pack(['--win', '--x64']);
    return;
  }
  if (target === 'linux') {
    await packLinux();
    return;
  }
  if (target !== 'all') {
    throw new Error(`Неизвестная цель: ${target}. Нужны mac | mac-arm64 | mac-x64 | win | linux | all`);
  }

  // По очереди: иначе --arm64/--x64 от одной ОС протекает на другие.
  await packMac(['arm64', 'x64']);

  await prefetch(['--os', 'win', '--arch', 'x64']);
  await pack(['--win', '--x64']);

  await packLinux();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
