/**
 * Панель «Запуск»: превью в эмуляторе, сборка и мастер зависимостей.
 */
import { state } from './state.js';
import { icon, hydrateIcons } from './glyphs.js';
import { getDom } from './dom.js';
import { showDevicePanel, runCurrentSketch, toggleDevicePanel, stopSketch } from './device-emulator.js';
import { openProjectSettings } from './android-ui.js';
import {
  KIND_MULTI, PROJECT_KINDS, TARGET_LABELS, STACK_META,
  resolveKind, setProjectTarget, toolsFor,
} from './project-model.js';
import { checkToolchain, runPipelineAction } from './pipelines.js';
import { appendBuildLog, clearBuildLog, showBuildConsole } from './terminal.js';
import { escapeHtml } from './utils.js';
import { openToolchainWizard } from './toolchain-wizard.js';

const dom = getDom();

function resolvedProject() {
  if (!state.projectSettings && !state.projectKind) return null;
  return resolveKind(state.projectSettings || {
    kind: state.projectKind,
    stack: state.projectStack,
    target: state.projectTarget,
  });
}

function logResult(title, result) {
  appendBuildLog(title, { level: 'info' });
  if (result.transpile?.warnings?.length) {
    for (const warn of result.transpile.warnings) appendBuildLog(warn, { level: 'warn' });
  }
  if (result.transpile?.ok) {
    appendBuildLog(`Processing2Web: диалект ${result.transpile.mode || 'java'} → JavaScript.`, { level: 'info' });
  }
  if (result.missing?.length) {
    appendBuildLog('Нет инструментов: ' + result.missing.join('; '), { level: 'warn' });
  }
  if (!result.ok) {
    appendBuildLog(result.error || 'Операция не выполнена', { level: 'error' });
    return;
  }
  if (result.path) appendBuildLog(result.path, { level: 'info' });
  if (result.note) appendBuildLog(result.note, { level: 'info' });
}

async function handleAction(action) {
  if (action === 'preview') {
    showDevicePanel();
    runCurrentSketch();
    return;
  }
  clearBuildLog();
  showBuildConsole();
  const result = await runPipelineAction(action, { target: state.projectTarget });
  logResult(
    action === 'run' ? 'Запуск' : action === 'build' ? 'Сборка' : 'Экспорт',
    result,
  );
  if (result.needWizard) {
    appendBuildLog('Откройте пакетный менеджер, чтобы поставить недостающие инструменты.', { level: 'warn' });
  }
}

async function paintTools(host, kind, target) {
  if (!host) return;
  const names = toolsFor(kind, target);
  host.innerHTML = names.map((name) => `<div class="run-tool" data-tool="${name}"><span class="run-tool-dot"></span><span>${name}</span><span class="run-tool-ver">…</span></div>`).join('');
  const check = await checkToolchain(names);
  const tools = check.tools || {};
  host.querySelectorAll('[data-tool]').forEach((row) => {
    const item = tools[row.dataset.tool];
    row.classList.toggle('ok', !!item?.ok);
    row.classList.toggle('missing', !item?.ok);
    const ver = row.querySelector('.run-tool-ver');
    if (ver) ver.textContent = item?.ok ? (item.version || item.path || 'есть') : (item?.hint || 'нет');
    if (item?.hint && item.ok) row.title = item.hint;
    if (!item?.ok) row.title = item?.hint || 'Не найден';
  });
}

export async function showRunPanel() {
  const resolved = resolvedProject();
  const kind = resolved?.kind || null;
  const info = kind ? PROJECT_KINDS[kind] : null;
  const stack = kind ? STACK_META[info.stack] : null;
  const targets = info?.targets || [];
  const target = resolved?.target || state.projectTarget;
  const multi = kind === KIND_MULTI;
  const tab = state.currentTabs[state.activeTabIndex];
  const sketchName = tab && tab.kind !== 'terminal' ? tab.name : 'Откройте скетч';
  const kindLabel = info
    ? `${info.label}${resolved.explicit ? '' : ' (без kind в конфиге)'}`
    : 'Папка без processing-studio.json';

  dom.activityPanel.innerHTML = `
    <div class="activity-header"><h3>Запуск</h3></div>
    <div class="run-panel">
      <div class="run-section">
        <div class="run-title">Проект</div>
        <div class="run-kind">${escapeHtml(kindLabel)}</div>
        <div class="run-stack">${escapeHtml(stack ? stack.detail : 'Эмулятор доступен для любого скетча. Тип стека задаётся при создании проекта.')}</div>
      </div>
      <div class="run-section">
        <div class="run-title">Скетч</div>
        <button class="run-item" id="run-current-btn"><span class="run-play">${icon('play', 11)}</span><span class="run-name" id="run-current-name">${escapeHtml(sketchName)}</span><kbd>F5</kbd></button>
        <button class="run-item" id="run-device-btn"><span class="run-play">${icon('phone', 13)}</span><span class="run-name">Запустить в эмуляторе</span><kbd>F6</kbd></button>
      </div>
      <div class="run-section">
        <div class="run-title">Устройство</div>
        <button class="run-item" id="run-device-panel-btn"><span class="run-play">${icon('window', 13)}</span><span class="run-name">Панель эмулятора</span></button>
        <button class="run-item" id="run-device-stop-btn"><span class="run-play">${icon('phone', 13)}</span><span class="run-name">Остановить скетч</span></button>
      </div>
      ${targets.length ? `
      <div class="run-section">
        <div class="run-title">Платформа</div>
        ${multi ? `<div class="run-chips" id="run-targets">${targets.map((id) => `
          <button type="button" class="run-chip${id === target ? ' active' : ''}" data-target="${id}">${TARGET_LABELS[id]}</button>`).join('')}</div>` : `<div class="ps-hint">Только Android · Processing2Android</div>`}
        <button class="run-item" id="run-platform-btn"><span class="run-play">${icon('play', 11)}</span><span class="run-name">Запустить</span></button>
        <button class="run-item" id="run-build-btn"><span class="run-play">${icon('window', 13)}</span><span class="run-name">Собрать</span></button>
        <button class="run-item" id="run-export-btn"><span class="run-play">${icon('phone', 13)}</span><span class="run-name">${kind === KIND_MULTI ? 'Экспортировать' : 'Экспортировать Gradle'}</span></button>
      </div>` : `
      <div class="run-section">
        <div class="run-title">Android</div>
        <button class="run-item" id="run-export-btn"><span class="run-play">${icon('phone', 13)}</span><span class="run-name">Экспортировать Gradle</span></button>
      </div>`}
      <div class="run-section">
        <div class="run-title">Инструменты</div>
        <div class="run-tools" id="run-tools"><div class="ps-hint">${kind ? 'Проверяем…' : 'Откройте проект Processing Studio, чтобы увидеть стек.'}</div></div>
        <button class="run-item" id="run-toolchain-btn"><span class="run-play">${icon('window', 13)}</span><span class="run-name">Установщик сборки</span></button>
      </div>
      <div class="run-section">
        <div class="run-title">Проект</div>
        <button class="run-item" id="run-project-btn"><span class="run-play">${icon('window', 13)}</span><span class="run-name">Настройки проекта</span></button>
      </div>
    </div>`;

  hydrateIcons(dom.activityPanel);
  document.getElementById('run-current-btn')?.addEventListener('click', () => import('./palette.js').then((m) => m.runCurrentFile()));
  document.getElementById('run-device-btn')?.addEventListener('click', () => { showDevicePanel(); runCurrentSketch(); });
  document.getElementById('run-device-panel-btn')?.addEventListener('click', () => toggleDevicePanel());
  document.getElementById('run-device-stop-btn')?.addEventListener('click', () => stopSketch());
  document.getElementById('run-platform-btn')?.addEventListener('click', () => handleAction('run'));
  document.getElementById('run-build-btn')?.addEventListener('click', () => handleAction('build'));
  document.getElementById('run-export-btn')?.addEventListener('click', () => handleAction('export'));
  document.getElementById('run-project-btn')?.addEventListener('click', () => openProjectSettings());
  document.getElementById('run-toolchain-btn')?.addEventListener('click', () => openToolchainWizard());

  document.getElementById('run-targets')?.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-target]');
    if (!chip) return;
    await setProjectTarget(chip.dataset.target);
    showRunPanel();
  });

  document.getElementById('run-tools')?.addEventListener('click', (e) => {
    if (e.target.closest('.run-tool.missing')) openToolchainWizard();
  });
  if (kind) paintTools(document.getElementById('run-tools'), kind, target);
  else {
    const host = document.getElementById('run-tools');
    if (host) host.innerHTML = '<div class="ps-hint">Стек не задан - проверка инструментов недоступна.</div>';
  }
}
