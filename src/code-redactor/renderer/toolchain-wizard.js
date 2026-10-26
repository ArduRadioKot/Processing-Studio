/**
 * Установщик зависимостей сборки: JDK 17, Android SDK 34, Gradle, Node.
 */
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { toast } from './image-view.js';

let overlay = null;
let unsub = null;
let busy = false;

const DEFAULT_BUILD_IDS = ['java', 'gradle', 'androidSdk', 'node'];

function closeWizard() {
  if (busy) {
    window.electronAPI?.toolchainCancel?.();
  }
  document.removeEventListener('keydown', onEsc);
  unsub?.();
  unsub = null;
  overlay?.remove();
  overlay = null;
  busy = false;
}

function projectRoot() {
  return state.projectRoot || state.currentFolder || null;
}

function renderRows(catalog, tools) {
  return catalog.map((item) => {
    const info = tools[item.id] || {};
    const ok = !!info.ok;
    const status = ok
      ? (info.version || info.hint || 'есть')
      : (info.hint || 'нет');
    const needs = (item.needs || []).join(',');
    return `
      <label class="tw-row ${ok ? 'ok' : 'missing'}">
        <input type="checkbox" data-tool="${item.id}" data-needs="${escapeHtml(needs)}" ${ok ? '' : 'checked'} ${item.bundled === 'node' ? 'data-follow="node"' : ''} ${item.external ? 'data-external="1"' : ''}>
        <span class="tw-dot"></span>
        <span class="tw-text">
          <span class="tw-name">${escapeHtml(item.label)}</span>
          <span class="tw-detail">${escapeHtml(item.detail)}${item.size ? ` · ${item.size}` : ''}</span>
        </span>
        <span class="tw-status" title="${escapeHtml(info.path || info.hint || '')}">${escapeHtml(status)}</span>
      </label>`;
  }).join('');
}

function selectedIds(box) {
  return [...box.querySelectorAll('[data-tool]:checked')].map((el) => el.dataset.tool);
}

function setBusy(box, on, note) {
  busy = on;
  box.querySelectorAll('button[data-act], [data-tool]').forEach((el) => {
    if (el.dataset.act === 'cancel') el.hidden = !on;
    else el.disabled = on;
  });
  const label = box.querySelector('#tw-note');
  if (label && note) label.textContent = note;
}

function appendLog(box, text) {
  const log = box.querySelector('#tw-log');
  if (!log || !text) return;
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    const row = document.createElement('div');
    row.className = 'tw-log-line';
    row.textContent = line;
    log.appendChild(row);
  }
  if (atBottom) log.scrollTop = log.scrollHeight;
}

function setBanner(box, bundled) {
  const el = box.querySelector('#tw-banner');
  if (!el) return;
  if (bundled?.present) {
    el.hidden = false;
    el.textContent = 'В установщике Processing Studio уже лежат JDK, SDK, Gradle и Node. Их можно поставить без интернета.';
  } else {
    el.hidden = false;
    el.textContent = 'Архивы не упакованы в это приложение — недостающее скачается при установке. Полный офлайн-набор попадает в DMG / NSIS через npm run build.';
  }
}

async function refresh(box, keepSelection = false) {
  const res = await window.electronAPI?.toolchainCatalog?.({ root: projectRoot() });
  if (!res?.success) {
    box.querySelector('#tw-note').textContent = res?.error || 'Не удалось проверить инструменты';
    return res;
  }
  const list = box.querySelector('#tw-list');
  const prev = new Set(selectedIds(box));
  list.innerHTML = renderRows(res.catalog || [], res.tools || {});
  if (keepSelection && prev.size) {
    list.querySelectorAll('[data-tool]').forEach((el) => {
      el.checked = prev.has(el.dataset.tool);
    });
  }
  const pathEl = box.querySelector('#tw-path');
  if (pathEl) pathEl.textContent = res.root || '';
  setBanner(box, res.bundled);
  box.dataset.buildIds = (res.buildIds || DEFAULT_BUILD_IDS).join(',');
  return res;
}

async function runAction(box, action, ids) {
  const selected = ids || selectedIds(box);
  if (!selected.length) {
    box.querySelector('#tw-note').textContent = 'Выберите инструменты';
    return;
  }
  setBusy(box, true, action === 'uninstall' ? 'Удаляю…' : 'Устанавливаю зависимости сборки…');
  box.querySelector('#tw-log').textContent = '';
  const api = action === 'uninstall' ? window.electronAPI.toolchainUninstall : window.electronAPI.toolchainInstall;
  const res = await api?.(selected, { root: projectRoot() });
  await refresh(box, false);
  setBusy(box, false, res?.success
    ? (action === 'uninstall' ? 'Готово, выбранное снято.' : 'Зависимости сборки установлены.')
    : (res?.error || 'Операция не выполнена'));
  if (res?.success) toast(action === 'uninstall' ? 'Зависимости удалены' : 'Зависимости сборки установлены');
}

export async function openToolchainWizard(opts = {}) {
  closeWizard();
  overlay = document.createElement('div');
  overlay.className = 'ps-modal';
  overlay.innerHTML = `
    <div class="ps-modal-box tw-box">
      <div class="ps-modal-head">
        <h2>Установщик сборки</h2>
        <button type="button" class="ps-close" data-close>Esc</button>
      </div>
      <div class="ps-modal-body">
        <div class="ps-hint">Один набор для APK и Capacitor: JDK 17, Android SDK 34, Gradle 8.7 и Node 20. Ставится в toolchain этой машины. Системный SDK не переписывается. Xcode — только из App Store.</div>
        <div class="tw-banner" id="tw-banner" hidden></div>
        <div class="tw-path" id="tw-path"></div>
        <div class="tw-list" id="tw-list"><div class="ps-hint">Проверяю инструменты…</div></div>
        <div class="tw-log" id="tw-log"></div>
      </div>
      <div class="ps-modal-foot tw-foot">
        <div class="ps-modal-note" id="tw-note">Для сборки приложений нажмите «Установить всё».</div>
        <button type="button" class="ps-btn ghost" data-act="refresh">Обновить</button>
        <button type="button" class="ps-btn danger" data-act="uninstall">Удалить выбранное</button>
        <button type="button" class="ps-btn" data-act="install">Выбранное</button>
        <button type="button" class="ps-btn" data-act="cancel" hidden>Отмена</button>
        <button type="button" class="ps-btn primary" data-act="install-all">Установить всё</button>
      </div>
    </div>`;
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay && !busy) closeWizard(); });
  document.body.appendChild(overlay);

  const box = overlay;
  box.querySelector('[data-close]')?.addEventListener('click', () => { if (!busy) closeWizard(); });
  box.querySelector('[data-act="refresh"]')?.addEventListener('click', () => refresh(box, true));
  box.querySelector('[data-act="install"]')?.addEventListener('click', () => runAction(box, 'install'));
  box.querySelector('[data-act="install-all"]')?.addEventListener('click', () => {
    const ids = (box.dataset.buildIds || DEFAULT_BUILD_IDS.join(',')).split(',').filter(Boolean);
    runAction(box, 'install', ids);
  });
  box.querySelector('[data-act="uninstall"]')?.addEventListener('click', () => runAction(box, 'uninstall'));
  box.querySelector('[data-act="cancel"]')?.addEventListener('click', () => window.electronAPI?.toolchainCancel?.());
  box.querySelector('#tw-list')?.addEventListener('change', (e) => {
    const input = e.target?.closest?.('[data-tool]');
    if (!input) return;
    if (input.dataset.tool === 'node') {
      const npm = box.querySelector('[data-tool="npm"]');
      if (npm) npm.checked = input.checked;
    }
    if (input.checked && input.dataset.needs) {
      for (const need of input.dataset.needs.split(',').filter(Boolean)) {
        const dep = box.querySelector(`[data-tool="${need}"]`);
        if (dep && !dep.closest('.tw-row')?.classList.contains('ok')) dep.checked = true;
      }
    }
  });

  unsub = window.electronAPI?.onToolchainProgress?.((payload) => {
    const line = payload?.message || payload?.text;
    if (line) appendLog(box, line);
    if (payload?.percent != null) {
      const note = box.querySelector('#tw-note');
      if (note) note.textContent = payload.message || `${payload.percent}%`;
    }
  });

  document.addEventListener('keydown', onEsc);
  const catalog = await refresh(box);
  if (opts.autoInstall && catalog?.success) {
    const ids = (catalog.buildIds || DEFAULT_BUILD_IDS).filter((id) => !catalog.tools?.[id]?.ok);
    const need = ids.length ? ids : (catalog.buildIds || DEFAULT_BUILD_IDS);
    if (need.length) await runAction(box, 'install', need);
  }
}

function onEsc(e) {
  if (e.key === 'Escape' && overlay && !busy) {
    document.removeEventListener('keydown', onEsc);
    closeWizard();
  }
}

export { closeWizard };
