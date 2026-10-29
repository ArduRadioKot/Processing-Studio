import { icon } from './glyphs.js';
import { state } from './state.js';

const CHECKED_KEY = 'processing-studio.update.checked';
const DISMISSED_KEY = 'processing-studio.update.dismissed';
const RECHECK_MS = 2 * 60 * 60 * 1000;
const FOCUS_RECHECK_MS = 30 * 60 * 1000;
const tr = (ru, en) => window.appI18n?.t(ru, en) || ru;
const translateError = value => window.appI18n?.lookup(value) || value;
let checkNow = null;
let showFound = null;

function showUpdatesPanel() {
  const modal = document.getElementById('modal-settings');
  if (modal) modal.style.display = 'flex';
  document.querySelector('[data-settings-tab="updates"]')?.click();
}

export function openUpdatesSettings() {
  showUpdatesPanel();
  checkNow?.();
}

export async function promptForUpdates() {
  if (!checkNow) { openUpdatesSettings(); return; }
  const result = await checkNow(false);
  if (result?.available) showFound?.(true);
  else showUpdatesPanel();
}

export function setupUpdater() {
  const api = window.electronAPI;
  const status = document.getElementById('updates-status');
  const version = document.getElementById('updates-version');
  const notes = document.getElementById('updates-notes');
  const checkButton = document.getElementById('updates-check');
  const actionButton = document.getElementById('updates-action');
  const releaseButton = document.getElementById('updates-release');
  const banner = document.getElementById('updates-banner');
  const foundModal = document.getElementById('modal-update-found');
  if (!api?.checkUpdates || !status || !banner) return;

  const bannerText = banner.querySelector('.updates-banner-text');
  const bannerGo = banner.querySelector('.updates-banner-go');
  const bannerDetails = banner.querySelector('.updates-banner-details');
  const bannerClose = banner.querySelector('.updates-banner-close');
  const foundVersion = document.getElementById('update-found-version');
  const foundSummary = document.getElementById('update-found-summary');
  const foundNotesLabel = document.getElementById('update-found-notes-label');
  const foundNotes = document.getElementById('update-found-notes');
  const foundStatus = document.getElementById('update-found-status');
  const foundLater = document.getElementById('update-found-later');
  const foundDetails = document.getElementById('update-found-details');
  const foundInstall = document.getElementById('update-found-install');
  const dialogButtons = [foundLater, foundDetails, foundInstall].filter(Boolean);
  bannerClose.innerHTML = icon('close', 14);
  let release = null;
  let checking = false;
  let installing = false;
  let announced = '';
  let checkedOnce = false;

  const setStatus = text => { status.textContent = text; };
  const formatSize = bytes => `${Math.round(bytes / 1024 / 1024)} ${tr('МБ', 'MB')}`;
  const dialogOpen = () => foundModal?.style.display === 'flex';
  const setDialogStatus = text => {
    if (!foundStatus) return;
    foundStatus.textContent = text || '';
    foundStatus.hidden = !text;
  };
  const setDialogBusy = value => { for (const button of dialogButtons) button.disabled = value; };
  const report = text => {
    setStatus(text);
    if (dialogOpen()) setDialogStatus(text);
  };
  const showBanner = () => {
    if (!release?.available || localStorage.getItem(DISMISSED_KEY) === release.latest) return;
    bannerText.textContent = `${tr('Доступна версия', 'Version available')} ${release.latest}`;
    banner.hidden = false;
  };
  const closeFoundModal = () => { if (foundModal) foundModal.style.display = 'none'; };
  const showFoundModal = (force = false) => {
    if (!foundModal || !release?.available) return;
    if (!force && (localStorage.getItem(DISMISSED_KEY) === release.latest || announced === release.latest)) return;
    announced = release.latest;
    const size = release.asset?.size ? ` (${formatSize(release.asset.size)})` : '';
    foundVersion.textContent = tr(
      `На GitHub вышла версия ${release.latest}${size}.`,
      `Version ${release.latest}${size} is on GitHub.`
    );
    if (foundSummary) {
      foundSummary.textContent = tr(
        `Сейчас установлена версия ${release.current}.`,
        `You have version ${release.current} installed.`
      );
    }
    const notesText = String(release.notes || '').trim();
    if (foundNotes) {
      foundNotes.textContent = notesText;
      foundNotes.hidden = !notesText;
    }
    if (foundNotesLabel) foundNotesLabel.hidden = !notesText;
    setDialogStatus('');
    if (foundInstall) {
      foundInstall.textContent = release.packaged && release.asset ? tr('Обновить', 'Update') : tr('Открыть релиз', 'Open release');
    }
    foundModal.style.display = 'flex';
    foundInstall?.focus();
  };
  showFound = showFoundModal;
  const canDownload = () => !!(release?.packaged && release?.asset);
  const openRelease = () => api.openExternal?.(release?.url || 'https://github.com/ArduRadioKot/Processing-Studio/releases/latest');

  function paint() {
    if (!release?.ok) return;
    if (!release.available) {
      setStatus(tr('Установлена последняя версия', 'You have the latest version'));
      notes.hidden = true;
      actionButton.hidden = true;
      banner.hidden = true;
      return;
    }
    const size = release.asset?.size ? `, ${formatSize(release.asset.size)}` : '';
    setStatus(`${tr('Доступна версия', 'Version available')} ${release.latest}${size}`);
    notes.textContent = release.notes || '';
    notes.hidden = !release.notes;
    actionButton.hidden = false;
    actionButton.textContent = canDownload() ? (release.mode === 'manual' ? tr('Скачать пакет', 'Download package') : tr('Скачать и установить', 'Download and install')) : tr('Открыть релиз', 'Open release');
    bannerGo.textContent = canDownload() ? tr('Обновить', 'Update') : tr('Скачать', 'Download');
    showBanner();
  }

  let checkPromise = null;
  async function check(auto = false) {
    if (installing) return release;
    if (checkPromise) {
      const result = await checkPromise;
      if (auto && result?.available) showFoundModal();
      return result;
    }
    checking = true;
    checkButton.disabled = true;
    if (!auto) setStatus(tr('Проверка обновлений…', 'Checking for updates...'));
    checkPromise = (async () => {
      try {
        const result = await api.checkUpdates();
        if (!result?.ok) {
          setStatus(translateError(result?.error) || tr('Не удалось проверить обновления', 'Could not check for updates'));
          return null;
        }
        release = result;
        localStorage.setItem(CHECKED_KEY, String(Date.now()));
        paint();
        if (auto) showFoundModal();
        return release;
      } catch {
        setStatus(tr('Не удалось проверить обновления', 'Could not check for updates'));
        return null;
      }
    })();
    try { return await checkPromise; }
    finally {
      checkPromise = null;
      checking = false;
      checkedOnce = true;
      checkButton.disabled = false;
    }
  }
  checkNow = check;

  async function update() {
    if (!release?.available || installing) return;
    if (!canDownload()) { openRelease(); return; }
    installing = true;
    checkButton.disabled = true;
    actionButton.disabled = true;
    bannerGo.disabled = true;
    setDialogBusy(true);
    const off = api.onUpdateProgress?.(progress => {
      const label = progress.total ? `${tr('Загрузка…', 'Downloading...')} ${Math.min(100, Math.round(progress.received / progress.total * 100))}%` : tr('Загрузка…', 'Downloading...');
      bannerText.textContent = `${label} · ${tr('версия', 'version')} ${release.latest}`;
      banner.hidden = false;
      report(label);
    });
    try {
      report(tr('Загрузка обновления…', 'Downloading update...'));
      const downloaded = await api.downloadUpdate();
      if (!downloaded?.ok) {
        report(translateError(downloaded?.error) || tr('Не удалось скачать обновление', 'Could not download the update'));
        return;
      }
      if (release.mode !== 'manual') {
        if (state.currentTabs.some(tab => tab.modified)) {
          report(tr('Есть несохранённые файлы. Сохраните их и повторите установку.', 'There are unsaved files. Save them and try installing again.'));
          return;
        }
        if (!window.confirm(tr('Processing Studio закроется для установки обновления. Сохраните файлы во всех окнах. Продолжить?', 'Processing Studio will close to install the update. Save files in every window. Continue?'))) {
          report(tr('Обновление скачано. Установку можно продолжить позже.', 'Update downloaded. You can install it later.'));
          return;
        }
      }
      report(release.mode === 'manual' ? tr('Открываем скачанный пакет…', 'Opening the downloaded package...') : tr('Установка начнётся после закрытия IDE', 'Installation will start after the IDE closes'));
      const installed = await api.installUpdate();
      if (!installed?.ok) report(translateError(installed?.error) || tr('Не удалось установить обновление', 'Could not install the update'));
      else if (installed.mode === 'manual') report(translateError(installed.message));
    } catch {
      report(tr('Не удалось установить обновление', 'Could not install the update'));
    } finally {
      off?.();
      installing = false;
      checkButton.disabled = false;
      actionButton.disabled = false;
      bannerGo.disabled = false;
      setDialogBusy(false);
    }
  }

  checkButton.addEventListener('click', () => check(false));
  actionButton.addEventListener('click', update);
  releaseButton.addEventListener('click', openRelease);
  bannerGo.addEventListener('click', update);
  bannerDetails.addEventListener('click', () => {
    const modal = document.getElementById('modal-settings');
    if (modal) modal.style.display = 'flex';
    document.querySelector('[data-settings-tab="updates"]')?.click();
  });
  bannerClose.addEventListener('click', () => {
    banner.hidden = true;
    if (release?.latest) localStorage.setItem(DISMISSED_KEY, release.latest);
  });
  foundLater?.addEventListener('click', () => {
    closeFoundModal();
    banner.hidden = true;
    if (release?.latest) localStorage.setItem(DISMISSED_KEY, release.latest);
  });
  foundDetails?.addEventListener('click', () => { closeFoundModal(); openUpdatesSettings(); });
  foundInstall?.addEventListener('click', () => update());
  foundModal?.addEventListener('click', event => { if (event.target === foundModal && !installing) closeFoundModal(); });
  foundModal?.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !installing) { event.preventDefault(); event.stopPropagation(); closeFoundModal(); }
  });

  api.updatesInfo?.().then(info => {
    if (info?.ok) version.textContent = `${tr('Версия', 'Version')} ${info.current}`;
  }).catch(() => {});
  setTimeout(() => check(true), 4000);
  setInterval(() => check(true), RECHECK_MS);
  window.addEventListener('focus', () => {
    if (!checkedOnce || checking || installing) return;
    const last = Number(localStorage.getItem(CHECKED_KEY) || 0);
    if (Date.now() - last < FOCUS_RECHECK_MS) return;
    check(true);
  });
}
