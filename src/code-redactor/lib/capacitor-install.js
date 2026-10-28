/**
 * Локальная установка Capacitor в папку мультиплатформенного проекта.
 * Не собирает APK/IPA - только npm-пакеты и проверка, что CLI появился.
 */
const fs = require('fs');
const path = require('path');
const { ipcMain } = require('electron');
const { which, exec, buildEnv, WIN } = require('./toolchain');

const CAP_PACKAGES = [
  '@capacitor/core',
  '@capacitor/cli',
  '@capacitor/android',
  '@capacitor/ios',
];

const INSTALL_TIMEOUT = 180000;

function npmEnv() {
  const env = buildEnv();
  env.npm_config_fund = 'false';
  env.npm_config_audit = 'false';
  env.npm_config_progress = 'false';
  return env;
}

function installed(root) {
  const core = path.join(root, 'node_modules', '@capacitor', 'core', 'package.json');
  const cli = path.join(root, 'node_modules', '@capacitor', 'cli', 'package.json');
  const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'cap.cmd' : 'cap');
  return { core: fs.existsSync(core), cli: fs.existsSync(cli), bin: fs.existsSync(bin), binPath: bin, corePath: core };
}

async function runNpm(root, args, onLog) {
  const node = await which('node');
  const npm = await which(WIN ? 'npm.cmd' : 'npm') || await which('npm');
  if (!node || !npm) {
    return { ok: false, error: 'Не найден Node.js / npm. Установите их в пакетном менеджере.' };
  }
  const env = npmEnv();
  const res = WIN
    ? await exec(npm, args, { cwd: root, timeout: INSTALL_TIMEOUT, maxBuffer: 8 * 1024 * 1024, env })
    : await exec(node, [npm, ...args], { cwd: root, timeout: INSTALL_TIMEOUT, maxBuffer: 8 * 1024 * 1024, env });
  const text = [res.stdout, res.stderr].filter(Boolean).join('\n');
  if (text && onLog) onLog(text.slice(-1500));
  return { ...res, node, npm };
}

async function installCapacitor(root, onLog) {
  if (!root) return { success: false, error: 'Папка проекта не задана' };
  if (!fs.existsSync(path.join(root, 'package.json'))) {
    return { success: false, error: 'В проекте нет package.json' };
  }

  const already = installed(root);
  if (already.core && already.cli) {
    return { success: true, skipped: true, path: already.binPath, version: readVersion(already.corePath) };
  }

  const args = ['install', ...CAP_PACKAGES, '--save', '--no-fund', '--no-audit', '--no-progress'];
  const res = await runNpm(root, args, onLog);
  if (res.error && !res.ok && res.error.includes('Не найден')) {
    return { success: false, error: res.error };
  }

  const after = installed(root);
  if (!after.core || !after.cli) {
    const detail = firstUseful(res.stderr, res.stdout, res.error) || 'npm install не поставил @capacitor/core';
    return { success: false, error: res.error === 'timeout' ? 'npm install не уложился в 3 минуты' : detail };
  }

  return {
    success: true,
    path: after.binPath,
    version: readVersion(after.corePath),
    log: [res.stdout, res.stderr].filter(Boolean).join('\n').slice(-1500),
  };
}

function readVersion(pkgPath) {
  try { return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || null; } catch { return null; }
}

function firstUseful(...parts) {
  for (const part of parts) {
    const text = String(part || '').trim();
    if (text) return text.split(/\r?\n/).filter(Boolean).slice(-6).join('\n');
  }
  return '';
}

async function uninstallCapacitor(root, onLog) {
  if (!root) return { success: false, error: 'Папка проекта не задана' };
  if (!fs.existsSync(path.join(root, 'package.json'))) {
    return { success: false, error: 'В проекте нет package.json' };
  }
  const before = installed(root);
  if (!before.core && !before.cli) {
    return { success: true, skipped: true };
  }
  const args = ['uninstall', ...CAP_PACKAGES, '--save', '--no-fund', '--no-audit', '--no-progress'];
  const res = await runNpm(root, args, onLog);
  const after = installed(root);
  if (after.core || after.cli) {
    return { success: false, error: firstUseful(res.stderr, res.stdout, res.error) || 'npm uninstall не снял Capacitor' };
  }
  return { success: true, log: [res.stdout, res.stderr].filter(Boolean).join('\n').slice(-1500) };
}

function registerCapacitorIpc() {
  try { ipcMain.removeHandler('capacitor-install'); } catch {}
  try { ipcMain.removeHandler('capacitor-uninstall'); } catch {}
  ipcMain.handle('capacitor-install', async (_event, root) => {
    try {
      return await installCapacitor(root);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle('capacitor-uninstall', async (_event, root) => {
    try {
      return await uninstallCapacitor(root);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  CAP_PACKAGES,
  installCapacitor,
  uninstallCapacitor,
  registerCapacitorIpc,
};
