/**
 * Интерфейс проекта Processing Studio: мастер создания проекта
 * (мультиплатформенный / Android) и диалог настроек.
 */
import { state } from './state.js';
import {
  PERMISSIONS, ORIENTATIONS,
  defaultSettingsFor, sanitizePackageName, isValidPackageName,
  loadProject,
} from './android-project.js';
import { toast } from './image-view.js';
import { createTab, hideWelcomePage } from './tabs.js';
import { escapeHtml } from './utils.js';
import { SKETCH_TEMPLATE, writeProjectFiles } from './project-templates.js';
import {
  KIND_ANDROID, KIND_MULTI, PROJECT_KINDS, TARGET_LABELS,
  resolveKind, saveProjectConfig,
} from './project-model.js';
import { runPipelineAction } from './pipelines.js';
import { appendBuildLog, showBuildConsole } from './terminal.js';

let overlay = null;

function closeOverlay() {
  overlay?.remove();
  overlay = null;
}

function showOverlay(html, onMount) {
  closeOverlay();
  overlay = document.createElement('div');
  overlay.className = 'ps-modal';
  overlay.innerHTML = html;
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeOverlay(); });
  document.body.appendChild(overlay);
  onMount?.(overlay);
  return overlay;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay) closeOverlay();
});

/** Текущий корень проекта: папка с открытым processing-studio.json или папка скетча. */
export function projectRoot() {
  const tab = state.currentTabs[state.activeTabIndex];
  if (tab?.filePath) {
    const dir = tab.filePath.replace(/[\\/][^\\/]*$/, '');
    return dir || state.currentFolder;
  }
  return state.currentFolder;
}

export function currentSketchFile() {
  const tab = state.currentTabs[state.activeTabIndex];
  if (tab?.filePath && /\.(pde|js)$/i.test(tab.name || '')) return { path: tab.filePath, name: tab.name };
  return null;
}

async function readSketch(path) {
  const res = await window.electronAPI?.getFileContent?.(path);
  return res?.success ? res.content : '';
}

function kindCards(selected) {
  return `
    <div class="ps-kinds" role="radiogroup" aria-label="Тип проекта">
      ${Object.values(PROJECT_KINDS).map((kind) => `
        <label class="ps-kind">
          <input type="radio" name="ps-kind" value="${kind.id}" ${selected === kind.id ? 'checked' : ''}>
          <span class="ps-kind-title">${kind.label}</span>
          <span class="ps-kind-sub">${kind.short}</span>
          <span class="ps-kind-hint">${kind.hint}</span>
        </label>`).join('')}
    </div>`;
}

function targetSelect(kind, target) {
  const info = PROJECT_KINDS[KIND_MULTI];
  const options = info.targets.map((id) => `
    <option value="${id}" ${target === id ? 'selected' : ''}>${TARGET_LABELS[id]}</option>`).join('');
  return `
    <div class="ps-field" data-multi-only ${kind !== KIND_MULTI ? 'hidden' : ''}>
      <label for="ps-platform-target">Целевая платформа</label>
      <select id="ps-platform-target">${options}</select>
      <div class="ps-hint">Capacitor установится в папку проекта (нужен Node.js). Для iOS позже понадобятся Xcode и подпись.</div>
    </div>`;
}

function formKind(box) {
  return box.querySelector('[name="ps-kind"]:checked')?.value
    || box.querySelector('#ps-kind-current')?.value
    || KIND_ANDROID;
}

function syncStackFields(box) {
  const kind = formKind(box);
  box.querySelectorAll('[data-android-only]').forEach((el) => {
    el.hidden = kind !== KIND_ANDROID;
  });
  box.querySelectorAll('[data-multi-only]').forEach((el) => {
    el.hidden = kind !== KIND_MULTI;
  });
}

function settingsForm(settings, { title, submit, pickKind = false }) {
  const resolved = resolveKind(settings);
  const perms = PERMISSIONS.map((p) => `
    <label class="ps-check">
      <input type="checkbox" data-perm="${p.id}" ${settings.permissions.includes(p.id) ? 'checked' : ''}>
      <span>${p.label}</span>
      <code>${p.id}</code>
    </label>`).join('');
  const orients = ORIENTATIONS.map((o) => `
    <option value="${o.id}" ${settings.orientation === o.id ? 'selected' : ''}>${o.label}</option>`).join('');
  const kindBlock = pickKind
    ? `<div class="ps-field"><label>Тип проекта</label>${kindCards(resolved.kind)}</div>`
    : `<input type="hidden" id="ps-kind-current" value="${resolved.kind}"><div class="ps-kind-badge">${resolved.info.label} · ${resolved.info.hint}${resolved.explicit ? '' : ' · открыт как Android'}</div>`;

  return `
    <div class="ps-modal-box">
      <div class="ps-modal-head">
        <h2>${title}</h2>
        <button type="button" class="ps-close" data-close>✕</button>
      </div>
      <div class="ps-modal-body">
        ${kindBlock}
        <div class="ps-field">
          <label for="ps-name">Название приложения</label>
          <input id="ps-name" type="text" value="${escapeHtml(settings.name)}">
        </div>
        <div class="ps-field">
          <label for="ps-package">Package name</label>
          <input id="ps-package" type="text" value="${escapeHtml(settings.packageName)}" spellcheck="false">
          <div class="ps-hint" id="ps-package-hint"></div>
        </div>
        ${pickKind || resolved.kind === KIND_MULTI ? targetSelect(resolved.kind, resolved.target) : ''}
        <div class="ps-row" data-android-only>
          <div class="ps-field">
            <label for="ps-min">Min SDK</label>
            <input id="ps-min" type="number" min="21" max="35" value="${settings.minSdk}">
          </div>
          <div class="ps-field">
            <label for="ps-target">Target SDK</label>
            <input id="ps-target" type="number" min="21" max="35" value="${settings.targetSdk}">
          </div>
          <div class="ps-field">
            <label for="ps-orientation">Ориентация</label>
            <select id="ps-orientation">${orients}</select>
          </div>
        </div>
        <div class="ps-field" data-android-only>
          <label>Разрешения</label>
          <div class="ps-perms">${perms}</div>
        </div>
        <div class="ps-field">
          <label>Папка проекта</label>
          <div class="ps-hint" id="ps-target-dir">-</div>
        </div>
        <label class="ps-check ps-lib" data-android-only>
          <input type="checkbox" id="ps-adaptive-ui" ${settings.adaptiveUi !== false ? 'checked' : ''}>
          <span>Adaptive UI - масштабировать любой интерфейс под экран</span>
        </label>
        <div class="ps-hint" data-android-only>Библиотека AdaptiveUI вписывает скетч из size() в любой телефон: кнопки, текст и касания масштабируются сами.</div>
      </div>
      <div class="ps-modal-foot">
        <span class="ps-modal-note" id="ps-note"></span>
        <button type="button" class="ps-btn ghost" data-close>Отмена</button>
        <button type="button" class="ps-btn primary" id="ps-submit">${submit}</button>
      </div>
    </div>`;
}

function readForm(root, { includeKind = false } = {}) {
  const get = (id) => root.querySelector(id)?.value?.trim() || '';
  const permissions = [...root.querySelectorAll('[data-perm]')]
    .filter((el) => el.checked)
    .map((el) => el.dataset.perm);
  const kind = formKind(root);
  const next = {
    name: get('#ps-name') || 'Sketch',
    packageName: sanitizePackageName(get('#ps-package')),
    minSdk: Math.max(21, Number(get('#ps-min')) || 24),
    targetSdk: Math.max(21, Number(get('#ps-target')) || 34),
    orientation: get('#ps-orientation') || 'unspecified',
    permissions,
    theme: 'dark',
    adaptiveUi: kind === KIND_ANDROID && !!root.querySelector('#ps-adaptive-ui')?.checked,
  };
  if (includeKind) {
    next.kind = kind;
    next.stack = PROJECT_KINDS[kind].stack;
    next.target = kind === KIND_MULTI
      ? (get('#ps-platform-target') || PROJECT_KINDS[KIND_MULTI].defaultTarget)
      : 'android';
  }
  return next;
}

function wirePackageCheck(box) {
  const pkgInput = box.querySelector('#ps-package');
  const hint = box.querySelector('#ps-package-hint');
  const check = () => {
    const value = pkgInput.value.trim();
    hint.textContent = isValidPackageName(value) ? 'Имя пакета корректно' : 'Нужно com.имя.пакета';
    hint.classList.toggle('bad', !isValidPackageName(value));
  };
  pkgInput.addEventListener('input', check);
  check();
  return pkgInput;
}

/** Диалог настроек проекта: сохраняет processing-studio.json рядом со скетчем. Тип не меняется. */
export async function openProjectSettings() {
  const root = projectRoot();
  if (!root) { toast('Откройте папку проекта со скетчем'); return null; }
  const saved = await loadProject(root);
  const sketch = currentSketchFile();
  const settings = saved || defaultSettingsFor(sketch?.name || 'sketch.pde');
  const resolved = resolveKind(settings);

  const el = showOverlay(settingsForm(settings, { title: 'Настройки проекта', submit: 'Сохранить' }), (box) => {
    const pkgInput = wirePackageCheck(box);
    const note = box.querySelector('#ps-note');
    syncStackFields(box);
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeOverlay));
    box.querySelector('#ps-submit').addEventListener('click', async () => {
      const next = readForm(box, { includeKind: resolved.explicit });
      if (!isValidPackageName(pkgInput.value.trim())) { note.textContent = 'Проверьте package name'; return; }
      next.sketch = settings.sketch || 'sketch.pde';
      if (resolved.explicit) {
        next.kind = settings.kind;
        next.stack = settings.stack;
        if (resolved.kind === KIND_MULTI) {
          next.target = box.querySelector('#ps-platform-target')?.value || resolved.target;
        } else {
          next.target = 'android';
        }
      }
      const ok = await saveProjectConfig(root, next, { explicit: resolved.explicit });
      note.textContent = ok ? 'Сохранено' : 'Не удалось сохранить';
      if (ok) {
        if (state.currentActivity === 'debug') import('./run-panel.js').then((m) => m.showRunPanel());
        setTimeout(closeOverlay, 500);
      }
    });
  });
  return el;
}

/** Мастер: тип проекта выбирается здесь и записывается в конфиг этой папки. */
export async function newStudioProject() {
  const sketch = currentSketchFile();
  const base = defaultSettingsFor(sketch?.name || 'sketch.pde');
  const settings = { ...base, kind: KIND_ANDROID, stack: PROJECT_KINDS[KIND_ANDROID].stack, target: 'android' };

  const el = showOverlay(settingsForm(settings, { title: 'Новый проект', submit: 'Создать', pickKind: true }), async (box) => {
    const pkgInput = wirePackageCheck(box);
    const note = box.querySelector('#ps-note');
    syncStackFields(box);
    box.querySelectorAll('[name="ps-kind"]').forEach((input) => {
      input.addEventListener('change', () => syncStackFields(box));
    });
    const paths = await window.electronAPI?.studioPaths?.();
    if (paths?.success) {
      const target = box.querySelector('#ps-target-dir');
      if (target) target.textContent = paths.projects;
    }
    box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeOverlay));
    const submit = box.querySelector('#ps-submit');
    submit.addEventListener('click', async () => {
      const next = readForm(box, { includeKind: true });
      if (!isValidPackageName(pkgInput.value.trim())) { note.textContent = 'Проверьте package name'; return; }
      next.sketch = 'sketch.pde';
      next.sketchSource = sketch ? await readSketch(sketch.path) : SKETCH_TEMPLATE;
      submit.disabled = true;
      note.textContent = 'Создаю папку проекта…';
      const created = await window.electronAPI?.studioCreateProject?.(next.name);
      if (!created?.success) {
        note.textContent = created?.error ? `Не удалось создать папку: ${created.error}` : 'Не удалось создать папку проекта';
        submit.disabled = false;
        return;
      }
      note.textContent = 'Записываю файлы…';
      const wrote = await writeProjectFiles(created.path, next);
      if (!wrote.ok) {
        note.textContent = wrote.error || 'Не удалось записать проект';
        submit.disabled = false;
        return;
      }
      if (next.kind === KIND_MULTI) {
        note.textContent = 'Устанавливаю Capacitor в проект…';
        const installed = await window.electronAPI?.capacitorInstall?.(created.path);
        if (!installed?.success) {
          note.textContent = `Проект создан, но Capacitor не установился: ${installed?.error || 'ошибка npm'}`;
          toast(note.textContent);
          try {
            const { loadFolderContents } = await import('./explorer.js');
            await loadFolderContents(created.path);
          } catch (err) { /* проект уже на диске */ }
          submit.disabled = false;
          return;
        }
        const ver = installed.version ? ` ${installed.version}` : '';
        note.textContent = `Проект создан, Capacitor${ver} установлен: ${created.path}`;
      } else {
        note.textContent = `Проект создан: ${created.path}`;
      }
      try {
        const { loadFolderContents } = await import('./explorer.js');
        await loadFolderContents(created.path);
      } catch (err) { /* проект уже создан */ }
      setTimeout(closeOverlay, next.kind === KIND_MULTI ? 1200 : 700);
    });
  });
  return el;
}

export function newAndroidProject() {
  return newStudioProject();
}

/** Экспорт через пайплайн текущего проекта. */
export async function exportAndroidProjectAction() {
  const root = projectRoot();
  if (!root) { toast('Откройте папку со скетчем'); return null; }
  showBuildConsole();
  const result = await runPipelineAction('export');
  if (!result.ok) {
    appendBuildLog(result.error || 'Экспорт не выполнен', { level: 'error' });
    toast(result.error || 'Экспорт не выполнен');
    return null;
  }
  const path = result.path ? `Android-проект создан: ${result.path}` : 'Экспорт выполнен';
  appendBuildLog(path, { level: 'info' });
  toast(path);
  return result;
}

export { SKETCH_TEMPLATE };

export function createNewSketch() {
  hideWelcomePage();
  return createTab('sketch.pde', SKETCH_TEMPLATE, null);
}
