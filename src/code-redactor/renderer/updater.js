import { icon } from './glyphs.js';
import { state } from './state.js';

const GAP = 12 * 60 * 60 * 1000;
const CHECKED_KEY = 'processing-studio.update.checked';
const DISMISSED_KEY = 'processing-studio.update.dismissed';
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
  if (!api?.checkUpdates || !status || !banner) return;

  const bannerText = banner.querySelector('.updates-banner-text');
  const bannerGo = banner.querySelector('.updates-banner-go');
  const bannerDetails = banner.querySelector('.updates-banner-details');
  const bannerClose = banner.querySelector('.updates-banner-close');
  bannerClose.innerHTML = icon('close', 14);
  let release = null;
  let busy = false;

  const setStatus = text => { status.textContent = text; };
  const formatSize = bytes => `${Math.round(bytes / 1024 / 1024)} МБ`;
  const showBanner = () => {
    if (!release?.available || localStorage.getItem(DISMISSED_KEY) === release.latest) return;
    bannerText.textContent = `Доступна версия ${release.latest}`;
    banner.hidden = false;
  };
  const canDownload = () => !!(release?.packaged && release?.asset);
  const openRelease = () => api.openExternal?.(release?.url || 'https://github.com/ArduRadioKot/Processing-Studio/releases/latest');

  function paint() {
    if (!release?.ok) return;
    if (!release.available) {
      setStatus('Установлена последняя версия');
      notes.hidden = true;
      actionButton.hidden = true;
      banner.hidden = true;
      return;
    }
    const size = release.asset?.size ? `, ${formatSize(release.asset.size)}` : '';
    setStatus(`Доступна версия ${release.latest}${size}`);
    notes.textContent = release.notes || '';
    notes.hidden = !release.notes;
    actionButton.hidden = false;
    actionButton.textContent = canDownload() ? (release.mode === 'manual' ? 'Скачать пакет' : 'Скачать и установить') : 'Открыть релиз';
    bannerGo.textContent = canDownload() ? 'Обновить' : 'Скачать';
    showBanner();
  }

  async function check() {
    if (busy) return;
    busy = true;
    checkButton.disabled = true;
    setStatus('Проверка обновлений…');
    try {
      const result = await api.checkUpdates();
      if (!result?.ok) {
        setStatus(result?.error || 'Не удалось проверить обновления');
        return;
      }
      release = result;
      localStorage.setItem(CHECKED_KEY, String(Date.now()));
      paint();
    } catch {
      setStatus('Не удалось проверить обновления');
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
      const label = progress.total ? `Загрузка… ${Math.min(100, Math.round(progress.received / progress.total * 100))}%` : 'Загрузка…';
      setStatus(label);
      bannerText.textContent = `${label} · версия ${release.latest}`;
      banner.hidden = false;
    });
    try {
      setStatus('Загрузка обновления…');
      const downloaded = await api.downloadUpdate();
      if (!downloaded?.ok) { setStatus(downloaded?.error || 'Не удалось скачать обновление'); return; }
      if (release.mode !== 'manual') {
        if (state.currentTabs.some(tab => tab.modified)) {
          setStatus('Есть несохранённые файлы. Сохраните их и повторите установку.');
          return;
        }
        if (!window.confirm('Processing Studio закроется для установки обновления. Сохраните файлы во всех окнах. Продолжить?')) {
          setStatus('Обновление скачано. Установку можно продолжить позже.');
          return;
        }
      }
      setStatus(release.mode === 'manual' ? 'Открываем скачанный пакет…' : 'Установка начнётся после закрытия IDE');
      const installed = await api.installUpdate();
      if (!installed?.ok) setStatus(installed?.error || 'Не удалось установить обновление');
      else if (installed.mode === 'manual') setStatus(installed.message);
    } catch {
      setStatus('Не удалось установить обновление');
    } finally {
      off?.();
      busy = false;
      checkButton.disabled = false;
      actionButton.disabled = false;
      bannerGo.disabled = false;
    }
  }

  checkButton.addEventListener('click', check);
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

  api.updatesInfo?.().then(info => {
    if (info?.ok) version.textContent = `Версия ${info.current}`;
  }).catch(() => {});
  const last = Number(localStorage.getItem(CHECKED_KEY) || 0);
  if (!last || Date.now() - last > GAP) setTimeout(check, 4000);
}
