// GitHub Releases updater for the packaged desktop app.
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { Transform } = require('node:stream');

const REPO = 'ArduRadioKot/Processing-Studio';
const API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES = `https://github.com/${REPO}/releases/latest`;

function compareVersions(left, right) {
  const parts = value => String(value || '').replace(/^v/i, '').split(/[.+-]/).map(part => /^\d+$/.test(part) ? Number(part) : part);
  const a = parts(left), b = parts(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x < y ? -1 : 1;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

function assetVersion(name) {
  const value = String(name || '');
  const match = /^(?:ProcessingStudio-|Processing Studio(?: Setup)?[ -]|processing-studio_)(\d+\.\d+\.\d+)(?:[-_. ]|$)/i.exec(value);
  return match ? match[1] : '';
}

function pickAsset(assets, env) {
  const list = Array.isArray(assets) ? assets : [];
  const arch = env.arch === 'arm64' ? 'arm64' : env.arch === 'ia32' ? 'ia32' : 'x64';
  const current = (platform, ext) => new RegExp(`^ProcessingStudio-\\d+\\.\\d+\\.\\d+-${platform}-${arch}\\.${ext}$`, 'i');
  let patterns = [];
  if (env.platform === 'darwin') {
    patterns = [current('mac', 'dmg'), new RegExp(`^Processing Studio-\\d+\\.\\d+\\.\\d+-${arch}\\.dmg$`, 'i')];
    if (arch === 'x64') patterns.push(/^Processing Studio-\d+\.\d+\.\d+\.dmg$/i);
  } else if (env.platform === 'win32') {
    patterns = [current('win', 'exe')];
    if (arch === 'x64') patterns.push(/^Processing Studio Setup \d+\.\d+\.\d+\.exe$/i);
  } else if (env.platform === 'linux') {
    patterns = env.appImage
      ? [current('linux', 'AppImage')]
      : [current('linux', 'deb')];
    if (arch === 'x64') patterns.push(env.appImage
      ? /^Processing Studio-\d+\.\d+\.\d+\.AppImage$/i
      : /^processing-studio_\d+\.\d+\.\d+_amd64\.deb$/i);
  }
  const candidates = list.filter(asset => asset && patterns.some(pattern => pattern.test(String(asset.name || ''))));
  candidates.sort((a, b) => compareVersions(assetVersion(b.name), assetVersion(a.name)));
  return candidates[0] || null;
}

function installPlan(env, asset) {
  const name = String(asset?.name || '');
  if (!name) return 'manual';
  if (env.platform === 'darwin' && /\.dmg$/i.test(name)) return 'mac';
  if (env.platform === 'win32' && /\.exe$/i.test(name)) return 'windows';
  if (env.platform === 'linux' && env.appImage && /\.AppImage$/i.test(name)) return 'appimage';
  return 'manual';
}

function describeRelease(release, current, env) {
  const asset = pickAsset(release?.assets, env);
  const versions = (release?.assets || []).map(item => assetVersion(item.name)).filter(Boolean);
  const latest = assetVersion(asset?.name) || versions.sort(compareVersions).at(-1) || String(release?.tag_name || '').replace(/^v/i, '');
  return {
    current: String(current), latest,
    available: !!latest && compareVersions(latest, current) > 0,
    notes: String(release?.body || '').trim().slice(0, 2000),
    url: RELEASES,
    asset,
    mode: asset ? installPlan(env, asset) : 'manual'
  };
}

function allowedHost(hostname) {
  return hostname === 'api.github.com' || hostname === 'github.com' || hostname.endsWith('.githubusercontent.com');
}

function request(url, headers, redirects = 0) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(url); } catch { reject(new Error('Недопустимый адрес обновления')); return; }
    if (target.protocol !== 'https:' || !allowedHost(target.hostname)) {
      reject(new Error('Недопустимый адрес обновления')); return;
    }
    const req = https.get(target, { headers }, res => {
      const code = res.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        res.resume();
        if (redirects >= 5) { reject(new Error('Слишком много перенаправлений')); return; }
        resolve(request(new URL(res.headers.location, target).href, headers, redirects + 1));
        return;
      }
      resolve(res);
    });
    req.setTimeout(30000, () => req.destroy(new Error('Превышено время ожидания GitHub')));
    req.on('error', reject);
  });
}

async function readJson(res) {
  const chunks = [];
  let length = 0;
  for await (const chunk of res) {
    length += chunk.length;
    if (length > 2 * 1024 * 1024) throw new Error('Слишком большой ответ GitHub');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function safeName(name) {
  const value = String(name || '');
  return /^[A-Za-z0-9._ -]{1,180}$/.test(value) && path.basename(value) === value ? value : '';
}

function launch(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', env: { ...process.env, ...env } });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

function exec(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}

async function installMac(file, tempDir) {
  const target = path.resolve(process.execPath, '../../..');
  if (!target.endsWith('.app')) throw new Error('Не удалось найти установленное приложение');
  const mount = fs.mkdtempSync(path.join(tempDir, 'mount-'));
  try { await exec('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, file]); }
  catch { fs.rmSync(mount, { recursive: true, force: true }); throw new Error('Не удалось открыть образ обновления'); }
  const source = fs.readdirSync(mount).map(name => path.join(mount, name)).find(item => item.endsWith('.app'));
  if (!source) {
    await exec('hdiutil', ['detach', mount]).catch(() => {});
    throw new Error('В образе нет приложения');
  }
  const script = [
    'while kill -0 "$PS_UPDATE_PID" 2>/dev/null; do sleep 0.3; done',
    'rm -rf "$PS_UPDATE_STAGE"',
    'if ! cp -R "$PS_UPDATE_SOURCE" "$PS_UPDATE_STAGE"; then open "$PS_UPDATE_DMG"; exit 1; fi',
    'rm -rf "$PS_UPDATE_BACKUP"',
    'if ! mv "$PS_UPDATE_TARGET" "$PS_UPDATE_BACKUP"; then open "$PS_UPDATE_DMG"; exit 1; fi',
    'if ! mv "$PS_UPDATE_STAGE" "$PS_UPDATE_TARGET"; then mv "$PS_UPDATE_BACKUP" "$PS_UPDATE_TARGET"; open "$PS_UPDATE_DMG"; exit 1; fi',
    'rm -rf "$PS_UPDATE_BACKUP"',
    'hdiutil detach "$PS_UPDATE_MOUNT" >/dev/null 2>&1 || true',
    'open "$PS_UPDATE_TARGET"'
  ].join('\n');
  const scriptPath = path.join(tempDir, 'install-mac.sh');
  fs.writeFileSync(scriptPath, script, { mode: 0o700 });
  await launch('sh', [scriptPath], {
    PS_UPDATE_PID: String(process.pid), PS_UPDATE_SOURCE: source, PS_UPDATE_MOUNT: mount,
    PS_UPDATE_DMG: file, PS_UPDATE_TARGET: target,
    PS_UPDATE_STAGE: target + '.new', PS_UPDATE_BACKUP: target + '.previous'
  });
}

async function installWindows(file) {
  const script = [
    '$pidToWait = [int]$env:PS_UPDATE_PID',
    'while (Get-Process -Id $pidToWait -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 400 }',
    'Start-Process -FilePath $env:PS_UPDATE_FILE -Wait',
    'Start-Process -FilePath $env:PS_UPDATE_APP'
  ].join('; ');
  await launch('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
    PS_UPDATE_PID: String(process.pid), PS_UPDATE_FILE: file, PS_UPDATE_APP: process.execPath
  });
}

async function installAppImage(file, tempDir) {
  const current = process.env.APPIMAGE;
  if (!current) throw new Error('Приложение запущено не как AppImage');
  fs.accessSync(path.dirname(current), fs.constants.W_OK);
  const script = [
    'while kill -0 "$PS_UPDATE_PID" 2>/dev/null; do sleep 0.3; done',
    'rm -f "$PS_UPDATE_STAGE"',
    'if ! cp "$PS_UPDATE_FILE" "$PS_UPDATE_STAGE"; then rm -f "$PS_UPDATE_STAGE"; exit 1; fi',
    'chmod +x "$PS_UPDATE_STAGE"',
    'rm -f "$PS_UPDATE_BACKUP"',
    'if ! mv "$PS_UPDATE_APP" "$PS_UPDATE_BACKUP"; then rm -f "$PS_UPDATE_STAGE"; exit 1; fi',
    'if ! mv "$PS_UPDATE_STAGE" "$PS_UPDATE_APP"; then mv "$PS_UPDATE_BACKUP" "$PS_UPDATE_APP"; exit 1; fi',
    'rm -f "$PS_UPDATE_BACKUP"',
    '"$PS_UPDATE_APP" >/dev/null 2>&1 &'
  ].join('\n');
  const scriptPath = path.join(tempDir, 'install-appimage.sh');
  fs.writeFileSync(scriptPath, script, { mode: 0o700 });
  await launch('sh', [scriptPath], {
    PS_UPDATE_PID: String(process.pid), PS_UPDATE_FILE: file, PS_UPDATE_APP: current,
    PS_UPDATE_STAGE: current + '.new', PS_UPDATE_BACKUP: current + '.previous'
  });
}

function registerUpdaterIpc(ipcMain, { app, BrowserWindow, shell }) {
  const headers = { 'User-Agent': `ProcessingStudio/${app.getVersion()}`, Accept: 'application/vnd.github+json', 'Accept-Encoding': 'identity' };
  let pending = null;
  let checking = null;
  let downloading = null;
  const runtime = () => ({
    platform: process.platform,
    arch: process.platform === 'darwin' && app.runningUnderARM64Translation ? 'arm64' : process.arch,
    appImage: !!process.env.APPIMAGE
  });
  const tempDir = () => path.join(app.getPath('temp'), 'processing-studio-update');
  const sendProgress = progress => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('updates-progress', progress);
    }
  };
  function publicInfo() {
    if (!pending) return { ok: false, error: 'Обновления ещё не проверены' };
    const { info, asset } = pending;
    return {
      ok: true, current: info.current, latest: info.latest, available: info.available,
      notes: info.notes, url: info.url, packaged: app.isPackaged, mode: info.mode,
      asset: asset ? { name: asset.name, size: asset.size } : null
    };
  }
  async function check() {
    if (checking) return checking;
    if (downloading && pending) return publicInfo();
    checking = (async () => {
      const res = await request(API, headers);
      if (res.statusCode !== 200) {
        res.resume();
        throw new Error(res.statusCode === 403 ? 'GitHub временно ограничил запросы' : 'Не удалось получить список релизов');
      }
      const release = await readJson(res);
      const info = describeRelease(release, app.getVersion(), runtime());
      const asset = info.asset && {
        name: info.asset.name, size: Number(info.asset.size) || 0,
        url: info.asset.browser_download_url, digest: String(info.asset.digest || '')
      };
      pending = { info, asset, file: null };
      return publicInfo();
    })();
    try { return await checking; } finally { checking = null; }
  }
  async function download() {
    if (downloading) return downloading;
    downloading = (async () => {
      if (checking) await checking;
      if (!pending) await check();
      const update = pending;
      if (!update.info.available) return { ok: false, error: 'Установлена последняя версия' };
      if (update.file && fs.existsSync(update.file)) {
        return { ok: true, name: path.basename(update.file), size: fs.statSync(update.file).size };
      }
      const asset = update.asset;
      if (!asset?.url) return { ok: false, error: 'Для этой системы нет файла в релизе' };
      const name = safeName(asset.name);
      if (!name) return { ok: false, error: 'Недопустимое имя файла обновления' };
      const dir = tempDir();
      fs.mkdirSync(dir, { recursive: true });
      const part = path.join(dir, `${name}.${crypto.randomBytes(6).toString('hex')}.part`);
      const final = path.join(dir, name);
      const res = await request(asset.url, { ...headers, Accept: 'application/octet-stream' });
      if (res.statusCode !== 200) { res.resume(); throw new Error('Не удалось скачать файл обновления'); }
      const total = asset.size || Number(res.headers['content-length']) || 0;
      let received = 0;
      let lastProgress = 0;
      const hash = crypto.createHash('sha256');
      const progress = new Transform({ transform(chunk, _encoding, done) {
        received += chunk.length;
        hash.update(chunk);
        const now = Date.now();
        if (now - lastProgress > 150 || (total && received >= total)) {
          sendProgress({ received, total });
          lastProgress = now;
        }
        done(null, chunk);
      } });
      try {
        await pipeline(res, progress, fs.createWriteStream(part));
        const expected = /^sha256:([a-f0-9]{64})$/i.exec(asset.digest)?.[1];
        if (expected && hash.digest('hex').toLowerCase() !== expected.toLowerCase()) throw new Error('Контрольная сумма обновления не совпала');
        if (total && received !== total) throw new Error('Файл обновления скачан не полностью');
        fs.rmSync(final, { force: true });
        fs.renameSync(part, final);
        update.file = final;
        return { ok: true, name, size: received };
      } catch (error) {
        fs.rmSync(part, { force: true });
        throw error;
      }
    })();
    try { return await downloading; } finally { downloading = null; }
  }

  ipcMain.handle('updates-info', () => ({ ok: true, current: app.getVersion(), packaged: app.isPackaged, url: RELEASES }));
  ipcMain.handle('updates-check', async () => { try { return await check(); } catch (error) { return { ok: false, error: error.message || 'Не удалось проверить обновления' }; } });
  ipcMain.handle('updates-download', async () => { try { return await download(); } catch (error) { return { ok: false, error: error.message || 'Не удалось скачать обновление' }; } });
  ipcMain.handle('updates-install', async () => {
    try {
      if (!app.isPackaged) return { ok: false, error: 'Установка доступна в собранном приложении' };
      if (!pending?.file || !fs.existsSync(pending.file)) return { ok: false, error: 'Сначала скачайте обновление' };
      const plan = pending.info.mode;
      if (plan === 'manual') {
        shell.showItemInFolder(pending.file);
        return { ok: true, mode: 'manual', message: 'Файл скачан. Установите его вручную.' };
      }
      if (plan === 'mac') await installMac(pending.file, tempDir());
      else if (plan === 'windows') await installWindows(pending.file);
      else if (plan === 'appimage') await installAppImage(pending.file, tempDir());
      setImmediate(() => app.quit());
      return { ok: true, mode: 'restart' };
    } catch (error) {
      return { ok: false, error: error.message || 'Не удалось установить обновление' };
    }
  });
}

module.exports = { compareVersions, assetVersion, pickAsset, installPlan, describeRelease, safeName, registerUpdaterIpc };
