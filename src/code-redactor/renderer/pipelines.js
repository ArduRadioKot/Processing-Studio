/**
 * Пайплайны Processing2Android (Gradle APK) и Processing2Web (www + Capacitor).
 */

import { state } from './state.js';
import { transpileProcessing } from './device-transpile.js';
import { exportAndroidProject, defaultSettingsFor } from './android-project.js';
import { PAPPLET_JAVA, PVECTOR_JAVA, PFONT_JAVA, JSONOBJECT_JAVA, ADAPTIVE_UI_JAVA } from './android-runtime.js';
import {
  KIND_ANDROID, KIND_MULTI, STACK_ANDROID, STACK_WEB,
  TARGET_ANDROID, TARGET_IOS, TARGET_WEB,
  resolveKind, toolsFor, TARGET_LABELS,
} from './project-model.js';
import { writeWebBundle } from './web-bundle.js';

const RUNTIME = { pApplet: PAPPLET_JAVA, pVector: PVECTOR_JAVA, pFont: PFONT_JAVA, json: JSONOBJECT_JAVA, adaptiveUi: ADAPTIVE_UI_JAVA };

function fail(code, error, extra = {}) {
  return { ok: false, implemented: false, code, error, ...extra };
}

function ok(extra = {}) {
  return { ok: true, implemented: true, ...extra };
}

export async function checkToolchain(names) {
  const res = await window.electronAPI?.toolchainCheck?.(names, {
    root: state.projectRoot || state.currentFolder,
  });
  if (!res?.success) {
    return { success: false, error: res?.error || 'Не удалось проверить инструменты', tools: {} };
  }
  return res;
}

export async function collectSketchFiles(root, sketchName) {
  const files = [];
  const seen = new Set();
  const add = async (name, filePath) => {
    const key = filePath || name;
    if (seen.has(key)) return;
    seen.add(key);
    const res = filePath ? await window.electronAPI?.getFileContent?.(filePath) : null;
    files.push({ name, path: filePath || null, code: res?.success ? res.content : '' });
  };
  if (!root) return files;
  const listed = await window.electronAPI?.listFiles?.(root);
  const pdes = (listed?.files || []).filter((f) => !f.isDirectory && /\.pde$/i.test(f.name));
  const preferred = sketchName && pdes.find((f) => f.name === sketchName);
  if (preferred) await add(preferred.name, preferred.path);
  for (const file of pdes) await add(file.name, file.path);
  return files;
}

async function requireSketch(root, settings) {
  const files = await collectSketchFiles(root, settings?.sketch);
  if (!files.length) return { files, error: 'В проекте нет файлов .pde' };
  return { files, error: null };
}

const androidPipeline = {
  id: STACK_ANDROID,
  kind: KIND_ANDROID,
  label: 'Processing2Android',
  targets: [TARGET_ANDROID],

  tools(target) {
    return toolsFor(KIND_ANDROID, target || TARGET_ANDROID);
  },

  async preview() {
    const { showDevicePanel, runCurrentSketch } = await import('./device-emulator.js');
    showDevicePanel();
    await runCurrentSketch();
    return ok({ action: 'preview' });
  },

  async run({ target } = {}) {
    return fail(
      'not-implemented',
      `Запуск на устройстве (${TARGET_LABELS[target || TARGET_ANDROID]}) пока не реализован. Соберите APK и установите его через adb, либо откройте проект в Android Studio.`,
    );
  },

  async build({ root, settings, files } = {}) {
    const sketchName = settings?.sketch || files?.[0]?.name || 'sketch.pde';
    const exported = await exportAndroidProject({
      root,
      sketchSource: files,
      sketchName,
      settings,
      runtime: RUNTIME,
    });
    if (!exported.ok) return fail('export', exported.error || 'Не удалось экспортировать Gradle-проект');
    const packed = await window.electronAPI?.builderRun?.({
      kind: KIND_ANDROID,
      stack: STACK_ANDROID,
      target: TARGET_ANDROID,
      root,
    });
    if (!packed?.success && !packed?.ok) {
      return fail('build', packed?.error || 'Gradle assembleDebug не удался', { path: exported.path });
    }
    return ok({
      action: 'build',
      path: packed.artifact || packed.path || exported.path,
      exportPath: exported.path,
    });
  },

  async exportProject({ root, settings, files }) {
    const sketchName = settings?.sketch || files[0]?.name || 'sketch.pde';
    return exportAndroidProject({
      root,
      sketchSource: files,
      sketchName,
      settings,
      runtime: RUNTIME,
    });
  },
};

const webPipeline = {
  id: STACK_WEB,
  kind: KIND_MULTI,
  label: 'Processing2Web',
  targets: [TARGET_WEB, TARGET_ANDROID, TARGET_IOS],

  tools(target) {
    return toolsFor(KIND_MULTI, target || TARGET_WEB);
  },

  async preview() {
    const { showDevicePanel, runCurrentSketch } = await import('./device-emulator.js');
    showDevicePanel();
    await runCurrentSketch();
    return ok({ action: 'preview' });
  },

  async transpile(files) {
    const source = (files || []).map((f) => f.code || '').join('\n');
    const result = transpileProcessing(source);
    if (!result.code && result.warnings?.length) {
      return fail('transpile', result.warnings.join('\n'), { warnings: result.warnings, mode: result.mode });
    }
    return ok({
      action: 'transpile',
      code: result.code,
      mode: result.mode,
      warnings: result.warnings || [],
    });
  },

  async run({ target } = {}) {
    const label = TARGET_LABELS[target || TARGET_WEB] || target;
    if (target === TARGET_WEB) {
      return fail('not-implemented', `Запуск Web в браузере пока не подключён. Соберите проект - результат в www/.`);
    }
    return fail('not-implemented', `Запуск ${label} на устройстве пока не реализован. Соберите проект и откройте его в Android Studio / Xcode.`);
  },

  async build({ target, files, settings, root } = {}) {
    const dest = target || TARGET_WEB;
    const bundled = await writeWebBundle({ root, files, settings });
    if (!bundled.ok) return fail('transpile', bundled.error || 'Не удалось записать www/', { warnings: bundled.warnings });
    const packed = await window.electronAPI?.builderRun?.({
      kind: KIND_MULTI,
      stack: STACK_WEB,
      target: dest,
      root,
    });
    if (!packed?.success && !packed?.ok) {
      return fail('build', packed?.error || `Сборка ${TARGET_LABELS[dest] || dest} не удалась`, {
        path: bundled.path,
        warnings: bundled.warnings,
      });
    }
    return ok({
      action: 'build',
      path: packed.artifact || packed.path || bundled.path,
      warnings: bundled.warnings,
      note: packed.note,
    });
  },

  async exportProject({ target, files, settings, root } = {}) {
    const dest = target || TARGET_WEB;
    const bundled = await writeWebBundle({ root, files, settings });
    if (!bundled.ok) return fail('export', bundled.error || 'Не удалось записать www/', { warnings: bundled.warnings });
    if (dest === TARGET_WEB) return ok({ action: 'export', path: bundled.path, warnings: bundled.warnings });
    const packed = await window.electronAPI?.builderRun?.({
      kind: KIND_MULTI,
      stack: STACK_WEB,
      target: dest,
      root,
    });
    if (!packed?.success && !packed?.ok) {
      return fail('export', packed?.error || `Экспорт ${TARGET_LABELS[dest] || dest} не удался`, { path: bundled.path });
    }
    return ok({ action: 'export', path: packed.path || bundled.path, warnings: bundled.warnings, note: packed.note });
  },
};

const PIPELINES = {
  [KIND_ANDROID]: androidPipeline,
  [KIND_MULTI]: webPipeline,
  [STACK_ANDROID]: androidPipeline,
  [STACK_WEB]: webPipeline,
};

export function getPipeline(kindOrStack) {
  return PIPELINES[kindOrStack] || androidPipeline;
}

export function currentPipeline() {
  return getPipeline(state.projectKind || KIND_ANDROID);
}

export function currentTarget() {
  const resolved = resolveKind(state.projectSettings || { kind: state.projectKind, target: state.projectTarget });
  return state.projectTarget || resolved.target;
}

function missingTools(check, names) {
  const tools = check?.tools || {};
  return names.filter((name) => !tools[name]?.ok).map((name) => {
    const item = tools[name];
    return item?.hint ? `${name}: ${item.hint}` : name;
  });
}

/**
 * Единая точка входа: preview | run | build | export.
 */
export async function runPipelineAction(action, { target } = {}) {
  const root = state.projectRoot || state.currentFolder;
  const settings = state.projectSettings;
  const resolved = resolveKind(settings || { kind: state.projectKind, target: state.projectTarget });
  const pipeline = getPipeline(resolved.kind);
  const dest = target || resolved.target || pipeline.targets[0];
  if (!pipeline.targets.includes(dest) && action !== 'preview') {
    return fail('target', `Стек «${pipeline.label}» не собирает ${TARGET_LABELS[dest] || dest}`);
  }

  if (action === 'preview') return pipeline.preview();

  const needed = pipeline.tools(dest);
  const check = await checkToolchain(needed);
  const missing = missingTools(check, needed);
  const ctx = { target: dest, root, settings, tools: check.tools, missing };

  if (action === 'run') return pipeline.run(ctx);

  if (action === 'build' || action === 'export') {
    const { files, error } = await requireSketch(root, settings);
    if (error) return fail('sketch', error);
    const exportSettings = settings || defaultSettingsFor(files[0]?.name || 'sketch.pde');
    const result = action === 'build'
      ? await pipeline.build({ ...ctx, files, settings: exportSettings })
      : await pipeline.exportProject({ ...ctx, files, settings: exportSettings });
    return { ...result, tools: check.tools, missing: result.ok ? [] : missing };
  }

  return fail('action', `Неизвестное действие: ${action}`);
}

export { RUNTIME };
