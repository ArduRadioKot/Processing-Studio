/**
 * Сборщик платформ: Gradle assembleDebug и Capacitor sync.
 * Лог стримится в renderer через builder-log.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ipcMain } = require('electron');
const { which, exists, buildEnv, WIN, checkTools, resolveJdkHome, resolveSdkRoot, spawnProcess } = require('./toolchain');
const { ensureBuildTools } = require('./toolchain-install');

const BUILD_TIMEOUT = 15 * 60 * 1000;

let child = null;
let aborting = false;

function send(event, payload) {
  try { event.sender.send('builder-log', payload); } catch { /* окно закрыто */ }
}

function writeSdkDir(androidDir, sdk) {
  if (!sdk || !androidDir) return;
  const dir = String(sdk).replace(/\\/g, '/');
  fs.mkdirSync(androidDir, { recursive: true });
  fs.writeFileSync(path.join(androidDir, 'local.properties'), `sdk.dir=${dir}\n`, 'utf8');
}

/** Путь JDK этой машины не должен попадать в проект — иначе сборка ломается на другом компьютере. */
function stripPersistedJavaHome(androidDir) {
  if (!androidDir) return;
  const file = path.join(androidDir, 'gradle.properties');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  if (!/^org\.gradle\.java\.home=/m.test(text)) return;
  text = text.replace(/^org\.gradle\.java\.home=.*$/gm, '').replace(/\n{3,}/g, '\n\n');
  fs.writeFileSync(file, text, 'utf8');
}

function teeInstallEvent(event) {
  return {
    sender: {
      send(channel, payload) {
        try { event.sender.send(channel, payload); } catch { /* ignore */ }
        const text = payload && (payload.message || payload.text);
        if (text) send(event, { type: 'log', text: String(text) });
      },
    },
  };
}

function spawnLogged(event, cmd, args, opts = {}) {
  return new Promise((resolve) => {
    if (aborting) {
      resolve({ ok: false, code: -1, error: 'Отменено' });
      return;
    }
    send(event, { type: 'log', text: `$ ${path.basename(cmd)} ${args.join(' ')}` });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      child = null;
      resolve(result);
    };
    let proc;
    try {
      proc = spawnProcess(cmd, args, {
        cwd: opts.cwd,
        env: opts.env || buildEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      finish({ ok: false, code: -1, error: err.message || String(err) });
      return;
    }
    child = proc;
    const timer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch { /* ignore */ }
    }, opts.timeout || BUILD_TIMEOUT);
    const flush = (buf) => {
      const text = buf.toString().replace(/\r/g, '\n');
      if (text.trim()) send(event, { type: 'log', text: text.replace(/\n$/, '') });
    };
    if (proc.stdout) proc.stdout.on('data', flush);
    if (proc.stderr) proc.stderr.on('data', flush);
    proc.on('error', (err) => {
      clearTimeout(timer);
      const missing = err && err.code === 'ENOENT';
      finish({
        ok: false,
        code: -1,
        error: missing ? `Не найдена команда «${path.basename(cmd)}»` : err.message,
      });
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (aborting) finish({ ok: false, code, error: 'Отменено' });
      else finish({ ok: code === 0, code, error: code === 0 ? null : `код ${code}` });
    });
  });
}

async function gradleBin(androidDir) {
  if (androidDir) {
    const wrapper = path.join(androidDir, WIN ? 'gradlew.bat' : 'gradlew');
    const jar = path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.jar');
    if (exists(wrapper) && exists(jar)) return wrapper;
  }
  return (WIN ? await which('gradle.bat') : null) || await which('gradle');
}

async function capBin(root) {
  const local = path.join(root, 'node_modules', '.bin', WIN ? 'cap.cmd' : 'cap');
  if (exists(local)) return local;
  return (WIN ? await which('cap.cmd') : null) || await which('cap');
}

async function npxBin() {
  return (WIN ? await which('npx.cmd') : null) || await which('npx');
}

function findApk(androidDir) {
  const debug = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
  if (exists(debug)) return debug;
  const release = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (exists(release)) return release;
  return null;
}

async function ensureWrapper(event, androidDir, gradle, env) {
  const script = path.join(androidDir, WIN ? 'gradlew.bat' : 'gradlew');
  const jar = path.join(androidDir, 'gradle', 'wrapper', 'gradle-wrapper.jar');
  if (exists(script) && exists(jar)) {
    if (!WIN) try { fs.chmodSync(script, 0o755); } catch { /* ignore */ }
    return script;
  }
  if (!gradle) return null;
  send(event, { type: 'log', text: 'Создаю Gradle Wrapper в проекте…' });
  const wrap = await spawnLogged(event, gradle, [
    'wrapper',
    '--gradle-version', '8.7',
    '--distribution-type', 'bin',
  ], { cwd: androidDir, env, timeout: 180000 });
  if (!wrap.ok || !exists(script)) return null;
  if (!WIN) try { fs.chmodSync(script, 0o755); } catch { /* ignore */ }
  return script;
}

async function assembleGradle(event, androidDir, tools) {
  if (!exists(androidDir)) return { ok: false, error: `Нет папки ${androidDir}` };
  try {
    await ensureBuildTools(teeInstallEvent(event), ['java', 'gradle', 'androidSdk']);
  } catch (err) {
    return { ok: false, error: err.message || 'Не удалось поставить инструменты сборки' };
  }
  const jdk = await resolveJdkHome();
  if (!jdk) {
    return {
      ok: false,
      error: 'Нужен JDK 17–21. Откройте пакетный менеджер и поставьте Java JDK 17.',
    };
  }
  const sdk = resolveSdkRoot() || tools?.androidSdk?.path;
  if (!sdk) {
    return { ok: false, error: 'Android SDK не найден. Откройте пакетный менеджер.' };
  }
  writeSdkDir(androidDir, sdk);
  stripPersistedJavaHome(androidDir);
  const env = buildEnv({ JAVA_HOME: jdk.home, ANDROID_HOME: sdk });
  send(event, { type: 'log', text: `JDK ${jdk.major}: ${jdk.home}` });
  send(event, { type: 'log', text: `Android SDK: ${sdk}` });
  let gradle = await gradleBin(androidDir);
  if (!gradle) return { ok: false, error: 'Gradle не найден. Откройте пакетный менеджер.' };
  const wrapped = await ensureWrapper(event, androidDir, gradle, env);
  if (wrapped) gradle = wrapped;
  // --stop из папки проекта снова читает settings.gradle и падает на Java 22.
  await spawnLogged(event, gradle, ['--stop'], { cwd: os.tmpdir(), env, timeout: 20000 });
  const javaHome = String(jdk.home).replace(/\\/g, '/');
  const res = await spawnLogged(event, gradle, [
    `-Dorg.gradle.java.home=${javaHome}`,
    'assembleDebug',
    '--stacktrace',
  ], { cwd: androidDir, env });
  if (!res.ok) return { ok: false, error: res.error || 'Gradle assembleDebug не удался' };
  const apk = findApk(androidDir);
  return { ok: true, path: apk || androidDir, artifact: apk };
}

async function runCap(event, root, args) {
  const cap = await capBin(root);
  const env = buildEnv();
  if (cap) return spawnLogged(event, cap, args, { cwd: root, env });
  const npx = await npxBin();
  if (!npx) return { ok: false, error: 'Нет Capacitor CLI. Поставьте его мастером зависимостей.' };
  return spawnLogged(event, npx, ['cap', ...args], { cwd: root, env });
}

async function buildWebCapacitor(event, { root, platform, tools }) {
  if (!root) return { ok: false, error: 'Проект не открыт' };
  const www = path.join(root, 'www', 'index.html');
  if (!exists(www)) return { ok: false, error: 'Нет www/index.html — сначала трансляция скетча' };
  if (platform === 'android' || platform === 'ios') {
    try {
      const ids = platform === 'android' ? ['node', 'java', 'gradle', 'androidSdk'] : ['node'];
      await ensureBuildTools(teeInstallEvent(event), ids);
    } catch (err) {
      return { ok: false, error: err.message || 'Не удалось поставить инструменты сборки' };
    }
  }

  if (platform === 'web') {
    return { ok: true, path: path.join(root, 'www'), artifact: www };
  }

  const platformDir = path.join(root, platform);
  if (!exists(platformDir)) {
    const add = await runCap(event, root, ['add', platform]);
    if (!add.ok) return { ok: false, error: add.error || `cap add ${platform} не удался` };
  }
  const sync = await runCap(event, root, ['sync', platform]);
  if (!sync.ok) return { ok: false, error: sync.error || `cap sync ${platform} не удался` };

  if (platform === 'android') {
    const androidDir = path.join(root, 'android');
    return assembleGradle(event, androidDir, tools);
  }
  if (platform === 'ios') {
    const iosDir = path.join(root, 'ios', 'App');
    return {
      ok: true,
      path: exists(iosDir) ? iosDir : path.join(root, 'ios'),
      note: 'Проект Xcode готов. Архив и подпись делаются в Xcode.',
    };
  }
  return { ok: true, path: root };
}

async function buildNativeAndroid(event, { root, tools }) {
  const androidDir = path.join(root, 'android');
  if (!exists(androidDir)) {
    return { ok: false, error: 'Сначала экспортируйте Gradle-проект' };
  }
  return assembleGradle(event, androidDir, tools);
}

async function runBuild(event, payload = {}) {
  aborting = false;
  const root = payload.root;
  const kind = payload.kind;
  const target = payload.target || 'android';
  const check = await checkTools(undefined, { root });
  const tools = check.tools || {};
  send(event, { type: 'start', kind, target, root });
  try {
    let result;
    if (kind === 'multiplatform' || payload.stack === 'processing2web') {
      result = await buildWebCapacitor(event, { root, platform: target, tools });
    } else {
      result = await buildNativeAndroid(event, { root, tools });
    }
    send(event, { type: 'done', ...result });
    return { success: result.ok, ...result };
  } catch (error) {
    send(event, { type: 'done', ok: false, error: error.message });
    return { success: false, ok: false, error: error.message };
  }
}

function registerBuilderIpc() {
  try { ipcMain.removeHandler('builder-run'); } catch {}
  try { ipcMain.removeHandler('builder-cancel'); } catch {}
  ipcMain.handle('builder-run', (event, payload) => runBuild(event, payload || {}));
  ipcMain.handle('builder-cancel', () => {
    aborting = true;
    try { child?.kill('SIGTERM'); } catch { /* ignore */ }
    return { success: true };
  });
}

module.exports = {
  registerBuilderIpc,
  writeSdkDir,
};
