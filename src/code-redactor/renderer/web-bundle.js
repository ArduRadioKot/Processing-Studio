/**
 * Упаковка скетча в www/index.html тем же рантаймом, что в эмуляторе.
 */
import { createProcessingRuntime } from './device-runtime.js';
import { transpileProcessing } from './device-transpile.js';
import { joinPath } from './android-project.js';

export function transpileFiles(files) {
  const parts = [];
  const warnings = [];
  (files || []).forEach((file, index) => {
    const result = transpileProcessing(file.code || '');
    if (result.warnings?.length) warnings.push(...result.warnings);
    let part = result.code || '';
    if (index > 0) part = part.replace(/^(\s*)function (setup|draw)\s*\(/gm, '$1function $2__$3(');
    parts.push(part);
  });
  return { code: parts.join('\n'), warnings, mode: 'processing' };
}

export function buildWebIndex({ title, sketchCode, packageName }) {
  const runtimeSrc = createProcessingRuntime.toString();
  const payload = JSON.stringify(`${sketchCode}\n//# sourceURL=sketch.pde\n`).replace(/<\//g, '<\\/');
  const name = String(title || 'Sketch').replace(/[<>]/g, '');
  const pkg = JSON.stringify(packageName || 'com.example.sketch');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
  <title>${name}</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #111; }
    canvas { display: block; }
  </style>
</head>
<body>
<script>
(function () {
  var w = Math.max(320, window.innerWidth || 390);
  var h = Math.max(320, window.innerHeight || 844);
  window.__frogee = (${runtimeSrc})({
    width: w,
    height: h,
    dpr: window.devicePixelRatio || 2,
    packageName: ${pkg},
    showTouches: false
  });
  window.__frogee.install();
  try { (0, eval)(${payload}); } catch (err) { window.__frogee.__report(err); }
  window.__frogee.start();
}());
</script>
</body>
</html>
`;
}

export async function writeWebBundle({ root, files, settings }) {
  if (!root) return { ok: false, error: 'Проект не открыт' };
  const translated = transpileFiles(files);
  if (!translated.code.trim()) return { ok: false, error: 'Скетч пуст', warnings: translated.warnings };
  const html = buildWebIndex({
    title: settings?.name || 'Sketch',
    sketchCode: translated.code,
    packageName: settings?.packageName,
  });
  const dest = joinPath(root, 'www/index.html');
  const res = await window.electronAPI?.writeFile?.(dest, html);
  if (!res?.success) return { ok: false, error: res?.error || 'Не удалось записать www/index.html' };
  return { ok: true, path: dest, warnings: translated.warnings, mode: translated.mode };
}
