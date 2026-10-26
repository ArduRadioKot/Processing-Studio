/**
 * Состав установщика сборки: JDK 17, Gradle, Node, Android SDK 34.
 * Архивы кладутся в vendor/toolchain/<os>-<arch>/ и в extraResources пакета.
 */
const fs = require('fs');
const path = require('path');

const GRADLE_VERSION = '8.7';
const NODE_VERSION = '20.18.2';

const BUILD_IDS = ['java', 'gradle', 'androidSdk', 'node'];

const CMDTOOLS = {
  darwin: 'https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip',
  win32: 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip',
  linux: 'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip',
};

const BUILD_TOOLS = {
  darwin: 'https://dl.google.com/android/repository/build-tools_r34-macosx.zip',
  win32: 'https://dl.google.com/android/repository/build-tools_r34-windows.zip',
  linux: 'https://dl.google.com/android/repository/build-tools_r34-linux.zip',
};

const PLATFORM_TOOLS = {
  darwin: 'https://dl.google.com/android/repository/platform-tools-latest-darwin.zip',
  win32: 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
  linux: 'https://dl.google.com/android/repository/platform-tools-latest-linux.zip',
};

function builderOs(platform = process.platform) {
  if (platform === 'darwin') return 'mac';
  if (platform === 'win32') return 'win';
  return 'linux';
}

function nodePlatform(osKey) {
  if (osKey === 'mac' || osKey === 'darwin') return 'darwin';
  if (osKey === 'win' || osKey === 'win32' || osKey === 'windows') return 'win32';
  return 'linux';
}

function toolchainPackages({ platform, arch } = {}) {
  const plat = platform || process.platform;
  const cpu = arch || process.arch;
  const win = plat === 'win32';
  const jdkOs = plat === 'darwin' ? 'mac' : (win ? 'windows' : 'linux');
  const jdkArch = cpu === 'arm64' ? 'aarch64' : 'x64';
  const nodeArch = cpu === 'arm64' ? 'arm64' : 'x64';
  const nodeOs = plat === 'darwin' ? 'darwin' : (win ? 'win' : 'linux');
  return [
    {
      id: 'jdk',
      file: win ? 'jdk.zip' : 'jdk.tar.gz',
      urls: [`https://api.adoptium.net/v3/binary/latest/17/ga/${jdkOs}/${jdkArch}/jdk/hotspot/normal/eclipse?project=jdk`],
    },
    {
      id: 'gradle',
      file: 'gradle.zip',
      urls: [`https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`],
    },
    {
      id: 'node',
      file: win ? 'node.zip' : 'node.tar.gz',
      urls: win
        ? [`https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-${nodeArch}.zip`]
        : [`https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${nodeOs}-${nodeArch}.tar.gz`],
    },
    {
      id: 'cmdlineTools',
      file: 'commandlinetools.zip',
      urls: [CMDTOOLS[plat] || CMDTOOLS.linux],
    },
    {
      id: 'platform34',
      file: 'platform-34.zip',
      urls: [
        'https://dl.google.com/android/repository/platform-34-ext7_r03.zip',
        'https://dl.google.com/android/repository/platform-34_r03.zip',
      ],
    },
    {
      id: 'buildTools',
      file: 'build-tools.zip',
      urls: [BUILD_TOOLS[plat] || BUILD_TOOLS.linux],
    },
    {
      id: 'platformTools',
      file: 'platform-tools.zip',
      urls: [PLATFORM_TOOLS[plat] || PLATFORM_TOOLS.linux],
    },
  ];
}

function bundledToolchainDir() {
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) return path.join(process.resourcesPath, 'toolchain');
  } catch { /* не Electron */ }
  return path.join(__dirname, '..', 'vendor', 'toolchain', `${builderOs()}-${process.arch}`);
}

function listDir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function readManifest(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

function bundledStatus() {
  const root = bundledToolchainDir();
  if (!exists(root)) return { present: false, root: null, files: [] };
  const files = listDir(root).filter((n) => n !== '.' && n !== '..');
  return { present: files.length > 0, root, files, offline: files.some((n) => n !== 'manifest.json') };
}

function bundledArchive(id) {
  const root = bundledToolchainDir();
  if (!exists(root)) return null;
  const manifest = readManifest(root);
  const named = manifest?.files?.[id];
  const candidates = [
    named && path.join(root, named),
    path.join(root, `${id}.zip`),
    path.join(root, `${id}.tar.gz`),
  ].filter(Boolean);
  const pkg = toolchainPackages().find((item) => item.id === id);
  if (pkg) candidates.push(path.join(root, pkg.file));
  return candidates.find((file) => exists(file) && fs.statSync(file).size > 64) || null;
}

function writeSdkLicenses(sdkRoot) {
  const dir = path.join(sdkRoot, 'licenses');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'android-sdk-license'), [
    '',
    '8933bad161af4178b1185d1a37fbf41ea5269c55',
    'd56f5187479451eabf01fb78af6dfcb131a6481e',
    '24333f8a63b6825ea9c5514f83c2829b004d1dc9',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(dir, 'android-sdk-preview-license'), '84831b9409646161da1e6533090b20e6f96554cb\n');
}

function findDirWith(root, probe) {
  const queue = [root];
  while (queue.length) {
    const dir = queue.shift();
    if (exists(path.join(dir, probe))) return dir;
    for (const name of listDir(dir)) {
      if (name === '__MACOSX') continue;
      const next = path.join(dir, name);
      try {
        if (fs.statSync(next).isDirectory()) queue.push(next);
      } catch { /* ignore */ }
    }
  }
  return null;
}

module.exports = {
  GRADLE_VERSION,
  NODE_VERSION,
  BUILD_IDS,
  CMDTOOLS,
  toolchainPackages,
  builderOs,
  nodePlatform,
  bundledToolchainDir,
  bundledStatus,
  bundledArchive,
  writeSdkLicenses,
  findDirWith,
};
