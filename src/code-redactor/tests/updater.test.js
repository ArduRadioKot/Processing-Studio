const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, assetVersion, pickAsset, installPlan, describeRelease } = require('../lib/updater');

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
