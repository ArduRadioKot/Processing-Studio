/**
 * Мастер зависимостей: ставит и снимает JDK, Android SDK, Gradle, Node
 * в ~/Documents/ProcessingStudio/toolchain. Системные копии не трогает.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { ipcMain } = require('electron');
const {
  exists, buildEnv, managedPaths, isManaged, WIN, EXE, checkTools, resolveJdkHome, preferredJdkHome,
  which, resolveSdkRoot, spawnProcess,
} = require('./toolchain');
const { installCapacitor, uninstallCapacitor } = require('./capacitor-install');
const { extractZipArchive } = require('./unzip');
const { ensureStudioDirs } = require('./studio');
const {
  GRADLE_VERSION,
  NODE_VERSION,
  BUILD_IDS,
  CMDTOOLS,
  toolchainPackages,
  bundledArchive,
  bundledStatus,
  writeSdkLicenses,
  findDirWith,
} = require('./toolchain-pack');

const CATALOG = [
  { id: 'java', label: 'Java JDK 17', detail: 'Temurin · для Gradle и Android', size: '~180 МБ' },
  { id: 'androidSdk', label: 'Android SDK', detail: 'platform-tools, API 34, build-tools', size: '~800 МБ', needs: ['java'] },
  { id: 'gradle', label: 'Gradle 8.7', detail: 'Сборка APK', size: '~130 МБ', needs: ['java'] },
  { id: 'node', label: 'Node.js 20', detail: 'вместе с npm', size: '~50 МБ' },
  { id: 'npm', label: 'npm', detail: 'идёт в комплекте с Node.js', bundled: 'node' },
  { id: 'capacitor', label: 'Capacitor', detail: 'ставится в открытый проект', project: true, needs: ['node'] },
  { id: 'xcode', label: 'Xcode', detail: 'только macOS · App Store', platform: 'darwin', external: true },
];

let job = null;

function send(event, payload) {
  try { event.sender.send('toolchain-progress', payload); } catch { /* окно закрыто */ }
}

function log(event, message, extra = {}) {
  send(event, { type: 'log', message: String(message || ''), ...extra });
}

function rmrf(dir) {
  if (!dir || !exists(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function chmodBin(dir) {
  if (WIN || !exists(dir)) return;
  try {
    for (const name of fs.readdirSync(dir)) {
      try { fs.chmodSync(path.join(dir, name), 0o755); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

function findJavaHome(root) {
  const candidates = [
    root,
    path.join(root, 'Contents', 'Home'),
  ];
  try {
    for (const name of fs.readdirSync(root)) {
      candidates.push(path.join(root, name));
      candidates.push(path.join(root, name, 'Contents', 'Home'));
    }
  } catch { /* empty */ }
  return candidates.find((dir) => exists(path.join(dir, 'bin', `java${EXE}`))) || root;
}

function flattenExtract(staging, dest, probe) {
  rmrf(dest);
  mkdirp(path.dirname(dest));
  const entries = fs.readdirSync(staging).filter((n) => n !== '__MACOSX');
  const inner = entries.length === 1 ? path.join(staging, entries[0]) : staging;
  const source = probe ? (probe(inner, staging) || inner) : inner;
  fs.renameSync(source, dest);
  if (exists(staging)) rmrf(staging);
}

function system32(name) {
  return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', name);
}

function tarBin() {
  if (!WIN) return 'tar';
  const full = system32('tar.exe');
  return exists(full) ? full : 'tar.exe';
}

function powershellBin() {
  const full = system32(path.join('WindowsPowerShell', 'v1.0', 'powershell.exe'));
  return exists(full) ? full : 'powershell.exe';
}

function spawnLogged(event, cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    if (job?.abort) {
      reject(new Error('Отменено'));
      return;
    }
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (job) job.child = null;
      if (err) reject(err);
      else resolve();
    };
    let child;
    try {
      child = spawnProcess(cmd, args, {
        cwd: opts.cwd,
        env: opts.env || buildEnv(),
        stdio: opts.input != null ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      finish(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    if (job) job.child = child;
    if (opts.input != null && child.stdin) {
      try {
        child.stdin.write(opts.input);
        child.stdin.end();
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
        return;
      }
    }
    const flush = (buf) => {
      const text = buf.toString();
      if (text.trim()) log(event, text.replace(/\r/g, '\n').trimEnd());
    };
    if (child.stdout) child.stdout.on('data', flush);
    if (child.stderr) child.stderr.on('data', flush);
    child.on('error', (err) => {
      const missing = err && err.code === 'ENOENT';
      finish(new Error(missing
        ? `Не найдена команда «${path.basename(cmd)}»`
        : (err.message || String(err))));
    });
    child.on('close', (code) => {
      if (job?.abort) finish(new Error('Отменено'));
      else if (code === 0) finish();
      else finish(new Error(`${path.basename(cmd)} завершился с кодом ${code}`));
    });
  });
}

const UA = 'ProcessingStudio/4.2 (toolchain; +https://github.com)';

function download(event, url, dest, label) {
  return new Promise((resolve, reject) => {
    mkdirp(path.dirname(dest));
    const tmp = `${dest}.part`;
    rmrf(tmp);
    const file = fs.createWriteStream(tmp);
    let settled = false;
    let lastData = Date.now();
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      try { file.destroy(); } catch { /* ignore */ }
      rmrf(tmp);
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(watchdog);
      file.end(() => {
        try {
          if (!exists(tmp) || fs.statSync(tmp).size < 64) {
            rmrf(tmp);
            reject(new Error(`Пустой файл после загрузки ${label}`));
            return;
          }
          fs.renameSync(tmp, dest);
          resolve(dest);
        } catch (err) {
          rmrf(tmp);
          reject(err);
        }
      });
    };
    const watchdog = setInterval(() => {
      if (Date.now() - lastData > 120000) {
        try { job?.req?.abort?.(); } catch { /* ignore */ }
        try { job?.req?.destroy?.(); } catch { /* ignore */ }
        fail(new Error(`Таймаут загрузки ${label}`));
      }
    }, 5000);

    const onChunk = (chunk, total, receivedRef) => {
      lastData = Date.now();
      receivedRef.value += chunk.length;
      const received = receivedRef.value;
      if (total && received - receivedRef.last > Math.max(total / 40, 1024 * 1024)) {
        receivedRef.last = received;
        send(event, {
          type: 'progress',
          tool: job?.tool,
          percent: Math.round((received / total) * 100),
          message: `${label}: ${Math.round(received / 1048576)} / ${Math.round(total / 1048576)} МБ`,
        });
      }
    };

    const viaChromium = () => {
      let net;
      try { ({ net } = require('electron')); } catch { return false; }
      if (!net?.request) return false;
      try {
        log(event, `${label}: ${url}`);
        const request = net.request({ method: 'GET', url, redirect: 'follow' });
        request.setHeader('User-Agent', UA);
        request.setHeader('Accept', '*/*');
        job.req = request;
        const receivedRef = { value: 0, last: 0 };
        request.on('response', (res) => {
          const code = res.statusCode;
          if (code !== 200) {
            fail(new Error(`HTTP ${code} при загрузке ${label}`));
            try { request.abort(); } catch { /* ignore */ }
            return;
          }
          const total = Number(res.headers['content-length']) || 0;
          res.on('data', (chunk) => {
            file.write(chunk);
            onChunk(chunk, total, receivedRef);
          });
          res.on('end', finish);
          res.on('error', fail);
        });
        request.on('error', fail);
        request.on('abort', () => fail(new Error('Отменено')));
        request.end();
        return true;
      } catch {
        return false;
      }
    };

    const viaNode = (target, hops = 0) => {
      if (hops > 8) {
        fail(new Error('Слишком много переадресаций'));
        return;
      }
      const client = target.startsWith('https:') ? https : http;
      const req = client.get(target, {
        timeout: 120000,
        headers: { 'User-Agent': UA, Accept: '*/*' },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          viaNode(new URL(res.headers.location, target).href, hops + 1);
          return;
        }
        if (res.statusCode !== 200) {
          fail(new Error(`HTTP ${res.statusCode} при загрузке ${label}`));
          return;
        }
        const total = Number(res.headers['content-length']) || 0;
        const receivedRef = { value: 0, last: 0 };
        res.on('data', (chunk) => onChunk(chunk, total, receivedRef));
        res.pipe(file);
        file.on('finish', finish);
        res.on('error', fail);
      });
      job.req = req;
      req.on('timeout', () => req.destroy(new Error('Таймаут загрузки')));
      req.on('error', fail);
    };

    if (!viaChromium()) viaNode(url);
  });
}

async function extract(event, archive, staging) {
  log(event, `Распаковка ${path.basename(archive)}…`);
  const isTar = /\.tar\.gz$|\.tgz$|\.tar$/i.test(archive);
  if (isTar) {
    rmrf(staging);
    mkdirp(staging);
    const flags = /\.tar\.gz$|\.tgz$/i.test(archive) ? '-xzf' : '-xf';
    await spawnLogged(event, tarBin(), [flags, archive, '-C', staging]);
    if (!listDirSafe(staging).length) throw new Error(`Пустой архив ${path.basename(archive)}`);
    return;
  }

  try {
    rmrf(staging);
    mkdirp(staging);
    extractZipArchive(archive, staging);
    if (listDirSafe(staging).length) return;
  } catch (err) {
    log(event, `Встроенная распаковка: ${err.message}. Пробую системные средства…`);
  }

  const attempts = [];
  attempts.push(() => spawnLogged(event, tarBin(), ['-xf', archive, '-C', staging]));
  if (WIN) {
    const zipPath = archive.replace(/'/g, "''");
    const destPath = staging.replace(/'/g, "''");
    attempts.push(() => spawnLogged(event, powershellBin(), [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destPath}' -Force`,
    ]));
  } else {
    attempts.push(() => spawnLogged(event, 'unzip', ['-q', '-o', archive, '-d', staging]));
    if (process.platform === 'darwin') {
      attempts.push(() => spawnLogged(event, 'ditto', ['-x', '-k', archive, staging]));
    }
  }

  let lastErr = null;
  for (const run of attempts) {
    rmrf(staging);
    mkdirp(staging);
    try {
      await run();
      if (listDirSafe(staging).length) return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error(`Не удалось распаковать ${path.basename(archive)}`);
}

function listDirSafe(dir) {
  try { return fs.readdirSync(dir).filter((n) => n !== '__MACOSX'); } catch { return []; }
}

function packUrl(id) {
  const pkg = toolchainPackages().find((item) => item.id === id);
  return pkg?.urls?.[0] || null;
}

async function ensureArchive(event, id, cacheName, label) {
  const bundled = bundledArchive(id);
  if (bundled) {
    log(event, `${label}: из установщика (${path.basename(bundled)})`);
    return bundled;
  }
  const url = packUrl(id);
  if (!url) throw new Error(`Нет адреса для ${label}`);
  const dest = path.join(managedPaths().root, 'cache', cacheName);
  log(event, `Загрузка ${label}…`);
  await download(event, url, dest, label);
  return dest;
}

async function moveExtracted(staging, dest, probe) {
  flattenExtract(staging, dest, probe);
}

async function extractPart(event, archive, dest, probeFile) {
  const staging = path.join(managedPaths().root, 'cache', `${path.basename(dest)}-src`);
  await extract(event, archive, staging);
  const probes = Array.isArray(probeFile) ? probeFile : (probeFile ? [probeFile] : []);
  let inner = staging;
  if (probes.length) {
    inner = probes.map((name) => findDirWith(staging, name)).find(Boolean);
    if (!inner) throw new Error(`В архиве нет ${probes[0]}`);
  }
  rmrf(dest);
  mkdirp(path.dirname(dest));
  fs.renameSync(inner, dest);
  if (exists(staging) && staging !== dest) rmrf(staging);
}

async function installJava(event) {
  const m = managedPaths();
  const archive = await ensureArchive(event, 'jdk', WIN ? 'jdk.zip' : 'jdk.tar.gz', 'JDK 17');
  const staging = path.join(m.root, 'cache', 'jdk-src');
  await extract(event, archive, staging);
  moveExtracted(staging, m.jdk, (inner, root) => findJavaHome(inner) || findJavaHome(root));
  const home = findJavaHome(m.jdk);
  if (home !== m.jdk) {
    const tmp = `${m.jdk}.home`;
    rmrf(tmp);
    fs.renameSync(home, tmp);
    rmrf(m.jdk);
    fs.renameSync(tmp, m.jdk);
  }
  if (!exists(path.join(m.jdk, 'bin', `java${EXE}`))) throw new Error('После распаковки не найден java');
  log(event, `JDK установлен: ${m.jdk}`);
}

async function installGradle(event) {
  const m = managedPaths();
  const archive = await ensureArchive(event, 'gradle', 'gradle.zip', `Gradle ${GRADLE_VERSION}`);
  const staging = path.join(m.root, 'cache', 'gradle-src');
  await extract(event, archive, staging);
  moveExtracted(staging, m.gradle);
  const bin = path.join(m.gradle, 'bin', WIN ? 'gradle.bat' : 'gradle');
  if (!exists(bin)) throw new Error('После распаковки не найден gradle');
  chmodBin(path.dirname(bin));
  log(event, `Gradle установлен: ${m.gradle}`);
}

async function installNode(event) {
  const m = managedPaths();
  const archive = await ensureArchive(event, 'node', WIN ? 'node.zip' : 'node.tar.gz', `Node.js ${NODE_VERSION}`);
  const staging = path.join(m.root, 'cache', 'node-src');
  await extract(event, archive, staging);
  moveExtracted(staging, m.node);
  const nodeBin = path.join(m.node, WIN ? 'node.exe' : path.join('bin', 'node'));
  const alt = path.join(m.node, 'bin', WIN ? 'node.exe' : 'node');
  if (!exists(nodeBin) && exists(alt)) {
    /* unix layout */
  } else if (!exists(nodeBin) && !exists(alt)) {
    throw new Error('После распаковки не найден node');
  }
  chmodBin(path.join(m.node, 'bin'));
  chmodBin(m.node);
  log(event, `Node.js установлен: ${m.node}`);
}

async function javaEnv() {
  const jdk = await resolveJdkHome();
  const home = jdk?.home || preferredJdkHome();
  if (!home) {
    throw new Error('Нужен JDK 17. Отметьте «Java JDK 17» и нажмите Установить.');
  }
  return buildEnv({ JAVA_HOME: home });
}

async function installAndroidSdkOffline(event, m) {
  const platformZip = bundledArchive('platform34');
  const buildZip = bundledArchive('buildTools');
  const toolsZip = bundledArchive('platformTools');
  const cmdZip = bundledArchive('cmdlineTools');
  if (!platformZip || !buildZip) return false;
  mkdirp(m.androidSdk);
  log(event, 'Собираю Android SDK из установщика…');
  if (cmdZip) {
    await extractPart(event, cmdZip, path.join(m.androidSdk, 'cmdline-tools', 'latest'), path.join('bin', WIN ? 'sdkmanager.bat' : 'sdkmanager'));
    chmodBin(path.join(m.androidSdk, 'cmdline-tools', 'latest', 'bin'));
  }
  await extractPart(event, platformZip, path.join(m.androidSdk, 'platforms', 'android-34'), 'android.jar');
  await extractPart(event, buildZip, path.join(m.androidSdk, 'build-tools', '34.0.0'), [
    WIN ? 'aapt.exe' : 'aapt',
    WIN ? 'aapt2.exe' : 'aapt2',
    WIN ? 'd8.bat' : 'd8',
  ]);
  chmodBin(path.join(m.androidSdk, 'build-tools', '34.0.0'));
  if (toolsZip) {
    await extractPart(event, toolsZip, path.join(m.androidSdk, 'platform-tools'), WIN ? 'adb.exe' : 'adb');
    chmodBin(path.join(m.androidSdk, 'platform-tools'));
  }
  writeSdkLicenses(m.androidSdk);
  if (!exists(path.join(m.androidSdk, 'platforms', 'android-34', 'android.jar'))) {
    throw new Error('В установщике нет platforms/android-34');
  }
  log(event, `Android SDK установлен: ${m.androidSdk}`);
  return true;
}

async function installAndroidSdk(event) {
  const m = managedPaths();
  try {
    if (await installAndroidSdkOffline(event, m)) return;
  } catch (err) {
    log(event, `Офлайн SDK: ${err.message}. Ставлю через sdkmanager…`);
  }
  const archive = await ensureArchive(event, 'cmdlineTools', 'commandlinetools.zip', 'Android commandline tools');
  mkdirp(m.androidSdk);
  const staging = path.join(m.root, 'cache', 'cmdtools-src');
  await extract(event, archive, staging);
  const latest = path.join(m.androidSdk, 'cmdline-tools', 'latest');
  rmrf(latest);
  mkdirp(path.dirname(latest));
  const inner = exists(path.join(staging, 'cmdline-tools')) ? path.join(staging, 'cmdline-tools') : staging;
  fs.renameSync(inner, latest);
  rmrf(staging);
  const sdkmanager = path.join(latest, 'bin', WIN ? 'sdkmanager.bat' : 'sdkmanager');
  if (!exists(sdkmanager)) throw new Error('sdkmanager не найден');
  chmodBin(path.dirname(sdkmanager));
  writeSdkLicenses(m.androidSdk);
  const env = await javaEnv();
  const sdkRoot = String(m.androidSdk).replace(/\\/g, '/');
  log(event, `sdkmanager на JDK: ${env.JAVA_HOME}`);
  log(event, 'Принимаю лицензии SDK…');
  await spawnLogged(event, sdkmanager, [`--sdk_root=${sdkRoot}`, '--licenses'], {
    env,
    input: `${'y\n'.repeat(80)}`,
  }).catch(() => { /* часть лицензий уже принята */ });
  log(event, 'Ставлю platform-tools, platforms;android-34, build-tools;34.0.0…');
  await spawnLogged(event, sdkmanager, [
    `--sdk_root=${sdkRoot}`,
    'platform-tools',
    'platforms;android-34',
    'build-tools;34.0.0',
  ], { env });
  log(event, `Android SDK установлен: ${m.androidSdk}`);
}

async function installXcode(event) {
  if (process.platform !== 'darwin') throw new Error('Xcode только на macOS');
  const { shell } = require('electron');
  log(event, 'Открываю установку инструментов Xcode…');
  try { spawn('xcode-select', ['--install'], { detached: true, stdio: 'ignore' }).unref(); } catch { /* уже стоит */ }
  await shell.openExternal('https://apps.apple.com/app/xcode/id497799835');
  return { opened: true };
}

async function ensureJdkFor(event, id) {
  if (id !== 'androidSdk' && id !== 'gradle') return;
  if (await resolveJdkHome()) return;
  log(event, 'Для этого шага нужен JDK 17 - ставлю Temurin…');
  await installJava(event);
}

async function installOne(event, id, opts) {
  send(event, { type: 'tool', tool: id, status: 'installing' });
  job.tool = id;
  await ensureJdkFor(event, id);
  if (id === 'java') await installJava(event);
  else if (id === 'gradle') await installGradle(event);
  else if (id === 'node' || id === 'npm') await installNode(event);
  else if (id === 'androidSdk') await installAndroidSdk(event);
  else if (id === 'capacitor') {
    const res = await installCapacitor(opts.root, (line) => log(event, line));
    if (!res.success) throw new Error(res.error || 'Capacitor не установился');
    log(event, res.skipped ? 'Capacitor уже был в проекте' : `Capacitor ${res.version || ''} установлен в проект`);
  } else if (id === 'xcode') await installXcode(event);
  else throw new Error(`Неизвестный инструмент: ${id}`);
  send(event, { type: 'tool', tool: id, status: 'ok' });
}

async function uninstallOne(event, id, opts) {
  const m = managedPaths();
  send(event, { type: 'tool', tool: id, status: 'removing' });
  if (id === 'java') {
    if (!isManaged(m.jdk) && !exists(m.jdk)) throw new Error('Студийный JDK не найден - системный Java не удаляю');
    rmrf(m.jdk);
  } else if (id === 'gradle') {
    if (!exists(m.gradle)) throw new Error('Студийный Gradle не найден - системный не удаляю');
    rmrf(m.gradle);
  } else if (id === 'node' || id === 'npm') {
    if (!exists(m.node)) {
      log(event, 'Студийный Node.js уже снят');
      send(event, { type: 'tool', tool: id, status: 'missing' });
      return;
    }
    rmrf(m.node);
  } else if (id === 'androidSdk') {
    if (!exists(m.androidSdk)) throw new Error('Студийный Android SDK не найден - системный не удаляю');
    rmrf(m.androidSdk);
  } else if (id === 'capacitor') {
    const res = await uninstallCapacitor(opts.root, (line) => log(event, line));
    if (!res.success) throw new Error(res.error || 'Capacitor не удалился');
  } else if (id === 'xcode') {
    throw new Error('Xcode удаляется через Launchpad / Настройки системы, не из IDE');
  } else {
    throw new Error(`Неизвестный инструмент: ${id}`);
  }
  log(event, `Снято: ${id}`);
  send(event, { type: 'tool', tool: id, status: 'missing' });
}

const ORDER = ['java', 'node', 'npm', 'gradle', 'androidSdk', 'capacitor', 'xcode'];

function sortIds(ids) {
  const set = new Set(ids);
  if (set.has('npm')) set.add('node');
  return ORDER.filter((id) => set.has(id));
}

async function runJob(event, action, names, opts = {}) {
  if (job) return { success: false, error: 'Уже выполняется другая операция' };
  job = { abort: false, child: null, req: null, tool: null };
  try {
    await ensureStudioDirs();
    mkdirp(path.join(managedPaths().root, 'cache'));
    const ids = sortIds(Array.isArray(names) ? names : []);
    if (!ids.length) return { success: false, error: 'Ничего не выбрано' };
    const skipNpm = action === 'install' && ids.includes('node');
    for (const id of action === 'uninstall' ? [...ids].reverse() : ids) {
      if (job.abort) throw new Error('Отменено');
      if (skipNpm && id === 'npm') continue;
      if (action === 'uninstall') await uninstallOne(event, id, opts);
      else await installOne(event, id, opts);
    }
    const status = await checkTools(undefined, opts);
    send(event, { type: 'done', success: true, tools: status.tools });
    return { success: true, tools: status.tools };
  } catch (error) {
    const message = error.message || String(error);
    log(event, message);
    send(event, { type: 'done', success: false, error: message });
    return { success: false, error: message };
  } finally {
    const current = job;
    job = null;
    if (current?.child) try { current.child.kill('SIGTERM'); } catch { /* ignore */ }
    if (current?.req) try { current.req.destroy(); } catch { /* ignore */ }
  }
}

function cancelJob() {
  if (!job) return { success: false, error: 'Нечего отменять' };
  job.abort = true;
  try { job.child?.kill('SIGTERM'); } catch { /* ignore */ }
  try { job.req?.abort?.(); } catch { /* ignore */ }
  try { job.req?.destroy?.(); } catch { /* ignore */ }
  return { success: true };
}

function catalogForPlatform() {
  return CATALOG.filter((item) => !item.platform || item.platform === process.platform);
}

/**
 * Перед сборкой: если на компьютере нет JDK 17-21 / Gradle / SDK 34,
 * ставит их в Documents/ProcessingStudio/toolchain. Системные SDK не трогает.
 */
async function ensureBuildTools(event, ids = ['java', 'gradle', 'androidSdk']) {
  const wanted = Array.isArray(ids) && ids.length ? ids : ['java', 'gradle', 'androidSdk'];
  const missing = [];
  if (wanted.includes('java') && !(await resolveJdkHome())) missing.push('java');
  if (wanted.includes('node')) {
    const nodeHome = managedPaths().node;
    const nodeBin = path.join(nodeHome, WIN ? 'node.exe' : path.join('bin', 'node'));
    const nodeAlt = path.join(nodeHome, 'bin', WIN ? 'node.exe' : 'node');
    if (!exists(nodeBin) && !exists(nodeAlt) && !(await which('node'))) missing.push('node');
  }
  if (wanted.includes('gradle')) {
    const bin = path.join(managedPaths().gradle, 'bin', WIN ? 'gradle.bat' : 'gradle');
    if (!exists(bin)) {
      const host = (WIN ? await which('gradle.bat') : null) || await which('gradle');
      if (!host) missing.push('gradle');
    }
  }
  if (wanted.includes('androidSdk') && !resolveSdkRoot()) missing.push('androidSdk');
  if (!missing.length) return { success: true, installed: [] };
  if (job) throw new Error('Пакетный менеджер уже занят. Дождитесь окончания установки.');

  log(event, `На этой машине нет: ${missing.join(', ')}. Ставлю в toolchain…`);
  job = { abort: false, child: null, req: null, tool: null };
  try {
    await ensureStudioDirs();
    mkdirp(path.join(managedPaths().root, 'cache'));
    for (const id of sortIds(missing)) {
      if (job.abort) throw new Error('Отменено');
      await installOne(event, id, {});
    }
    return { success: true, installed: missing };
  } catch (error) {
    log(event, error.message || String(error));
    throw error;
  } finally {
    const current = job;
    job = null;
    if (current?.child) try { current.child.kill('SIGTERM'); } catch { /* ignore */ }
    if (current?.req) try { current.req.destroy(); } catch { /* ignore */ }
  }
}

function registerToolchainInstallIpc() {
  try { ipcMain.removeHandler('toolchain-catalog'); } catch {}
  try { ipcMain.removeHandler('toolchain-install'); } catch {}
  try { ipcMain.removeHandler('toolchain-uninstall'); } catch {}
  try { ipcMain.removeHandler('toolchain-cancel'); } catch {}
  ipcMain.handle('toolchain-catalog', async (_event, opts) => {
    try {
      await ensureStudioDirs();
      const check = await checkTools(undefined, opts || {});
      return {
        success: true,
        root: managedPaths().root,
        catalog: catalogForPlatform(),
        tools: check.tools,
        busy: !!job,
        bundled: bundledStatus(),
        buildIds: BUILD_IDS,
      };
    } catch (error) {
      return { success: false, error: error.message, catalog: catalogForPlatform(), tools: {}, bundled: bundledStatus(), buildIds: BUILD_IDS };
    }
  });
  ipcMain.handle('toolchain-install', (event, names, opts) => runJob(event, 'install', names, opts || {}));
  ipcMain.handle('toolchain-uninstall', (event, names, opts) => runJob(event, 'uninstall', names, opts || {}));
  ipcMain.handle('toolchain-cancel', () => cancelJob());
}

module.exports = {
  registerToolchainInstallIpc,
  catalogForPlatform,
  ensureBuildTools,
  CATALOG,
  BUILD_IDS,
};
