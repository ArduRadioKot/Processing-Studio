/**
 * Тип проекта и стек сборки. Задаются при создании и живут в processing-studio.json.
 * Старые файлы без kind/stack не переписываются: в UI они открываются как Android.
 */

import { state } from './state.js';
import { DEFAULT_SETTINGS, PROJECT_FILE, joinPath, loadProject, saveProject } from './android-project.js';

export const KIND_ANDROID = 'android';
export const KIND_MULTI = 'multiplatform';

export const STACK_ANDROID = 'processing2android';
export const STACK_WEB = 'processing2web';

export const TARGET_ANDROID = 'android';
export const TARGET_IOS = 'ios';
export const TARGET_WEB = 'web';

export const PROJECT_KINDS = {
  [KIND_MULTI]: {
    id: KIND_MULTI,
    label: 'Мультиплатформенный',
    short: 'Android / iOS / Web',
    hint: 'Processing2Web + Capacitor',
    stack: STACK_WEB,
    targets: [TARGET_WEB, TARGET_ANDROID, TARGET_IOS],
    defaultTarget: TARGET_WEB,
  },
  [KIND_ANDROID]: {
    id: KIND_ANDROID,
    label: 'Android',
    short: 'нативная сборка',
    hint: 'Processing2Android · Java, SDK, Gradle',
    stack: STACK_ANDROID,
    targets: [TARGET_ANDROID],
    defaultTarget: TARGET_ANDROID,
  },
};

export const STACK_META = {
  [STACK_WEB]: {
    id: STACK_WEB,
    label: 'Processing2Web',
    detail: 'Скетч транслируется в JavaScript/HTML. Android и iOS — через Capacitor, Web — как веб-приложение.',
  },
  [STACK_ANDROID]: {
    id: STACK_ANDROID,
    label: 'Processing2Android',
    detail: 'Скетч компилируется в Java и собирается через Android SDK / Gradle без WebView и Capacitor.',
  },
};

export const TARGET_LABELS = {
  [TARGET_WEB]: 'Web',
  [TARGET_ANDROID]: 'Android',
  [TARGET_IOS]: 'iOS',
};

const KIND_IDS = new Set(Object.keys(PROJECT_KINDS));
const TARGET_IDS = new Set([TARGET_WEB, TARGET_ANDROID, TARGET_IOS]);

export function isKnownKind(kind) {
  return KIND_IDS.has(kind);
}

/** Стек и цели по типу. Неизвестный kind не подменяется молча. */
export function kindInfo(kind) {
  return PROJECT_KINDS[kind] || null;
}

/**
 * Как открыть проект в IDE.
 * @returns {{ kind: string, stack: string, target: string, explicit: boolean, info: object }}
 */
export function resolveKind(settings) {
  const data = settings && typeof settings === 'object' ? settings : {};
  const explicitKind = isKnownKind(data.kind) ? data.kind : null;
  const kind = explicitKind || KIND_ANDROID;
  const info = PROJECT_KINDS[kind];
  const stack = data.stack === STACK_WEB || data.stack === STACK_ANDROID
    ? data.stack
    : info.stack;
  const allowed = new Set(info.targets);
  const target = allowed.has(data.target) ? data.target : info.defaultTarget;
  return {
    kind,
    stack,
    target,
    explicit: !!explicitKind,
    info,
  };
}

export function toolsFor(kind, target) {
  if (kind === KIND_MULTI) {
    if (target === TARGET_WEB) return ['node', 'npm'];
    if (target === TARGET_IOS) return ['node', 'npm', 'capacitor', 'xcode'];
    return ['node', 'npm', 'capacitor', 'androidSdk', 'java'];
  }
  return ['java', 'androidSdk', 'gradle'];
}

/** Поля, которые пишутся в processing-studio.json. Legacy-проекты без kind остаются без kind. */
export function toProjectFile(settings, { explicit = true } = {}) {
  const resolved = resolveKind(settings);
  const out = {
    name: settings.name || DEFAULT_SETTINGS.name,
    packageName: settings.packageName || DEFAULT_SETTINGS.packageName,
    theme: settings.theme || DEFAULT_SETTINGS.theme,
    sketch: settings.sketch || DEFAULT_SETTINGS.sketch,
  };
  if (!explicit || resolved.kind === KIND_ANDROID) {
    out.minSdk = settings.minSdk ?? DEFAULT_SETTINGS.minSdk;
    out.targetSdk = settings.targetSdk ?? DEFAULT_SETTINGS.targetSdk;
    out.orientation = settings.orientation || DEFAULT_SETTINGS.orientation;
    out.permissions = Array.isArray(settings.permissions) ? settings.permissions : [...DEFAULT_SETTINGS.permissions];
    out.adaptiveUi = settings.adaptiveUi !== false;
  }
  if (explicit) {
    out.kind = resolved.kind;
    out.stack = resolved.stack;
    out.target = resolved.target;
  }
  return out;
}

export function applyResolvedState(root, settings, resolved) {
  state.projectRoot = root || null;
  state.projectSettings = settings || null;
  state.projectKind = root && settings ? resolved.kind : null;
  state.projectStack = root && settings ? resolved.stack : null;
  state.projectTarget = root && settings ? resolved.target : TARGET_ANDROID;
  state.projectExplicit = !!(root && settings && resolved.explicit);
}

export function clearProjectState() {
  applyResolvedState(null, null, resolveKind(null));
  state.projectKind = null;
  state.projectStack = null;
  state.projectExplicit = false;
}

/** Читает processing-studio.json открытой папки. Файл на диске не меняется. */
export async function loadAndApplyProject(root) {
  if (!root) {
    clearProjectState();
    return null;
  }
  const settings = await loadProject(root);
  if (!settings) {
    clearProjectState();
    return null;
  }
  const resolved = resolveKind(settings);
  applyResolvedState(root, settings, resolved);
  return { settings, resolved };
}

export async function saveProjectConfig(root, settings, { explicit } = {}) {
  const current = state.projectSettings || {};
  const writeExplicit = explicit != null ? explicit : !!(current.kind || state.projectExplicit);
  const payload = toProjectFile({ ...current, ...settings }, { explicit: writeExplicit });
  const ok = await saveProject(root, payload);
  if (ok) {
    const resolved = resolveKind(payload);
    applyResolvedState(root, payload, resolved);
  }
  return ok;
}

export async function setProjectTarget(target) {
  if (!state.projectRoot || !state.projectSettings) return false;
  if (state.projectKind !== KIND_MULTI) return false;
  if (!TARGET_IDS.has(target)) return false;
  if (!state.projectExplicit) {
    state.projectTarget = target;
    return true;
  }
  return saveProjectConfig(state.projectRoot, { ...state.projectSettings, target }, { explicit: true });
}

export { PROJECT_FILE, joinPath, loadProject };
