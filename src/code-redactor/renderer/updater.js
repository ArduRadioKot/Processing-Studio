import { icon } from './glyphs.js';
import { state } from './state.js';

const CHECKED_KEY = 'processing-studio.update.checked';
const DISMISSED_KEY = 'processing-studio.update.dismissed';
const tr = (ru, en) => window.appI18n?.t(ru, en) || ru;
const translateError = value => window.appI18n?.lookup(value) || value;
let checkNow = null;

export function openUpdatesSettings() {
  const modal = document.getElementById('modal-settings');
  if (modal) modal.style.display = 'flex';
  document.querySelector('[data-settings-tab="updates"]')?.click();
  checkNow?.();
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
  const foundNotes = document.getElementById('update-found-notes');
  const foundLater = document.getElementById('update-found-later');
  const foundDetails = document.getElementById('update-found-details');
  const foundInstall = document.getElementById('update-found-install');
  bannerClose.innerHTML = icon('close', 14);
  let release = null;
  let busy = false;

  const setStatus = text => { status.textContent = text; };
  const formatSize = bytes => `${Math.round(bytes / 1024 / 1024)} ${tr('МБ', 'MB')}`;
  const showBanner = () => {
    if (!release?.available || localStorage.getItem(DISMISSED_KEY) === release.latest) return;
    bannerText.textContent = `${tr('Доступна версия', 'Version available')} ${release.latest}`;
    banner.hidden = false;
  };
  const closeFoundModal = () => { if (foundModal) foundModal.style.display = 'none'; };
  const showFoundModal = () => {
    if (!foundModal || !release?.available || localStorage.getItem(DISMISSED_KEY) === release.latest) return;
    foundVersion.textContent = tr(`Версия ${release.latest} доступна для установки.`, `Version ${release.latest} is ready to install.`);
    foundNotes.textContent = release.notes || '';
    foundNotes.hidden = !release.notes;
    foundInstall.textContent = release.packaged && release.asset ? tr('Обновить', 'Update') : tr('Открыть релиз', 'Open release');
    foundModal.style.display = 'flex';
    foundInstall.focus();
  };
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

  async function check(auto = false) {
    if (busy) return;
    busy = true;
    checkButton.disabled = true;
    setStatus(tr('Проверка обновлений…', 'Checking for updates...'));
    try {
      const result = await api.checkUpdates();
      if (!result?.ok) {
        setStatus(translateError(result?.error) || tr('Не удалось проверить обновления', 'Could not check for updates'));
        return;
      }
      release = result;
      localStorage.setItem(CHECKED_KEY, String(Date.now()));
      paint();
      if (auto) showFoundModal();
    } catch {
      setStatus(tr('Не удалось проверить обновления', 'Could not check for updates'));
    } finally {
      busy = false;
      checkButton.disabled = false;
    }
  }
  checkNow = check;

  async function update() {
    if (!release?.available || busy) return;
    if (!canDownload()) { openRelease(); return; }
    busy = true;
    checkButton.disabled = true;
    actionButton.disabled = true;
    bannerGo.disabled = true;
    const off = api.onUpdateProgress?.(progress => {
      const label = progress.total ? `${tr('Загрузка…', 'Downloading...')} ${Math.min(100, Math.round(progress.received / progress.total * 100))}%` : tr('Загрузка…', 'Downloading...');
      setStatus(label);
      bannerText.textContent = `${label} · ${tr('версия', 'version')} ${release.latest}`;
      banner.hidden = false;
    });
    try {
      setStatus(tr('Загрузка обновления…', 'Downloading update...'));
      const downloaded = await api.downloadUpdate();
      if (!downloaded?.ok) { setStatus(translateError(downloaded?.error) || tr('Не удалось скачать обновление', 'Could not download the update')); return; }
      if (release.mode !== 'manual') {
        if (state.currentTabs.some(tab => tab.modified)) {
          setStatus(tr('Есть несохранённые файлы. Сохраните их и повторите установку.', 'There are unsaved files. Save them and try installing again.'));
          return;
        }
        if (!window.confirm(tr('Processing Studio закроется для установки обновления. Сохраните файлы во всех окнах. Продолжить?', 'Processing Studio will close to install the update. Save files in every window. Continue?'))) {
          setStatus(tr('Обновление скачано. Установку можно продолжить позже.', 'Update downloaded. You can install it later.'));
          return;
        }
      }
      setStatus(release.mode === 'manual' ? tr('Открываем скачанный пакет…', 'Opening the downloaded package...') : tr('Установка начнётся после закрытия IDE', 'Installation will start after the IDE closes'));
      const installed = await api.installUpdate();
      if (!installed?.ok) setStatus(translateError(installed?.error) || tr('Не удалось установить обновление', 'Could not install the update'));
      else if (installed.mode === 'manual') setStatus(translateError(installed.message));
    } catch {
      setStatus(tr('Не удалось установить обновление', 'Could not install the update'));
    } finally {
      off?.();
      busy = false;
      checkButton.disabled = false;
      actionButton.disabled = false;
      bannerGo.disabled = false;
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
  foundInstall?.addEventListener('click', () => { closeFoundModal(); update(); });
  foundModal?.addEventListener('click', event => { if (event.target === foundModal) closeFoundModal(); });
  foundModal?.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeFoundModal(); }
  });

  api.updatesInfo?.().then(info => {
    if (info?.ok) version.textContent = `${tr('Версия', 'Version')} ${info.current}`;
  }).catch(() => {});
  setTimeout(() => check(true), 4000);
}
