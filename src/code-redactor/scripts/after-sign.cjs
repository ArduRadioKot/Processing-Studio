const { execFileSync } = require('node:child_process');
const path = require('node:path');

/** Keep macOS packages verifiably signed before DMG/ZIP creation. */
module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const verify = () => execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' });
  try {
    verify();
  } catch {
    console.warn('macOS signing verification failed; applying a valid local ad hoc signature');
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
    verify();
  }
};
