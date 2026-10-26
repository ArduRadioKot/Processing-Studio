/** Regenerate desktop and website icons from the supplied assets/logoP.png. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'make-icon.py');
const candidates = process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python'];
let result;
for (const python of candidates) {
  result = spawnSync(python, [script], { stdio: 'inherit' });
  if (!result.error || result.error.code !== 'ENOENT') break;
}
if (result?.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result?.status ?? 1);
