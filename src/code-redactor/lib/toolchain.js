/**
 * Проверка инструментов для стеков Processing2Web и Processing2Android.
 * Ищет и системные бинарники, и копию, которую поставил мастер в toolchain/.
 */
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ipcMain } = require('electron');
const { toolchainDir } = require('./studio');

const TIMEOUT = 7000;
const WIN = process.platform === 'win32';
const EXE = WIN ? '.exe' : '';

function isWinScript(cmd) {
  return WIN && /\.(cmd|bat)$/i.test(String(cmd || ''));
}

/** CMD считает `;` разделителем команд - без кавычек sdkmanager не видит platforms;android-34. */
function quoteWinArg(arg) {
  const s = String(arg);
  if (s.length === 0) return '""';
  if (!/[\s"&|<>^();,]/.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

function wrapWinScript(cmd, args = []) {
  if (!isWinScript(cmd)) {
    return { file: cmd, args, verbatim: false };
  }
  return {
    file: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/s', '/c', [cmd, ...args].map(quoteWinArg).join(' ')],
    verbatim: true,
  };
}

function exec(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const wrapped = wrapWinScript(cmd, args || []);
    execFile(wrapped.file, wrapped.args, {
      timeout: opts.timeout || TIMEOUT,
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
      maxBuffer: opts.maxBuffer || 1024 * 1024,
      windowsHide: true,
      windowsVerbatimArguments: wrapped.verbatim,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || '').trim(),
        stderr: String(stderr || '').trim(),
        error: error ? (error.killed ? 'timeout' : error.message) : null,
        code: error && typeof error.code === 'number' ? error.code : 0,
      });
    });
  });
}

function spawnProcess(cmd, args, opts = {}) {
  const wrapped = wrapWinScript(cmd, args || []);
  return spawn(wrapped.file, wrapped.args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: opts.stdio,
    detached: opts.detached,
    windowsHide: opts.windowsHide !== false,
    windowsVerbatimArguments: wrapped.verbatim,
    shell: false,
  });
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function managedPaths() {
  const root = toolchainDir;
  const jdk = path.join(root, 'jdk');
  const javaHome = exists(path.join(jdk, 'bin', `java${EXE}`))
    ? jdk
    : (exists(path.join(jdk, 'Contents', 'Home', 'bin', `java${EXE}`)) ? path.join(jdk, 'Contents', 'Home') : jdk);
  return {
    root,
    jdk,
    javaHome,
    androidSdk: path.join(root, 'android-sdk'),
    gradle: path.join(root, 'gradle'),
    node: path.join(root, 'node'),
  };
}

function extraBinDirs(javaHome) {
  const m = managedPaths();
  const jdk = javaHome || preferredJdkHome() || null;
  const dirs = [
    jdk ? path.join(jdk, 'bin') : null,
    path.join(m.gradle, 'bin'),
    path.join(m.node, 'bin'),
    path.join(m.node),
    path.join(m.androidSdk, 'platform-tools'),
    path.join(m.androidSdk, 'cmdline-tools', 'latest', 'bin'),
  ];
  if (WIN) {
    const local = process.env.LOCALAPPDATA;
    if (local) dirs.push(path.join(local, 'Android', 'Sdk', 'platform-tools'));
    const pf = process.env.ProgramFiles;
    if (pf) dirs.push(path.join(pf, 'Git', 'usr', 'bin'), path.join(pf, 'Git', 'bin'));
  } else {
    dirs.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin');
  }
  return [...new Set(dirs.filter((dir) => dir && exists(dir)))];
}

function listDir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function winNames(name) {
  if (!WIN) return [name];
  if (/\.(exe|cmd|bat)$/i.test(name)) return [name];
  return [`${name}.exe`, `${name}.cmd`, `${name}.bat`, name];
}

function pathDirs() {
  const raw = process.env.PATH || process.env.Path || '';
  return raw.split(path.delimiter).map((dir) => {
    let s = String(dir || '').trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
    return s.replace(/[\\/]+$/, '');
  }).filter(Boolean);
}

async function which(name) {
  const dirs = [...extraBinDirs(), ...pathDirs()];
  for (const dir of dirs) {
    for (const file of winNames(name)) {
      const candidate = path.join(dir, file);
      if (exists(candidate)) return candidate;
    }
  }
  if (WIN) {
    const whereBin = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe');
    const res = await exec(exists(whereBin) ? whereBin : 'where.exe', [name]);
    const line = (res.stdout || '').split(/\r?\n/).map((s) => s.trim()).find((s) => s && exists(s));
    if (line) return line;
  } else {
    const sh = exists('/bin/zsh') ? '/bin/zsh' : '/bin/bash';
    const res = await exec(sh, ['-lc', `command -v ${name}`]);
    if (res.ok && res.stdout) return res.stdout.split('\n')[0].trim();
  }
  return null;
}

function firstLine(text) {
  return String(text || '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) || '';
}

/** 66 = Java 22. Gradle 8.7 и AGP 8.5 понимают только 17-21. */
function parseJavaMajor(text) {
  const match = String(text || '').match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) return 0;
  const major = Number(match[1]);
  return major === 1 ? Number(match[2] || 0) : major;
}

function listJvmHomes() {
  const homes = [];
  const add = (home) => {
    if (home && exists(path.join(home, 'bin', `java${EXE}`))) homes.push(home);
  };
  const m = managedPaths();
  add(m.javaHome);
  add(process.env.JAVA_HOME);
  add(process.env.JDK_HOME);

  for (const root of ['/opt/homebrew/opt', '/usr/local/opt']) {
    for (const name of listDir(root)) {
      if (!/^(openjdk|temurin|java|jdk)/i.test(name)) continue;
      const base = path.join(root, name);
      add(path.join(base, 'libexec', 'openjdk.jdk', 'Contents', 'Home'));
      add(base);
    }
  }
  for (const cellar of ['/opt/homebrew/Cellar', '/usr/local/Cellar']) {
    for (const formula of listDir(cellar)) {
      if (!/^(openjdk|temurin)/i.test(formula)) continue;
      for (const ver of listDir(path.join(cellar, formula))) {
        const base = path.join(cellar, formula, ver);
        add(path.join(base, 'libexec', 'openjdk.jdk', 'Contents', 'Home'));
        add(base);
      }
    }
  }

  const pf = process.env.ProgramFiles || (WIN ? 'C:\\Program Files' : '');
  const trees = [
    '/Library/Java/JavaVirtualMachines',
    path.join(os.homedir(), 'Library/Java/JavaVirtualMachines'),
    '/usr/lib/jvm',
    '/usr/lib64/jvm',
    '/usr/java',
    '/opt/java',
    '/opt/jdk',
    path.join(os.homedir(), '.sdkman/candidates/java'),
    path.join(os.homedir(), '.asdf/installs/java'),
    path.join(os.homedir(), '.jabba/jdk'),
    pf && path.join(pf, 'Eclipse Adoptium'),
    pf && path.join(pf, 'Microsoft'),
    pf && path.join(pf, 'Java'),
    pf && path.join(pf, 'BellSoft'),
    pf && path.join(pf, 'Zulu'),
    pf && path.join(pf, 'Amazon Corretto'),
    pf && path.join(pf, 'Eclipse Foundation'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Eclipse Adoptium'),
  ].filter(Boolean);

  for (const tree of trees) {
    add(tree);
    add(path.join(tree, 'Contents', 'Home'));
    add(path.join(tree, 'Home'));
    for (const name of listDir(tree)) {
      const base = path.join(tree, name);
      add(path.join(base, 'Contents', 'Home'));
      add(base);
      add(path.join(base, 'Home'));
    }
  }

  add('/Applications/Android Studio.app/Contents/jbr/Contents/Home');
  add('/Applications/Android Studio Preview.app/Contents/jbr/Contents/Home');
  add('/opt/android-studio/jbr');
  add(path.join(os.homedir(), 'android-studio/jbr'));
  add('/usr/lib/jvm/default-java');
  if (pf) {
    add(path.join(pf, 'Android', 'Android Studio', 'jbr'));
    add(path.join(pf, 'Android', 'Android Studio', 'jre'));
  }
  return [...new Set(homes)];
}

/** Синхронно выбирает JDK 17-21 по пути. Java 22+ (class file 66) отсекается. */
function preferredJdkHome() {
  const m = managedPaths();
  if (exists(path.join(m.javaHome, 'bin', `java${EXE}`))) return m.javaHome;
  let best = '';
  let bestScore = 0;
  for (const home of listJvmHomes()) {
    const n = String(home).toLowerCase();
    if (/jdk-?(8|11|2[2-9])|openjdk@(8|11|2[2-9])|java-(8|11|2[2-9])|\b(8|11|2[2-9])\.jdk\b/.test(n)) continue;
    let score = 1;
    if (isManaged(home)) score = 400;
    else if (/openjdk@17|temurin@17|jdk-?17|java-17/.test(n)) score = 300;
    else if (/openjdk@21|temurin@21|jdk-?21|java-21/.test(n)) score = 200;
    else if (/openjdk@1[89]|temurin@1[89]|jdk-?1[89]/.test(n)) score = 150;
    if (score > bestScore) {
      best = home;
      bestScore = score;
    }
  }
  return best;
}

async function javaMajorFromHome(home) {
  const bin = path.join(home, 'bin', `java${EXE}`);
  if (!exists(bin)) return 0;
  const res = await exec(bin, ['-version']);
  return parseJavaMajor(res.stderr || res.stdout);
}

/** JDK, на котором можно гонять Gradle 8.7: 17, иначе 21. */
async function resolveJdkHome() {
  const ranked = [];
  for (const home of listJvmHomes()) {
    const major = await javaMajorFromHome(home);
    if (major >= 17 && major <= 21) ranked.push({ home, major, managed: isManaged(home) });
  }
  ranked.sort((a, b) => {
    if (a.managed !== b.managed) return a.managed ? -1 : 1;
    if (a.major === 17 && b.major !== 17) return -1;
    if (b.major === 17 && a.major !== 17) return 1;
    return a.major - b.major;
  });
  return ranked[0] || null;
}

function isManaged(filePath) {
  if (!filePath) return false;
  const root = managedPaths().root;
  return filePath === root || filePath.startsWith(root + path.sep);
}

async function checkCommand(binName, args, { pick = 'stdout' } = {}) {
  const bin = await which(binName);
  if (!bin) {
    return {
      ok: false, name: binName, path: null, version: null, managed: false,
      hint: `Не найден «${binName}». Откройте пакетный менеджер.`,
    };
  }
  const res = await exec(bin, args, { env: buildEnv() });
  const version = firstLine(pick === 'stderr' ? res.stderr : (res.stdout || res.stderr));
  const stub = /unable to locate a java runtime/i.test(version) || /no java runtime/i.test(res.stderr);
  const ok = res.ok && !stub;
  return {
    ok,
    name: binName,
    path: ok ? bin : null,
    version: ok ? (version || null) : null,
    managed: isManaged(bin),
    hint: ok ? (isManaged(bin) ? 'установлен Processing Studio' : 'системный') : (stub
      ? 'Установите JDK 17 в пакетном менеджере'
      : (res.error || res.stderr || 'Команда завершилась с ошибкой')),
  };
}

function documentsDir() {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') return app.getPath('documents');
  } catch { /* ignore */ }
  return path.join(os.homedir(), 'Documents');
}

function androidSdkRoots() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const docs = documentsDir();
  return [
    managedPaths().androidSdk,
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(home, 'Library', 'Android', 'sdk'),
    path.join(local, 'Android', 'Sdk'),
    path.join(home, 'AppData', 'Local', 'Android', 'Sdk'),
    path.join(home, 'Android', 'Sdk'),
    '/opt/android-sdk',
    '/usr/lib/android-sdk',
    '/usr/local/android-sdk',
    path.join(docs, 'Processing', 'android', 'sdk'),
    path.join(home, 'Processing', 'android', 'sdk'),
  ].filter(Boolean);
}

/** SDK годится для compileSdk 34: не дописываем пакеты в чужой каталог. */
function sdkLooksReady(root) {
  if (!root || !exists(root)) return false;
  if (!exists(path.join(root, 'platforms', 'android-34', 'android.jar'))) return false;
  const tools = path.join(root, 'build-tools');
  if (!exists(tools)) return false;
  return listDir(tools).some((name) => /^34(\.|$)/.test(name));
}

function resolveSdkRoot() {
  const managed = managedPaths().androidSdk;
  if (sdkLooksReady(managed)) return managed;
  for (const root of androidSdkRoots()) {
    if (root === managed) continue;
    if (sdkLooksReady(root)) return root;
  }
  return null;
}

async function checkAndroidSdk() {
  const root = resolveSdkRoot();
  if (root) {
    return {
      ok: true, name: 'androidSdk', path: root, version: root, managed: isManaged(root),
      hint: isManaged(root) ? 'установлен Processing Studio' : 'системный · только чтение',
    };
  }
  return {
    ok: false, name: 'androidSdk', path: null, version: null, managed: false,
    hint: 'При сборке студия поставит Android SDK в toolchain',
  };
}

function localCapBin(projectRoot) {
  if (!projectRoot) return null;
  const bin = path.join(projectRoot, 'node_modules', '.bin', WIN ? 'cap.cmd' : 'cap');
  return exists(bin) ? bin : null;
}

async function checkCapacitor(projectRoot) {
  const local = localCapBin(projectRoot);
  const corePkg = projectRoot ? path.join(projectRoot, 'node_modules', '@capacitor', 'core', 'package.json') : null;
  if (local || (corePkg && exists(corePkg))) {
    let version = null;
    if (local) {
      const res = await exec(local, ['--version'], { env: buildEnv() });
      version = firstLine(res.stdout || res.stderr);
    }
    if (!version && corePkg && exists(corePkg)) {
      try { version = JSON.parse(fs.readFileSync(corePkg, 'utf8')).version; } catch { /* ignore */ }
    }
    return { ok: true, name: 'capacitor', path: local || path.dirname(corePkg), version, managed: true, hint: 'в проекте' };
  }
  const cap = await which('cap');
  if (cap) {
    const res = await exec(cap, ['--version'], { env: buildEnv() });
    return { ok: true, name: 'capacitor', path: cap, version: firstLine(res.stdout || res.stderr), managed: false, hint: 'глобально' };
  }
  const npx = await which(WIN ? 'npx.cmd' : 'npx') || await which('npx');
  if (npx) {
    const res = await exec(npx, ['--no-install', 'cap', '--version'], { env: buildEnv() });
    if (res.ok || /capacitor/i.test(res.stdout + res.stderr)) {
      return { ok: true, name: 'capacitor', path: npx, version: firstLine(res.stdout || res.stderr) || 'npx cap', managed: false, hint: null };
    }
  }
  return {
    ok: false, name: 'capacitor', path: null, version: null, managed: false,
    hint: projectRoot ? 'Capacitor ставится в папку проекта мастером зависимостей' : 'Откройте мультиплатформенный проект',
  };
}

async function checkXcode() {
  if (process.platform !== 'darwin') {
    return { ok: false, name: 'xcode', path: null, version: null, managed: false, hint: 'Xcode доступен только на macOS' };
  }
  const bin = '/usr/bin/xcodebuild';
  if (!exists(bin)) {
    return { ok: false, name: 'xcode', path: null, version: null, managed: false, hint: 'Установите Xcode из App Store' };
  }
  const res = await exec(bin, ['-version']);
  const version = firstLine(res.stdout || res.stderr);
  const ok = res.ok || /^Xcode\b/i.test(version);
  return {
    ok, name: 'xcode', path: bin, version: version || null, managed: false,
    hint: ok ? 'системный · для устройства нужна подпись' : (res.stderr || 'xcodebuild недоступен'),
  };
}

function buildEnv(extra = {}) {
  const m = managedPaths();
  const javaHome = extra.JAVA_HOME || preferredJdkHome();
  const sdk = extra.ANDROID_HOME || extra.ANDROID_SDK_ROOT || resolveSdkRoot();
  const bins = extraBinDirs(javaHome || null);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.JAVA_HOME;
  delete env.JDK_HOME;
  delete env.ANDROID_HOME;
  delete env.ANDROID_SDK_ROOT;
  Object.assign(env, extra);
  env.PATH = [...new Set([...bins, env.PATH || ''])].join(path.delimiter);
  env.GRADLE_USER_HOME = extra.GRADLE_USER_HOME || path.join(m.root, 'gradle-home');
  if (javaHome) env.JAVA_HOME = javaHome;
  else delete env.JAVA_HOME;
  if (sdk) {
    env.ANDROID_HOME = sdk;
    env.ANDROID_SDK_ROOT = sdk;
  } else {
    delete env.ANDROID_HOME;
    delete env.ANDROID_SDK_ROOT;
  }
  return env;
}

async function checkJava() {
  const jdk = await resolveJdkHome();
  if (jdk) {
    const bin = path.join(jdk.home, 'bin', `java${EXE}`);
    const res = await exec(bin, ['-version']);
    const version = firstLine(res.stderr || res.stdout);
    return {
      ok: true,
      name: 'java',
      path: bin,
      version: version || `JDK ${jdk.major}`,
      managed: jdk.managed,
      major: jdk.major,
      javaHome: jdk.home,
      hint: jdk.managed ? 'установлен Processing Studio' : `JDK ${jdk.major}`,
    };
  }
  const fallback = await checkCommand('java', ['-version'], { pick: 'stderr' });
  const major = parseJavaMajor(fallback.version || fallback.hint || '');
  if (fallback.ok && major > 21) {
    return {
      ...fallback,
      ok: false,
      major,
      hint: `Java ${major} не подходит для Gradle 8.7. Поставьте JDK 17 в пакетном менеджере.`,
    };
  }
  return fallback;
}

async function checkGradle() {
  const bin = (WIN ? await which('gradle.bat') : null) || await which('gradle');
  if (!bin) {
    return {
      ok: false, name: 'gradle', path: null, version: null, managed: false,
      hint: 'При сборке студия поставит Gradle в toolchain',
    };
  }
  const jdk = await resolveJdkHome();
  const res = await exec(bin, ['-v'], { env: buildEnv(jdk ? { JAVA_HOME: jdk.home } : {}) });
  const version = firstLine(res.stdout || res.stderr);
  const classFile = /Unsupported class file major version/i.test(res.stderr + res.stdout);
  const ok = res.ok && !classFile;
  return {
    ok,
    name: 'gradle',
    path: ok ? bin : null,
    version: ok ? (version || null) : null,
    managed: isManaged(bin),
    hint: ok
      ? (isManaged(bin) ? 'установлен Processing Studio' : 'системный')
      : (classFile
        ? 'Gradle 8.7 не работает на Java 22+. Поставьте JDK 17 в пакетном менеджере.'
        : (res.error || res.stderr || 'Команда завершилась с ошибкой')),
  };
}

const CHECKERS = {
  node: () => checkCommand('node', ['-v']),
  npm: () => checkCommand(WIN ? 'npm.cmd' : 'npm', ['-v']),
  java: checkJava,
  gradle: checkGradle,
  androidSdk: checkAndroidSdk,
  xcode: checkXcode,
};

async function checkTools(names, opts = {}) {
  const list = Array.isArray(names) && names.length ? names : [...Object.keys(CHECKERS), 'capacitor'];
  const tools = {};
  for (const name of list) {
    if (name === 'capacitor') {
      tools[name] = await checkCapacitor(opts.root);
      continue;
    }
    const fn = CHECKERS[name];
    tools[name] = fn ? await fn() : { ok: false, name, hint: `Неизвестная проверка: ${name}` };
  }
  return { success: true, platform: process.platform, arch: process.arch, root: managedPaths().root, tools };
}

function registerToolchainIpc() {
  try { ipcMain.removeHandler('toolchain-check'); } catch {}
  ipcMain.handle('toolchain-check', async (_event, names, opts) => {
    try {
      return await checkTools(names, opts && typeof opts === 'object' ? opts : {});
    } catch (error) {
      return { success: false, error: error.message, tools: {} };
    }
  });
}

module.exports = {
  checkTools,
  registerToolchainIpc,
  which,
  exec,
  spawnProcess,
  exists,
  buildEnv,
  managedPaths,
  extraBinDirs,
  isManaged,
  resolveJdkHome,
  preferredJdkHome,
  parseJavaMajor,
  resolveSdkRoot,
  sdkLooksReady,
  WIN,
  EXE,
};
