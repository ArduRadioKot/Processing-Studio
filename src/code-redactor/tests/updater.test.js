const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, assetVersion, pickAsset, installPlan, describeRelease, safeName } = require('../lib/updater');

const assets = [
  { name: 'ProcessingStudio-4.4.0-linux-x64.AppImage', size: 624592273 },
  { name: 'ProcessingStudio-4.4.0-linux-x64.deb', size: 622285308 },
  { name: 'ProcessingStudio-4.4.0-mac-arm64.dmg', size: 750326480 },
  { name: 'ProcessingStudio-4.4.0-mac-x64.dmg', size: 752784986 },
  { name: 'ProcessingStudio-4.4.0-win-x64.exe', size: 691821325 },
];

test('versions and current GitHub release naming', () => {
  assert.equal(compareVersions('4.4.0', '4.3.9'), 1);
  assert.equal(compareVersions('v4.4.0', '4.4.0'), 0);
  assert.equal(compareVersions('4.9.0', '4.10.0'), -1);
  assert.equal(assetVersion(assets[2].name), '4.4.0');
  const release = { tag_name: 'v4.0.0', body: 'Изменения', assets };
  const info = describeRelease(release, '4.4.0', { platform: 'darwin', arch: 'arm64' });
  assert.equal(info.latest, '4.4.0');
  assert.equal(info.available, false);
  assert.equal(describeRelease(release, '4.3.0', { platform: 'darwin', arch: 'arm64' }).available, true);
});

test('selects the package matching the running platform', () => {
  assert.equal(pickAsset(assets, { platform: 'darwin', arch: 'arm64' }).name, assets[2].name);
  assert.equal(pickAsset(assets, { platform: 'darwin', arch: 'x64' }).name, assets[3].name);
  assert.equal(pickAsset(assets, { platform: 'win32', arch: 'x64' }).name, assets[4].name);
  assert.equal(pickAsset(assets, { platform: 'linux', arch: 'x64', appImage: true }).name, assets[0].name);
  assert.equal(pickAsset(assets, { platform: 'linux', arch: 'x64', appImage: false }).name, assets[1].name);
  assert.equal(pickAsset(assets, { platform: 'win32', arch: 'arm64' }), null);
});

test('automatic installation is limited to supported package formats', () => {
  assert.equal(installPlan({ platform: 'darwin' }, assets[2]), 'mac');
  assert.equal(installPlan({ platform: 'win32' }, assets[4]), 'windows');
  assert.equal(installPlan({ platform: 'linux', appImage: true }, assets[0]), 'appimage');
  assert.equal(installPlan({ platform: 'linux', appImage: false }, assets[1]), 'manual');
});

test('accepts the original electron-builder artifact names', () => {
  const built = [
    { name: 'Processing Studio Setup 4.5.0.exe' },
    { name: 'Processing Studio-4.5.0-arm64.dmg' },
    { name: 'Processing Studio-4.5.0.dmg' },
    { name: 'Processing Studio-4.5.0.AppImage' },
    { name: 'processing-studio_4.5.0_amd64.deb' },
  ];
  assert.equal(pickAsset(built, { platform: 'win32', arch: 'x64' }).name, built[0].name);
  assert.equal(pickAsset(built, { platform: 'darwin', arch: 'arm64' }).name, built[1].name);
  assert.equal(pickAsset(built, { platform: 'darwin', arch: 'x64' }).name, built[2].name);
  assert.equal(pickAsset(built, { platform: 'linux', arch: 'x64', appImage: true }).name, built[3].name);
  assert.equal(pickAsset(built, { platform: 'linux', arch: 'x64', appImage: false }).name, built[4].name);
  assert.equal(assetVersion(built[0].name), '4.5.0');
  assert.equal(assetVersion(built[4].name), '4.5.0');
  assert.equal(safeName(built[0].name), built[0].name);
  assert.equal(safeName('../Processing Studio Setup 4.5.0.exe'), '');
});

test('chooses the newest compatible asset within one release', () => {
  const mixed = [
    { name: 'ProcessingStudio-4.4.0-win-x64.exe' },
    { name: 'Processing Studio Setup 4.5.0.exe' },
    { name: 'ProcessingStudio-4.4.0-mac-arm64.dmg' },
    { name: 'Processing Studio-4.5.0-arm64.dmg' },
  ];
  assert.equal(pickAsset(mixed, { platform: 'win32', arch: 'x64' }).name, mixed[1].name);
  assert.equal(pickAsset(mixed, { platform: 'darwin', arch: 'arm64' }).name, mixed[3].name);
});

test('downloads a release asset and rejects a bad SHA-256 digest', async () => {
  const https = require('node:https');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const { PassThrough } = require('node:stream');
  const { EventEmitter } = require('node:events');
  const { registerUpdaterIpc } = require('../lib/updater');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'processing-updater-test-'));
  const originalGet = https.get;
  const name = process.platform === 'darwin' ? `ProcessingStudio-4.5.0-mac-${process.arch}.dmg`
    : process.platform === 'win32' ? `ProcessingStudio-4.5.0-win-${process.arch}.exe`
    : 'ProcessingStudio-4.5.0-linux-x64.deb';
  const data = Buffer.from('small test package');
  let digest = `sha256:${crypto.createHash('sha256').update(data).digest('hex')}`;
  https.get = (target, _options, callback) => {
    const request = new EventEmitter();
    request.setTimeout = () => {};
    request.destroy = error => request.emit('error', error);
    process.nextTick(() => {
      const isApi = String(target).includes('/releases/latest');
      const payload = isApi ? Buffer.from(JSON.stringify({
        tag_name: 'v4.0.0',
        assets: [{ name, size: data.length, digest, browser_download_url: `https://github.com/ArduRadioKot/Processing-Studio/releases/download/v4.5.0/${name}` }]
      })) : data;
      const response = new PassThrough();
      response.statusCode = 200;
      response.headers = { 'content-length': String(payload.length) };
      callback(response);
      response.end(payload);
    });
    return request;
  };
  const app = { getVersion: () => '4.4.0', isPackaged: false, getPath: () => temp, runningUnderARM64Translation: false };
  const makeHandlers = () => {
    const handlers = new Map();
    registerUpdaterIpc({ handle: (key, handler) => handlers.set(key, handler) }, {
      app, BrowserWindow: { getAllWindows: () => [] }, shell: { showItemInFolder: () => {} }
    });
    return handlers;
  };
  try {
    const good = makeHandlers();
    const release = await good.get('updates-check')();
    assert.equal(release.ok, true);
    assert.equal(release.latest, '4.5.0');
    const downloaded = await good.get('updates-download')();
    assert.equal(downloaded.ok, true);
    assert.deepEqual(fs.readFileSync(path.join(temp, 'processing-studio-update', name)), data);

    fs.rmSync(path.join(temp, 'processing-studio-update', name));
    digest = `sha256:${'0'.repeat(64)}`;
    const bad = makeHandlers();
    await bad.get('updates-check')();
    const rejected = await bad.get('updates-download')();
    assert.equal(rejected.ok, false);
    assert.match(rejected.error, /Контрольная сумма/);
    assert.equal(fs.existsSync(path.join(temp, 'processing-studio-update', name)), false);
  } finally {
    https.get = originalGet;
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
