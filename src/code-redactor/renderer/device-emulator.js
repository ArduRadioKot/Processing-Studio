/**
 * Phone emulator: a device panel for writing Processing applications.
 *
 * The sketch runs inside an iframe with a compact Processing-compatible runtime
 * (see device-runtime.js). The panel draws the device frame, feeds the sensors,
 * collects the console output and connects the sketch to the IDE.
 */

import { state } from './state.js';
import { isEditorTab } from './tab-model.js';
import { createProcessingRuntime } from './device-runtime.js';
import { transpileProcessing } from './device-transpile.js';
import { loadProject, PERMISSIONS } from './android-project.js';

/**
 * Пропорции взяты с реальных устройств:
 *  w/h  - разрешение экрана в логических пикселях,
 *  dpr  - плотность,
 *  bezel - толщина рамки корпуса (в тех же логических пикселях),
 *  radius - радиус скругления корпуса,
 *  camera - 'island' (Dynamic Island), 'hole' (точечная камера), 'none'.
 */
export const DEVICES = {
  'iphone-se': { label: 'iPhone SE · 375×667', w: 375, h: 667, dpr: 2, camera: 'none', bezel: 30, radius: 14 },
  'iphone-13': { label: 'iPhone 13 · 390×844', w: 390, h: 844, dpr: 3, camera: 'island', bezel: 9, radius: 47 },
  'iphone-14-pro': { label: 'iPhone 14 Pro · 393×852', w: 393, h: 852, dpr: 3, camera: 'island', bezel: 8, radius: 49 },
  'pixel-5': { label: 'Pixel 5 · 393×851', w: 393, h: 851, dpr: 2.75, camera: 'hole', bezel: 12, radius: 30 },
  'pixel-7': { label: 'Pixel 7 · 412×915', w: 412, h: 915, dpr: 2.6, camera: 'hole', bezel: 10, radius: 33 },
  'galaxy-s20': { label: 'Galaxy S20 · 360×800', w: 360, h: 800, dpr: 3, camera: 'hole', bezel: 9, radius: 16 },
  'ipad-mini': { label: 'iPad mini · 744×1133', w: 744, h: 1133, dpr: 2, camera: 'none', bezel: 24, radius: 22 },
  'custom': { label: 'Свой размер…', w: 390, h: 844, dpr: 2, camera: 'hole', bezel: 10, radius: 40 },
};

const STORAGE_KEY = 'frogee.device.settings';

const panel = {
  built: false,
  device: 'iphone-13',
  custom: { w: 390, h: 844, dpr: 2 },
  landscape: false,
  running: false,
  visible: false,
  fps: 0,
  sketch: null,
  side: 'sensors',
  keyboard: false,
  touches: true,
  locked: false,
  errors: 0,
  sensors: { x: 0, y: 0, z: 9.81, heading: 0 },
  project: null,
  permissions: {},
  prefs: {},
  dataFiles: {},
  offsets: [],
  inBackground: false,
  pendingPermission: null,
  els: {},
};

const ICON = {
  play: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 3.2 12.5 8l-8 4.8z"/></svg>',
  stop: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="4" width="8" height="8" rx="1.5"/></svg>',
  rotate: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.8v2.6h-2.6"/></svg>',
  keyboard: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="1.8" y="4" width="12.4" height="8" rx="1.6"/><path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4 9.5h8"/></svg>',
  touch: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg>',
  camera: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 5.5h2.2l1-1.7h5.6l1 1.7H14v7.3H2z"/><circle cx="8" cy="9" r="2.4"/></svg>',
  trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5"/></svg>',
  phone: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="4.5" y="1.8" width="7" height="12.4" rx="1.8"/><path d="M7 3.4h2"/></svg>',
};

const el = (sel, root = document) => root.querySelector(sel);

// ── Panel construction ───────────────────────────────────────────────────────────────────────

function panelHtml() {
  const options = Object.entries(DEVICES)
    .map(([key, d]) => `<option value="${key}">${d.label}</option>`)
    .join('');
  return `
  <div class="device-panel">
    <div class="device-toolbar">
      <div class="device-row">
        <span class="device-ico">${ICON.phone}</span>
        <select class="device-select" title="Модель устройства">${options}</select>
        <input class="device-custom" type="text" title="Свой размер: 390x844 @2" placeholder="390x844 @2" hidden>
        <button type="button" class="device-btn device-btn-icon" data-act="rotate" title="Повернуть экран">${ICON.rotate}</button>
        <button type="button" class="device-btn device-btn-primary" data-act="run" title="Запустить скетч (F6)">${ICON.play}<span>Запустить</span></button>
        <button type="button" class="device-btn" data-act="stop" title="Остановить скетч">${ICON.stop}<span>Стоп</span></button>
      </div>
      <div class="device-row">
        <span class="device-chip" data-role="fps">- FPS</span>
        <button type="button" class="device-btn" data-act="background" title="Свернуть приложение в фон">⏸</button>
        <button type="button" class="device-btn" data-act="panel-sensors" title="Панель датчиков">Датчики</button>
        <button type="button" class="device-btn" data-act="panel-console" title="Консоль скетча">Консоль<span class="device-badge device-badge-inline" data-role="badge" hidden>0</span></button>
        <span class="device-flex"></span>
        <button type="button" class="device-btn device-btn-icon" data-act="keyboard" title="Передавать клавиатуру устройству">${ICON.keyboard}</button>
        <button type="button" class="device-btn device-btn-icon active" data-act="touches" title="Показывать касания">${ICON.touch}</button>
        <button type="button" class="device-btn device-btn-icon" data-act="shot" title="Сохранить скриншот">${ICON.camera}</button>
        <button type="button" class="device-btn device-btn-icon" data-act="clear" title="Очистить консоль">${ICON.trash}</button>
      </div>
    </div>

    <div class="device-body">
      <div class="device-stage" data-role="stage">
        <div class="phone" data-role="phone">
          <div class="phone-inner" data-role="phone-inner">
            <div class="phone-body" data-role="phone-body">
              <div class="phone-screen" data-role="screen">
                <iframe class="phone-iframe" data-role="frame" title="Экран устройства"></iframe>
                <div class="phone-status">
                  <span data-role="clock">00:00</span>
                  <span class="phone-status-right">
                    <span class="phone-signal"><i></i><i></i><i></i><i></i></span>
                    <span class="phone-wifi"></span>
                    <span class="phone-battery"><b data-role="battery"></b></span>
                  </span>
                </div>
                <div class="phone-home-bar"></div>
                <div class="phone-camera" data-role="camera" hidden></div>
                <div class="phone-permission" data-role="perm-dialog" hidden>
                  <div class="phone-permission-icon">!</div>
                  <div class="phone-permission-title">Запрос разрешения</div>
                  <div class="phone-permission-text">
                    Приложению <b data-role="perm-app">-</b> нужно разрешение
                    <b data-role="perm-name">-</b>
                  </div>
                  <div class="phone-permission-actions">
                    <button type="button" class="phone-permission-btn" data-act="perm-deny">Отклонить</button>
                    <button type="button" class="phone-permission-btn primary" data-act="perm-allow">Разрешить</button>
                  </div>
                </div>
                <div class="phone-lock" data-role="lock" hidden>
                  <div class="phone-lock-clock" data-role="lock-clock">00:00</div>
                  <div class="phone-lock-hint">Нажмите, чтобы включить экран</div>
                </div>
              </div>
              <div class="phone-side phone-side-power" data-role="power" title="Питание"></div>
              <div class="phone-side phone-side-back" data-role="back" title="Кнопка «Назад»"></div>
              <div class="phone-side phone-side-up" data-role="volup" title="Громкость +"></div>
              <div class="phone-side phone-side-down" data-role="voldown" title="Громкость −"></div>
              <div class="phone-antenna"></div>
            </div>
          </div>
        </div>
        <div class="device-empty" data-role="empty">
          <div class="device-empty-title">Эмулятор телефона</div>
          <div class="device-empty-text">Откройте файл <b>.pde</b> и нажмите «Запустить» - скетч соберётся в наш Processing-совместимый рантайм и запустится на экране устройства.</div>
        </div>
      </div>

      <aside class="device-side collapsed" data-role="drawer">
        <div class="device-side-tabs">
          <button type="button" class="device-side-tab" data-panel="sensors">Датчики</button>
          <button type="button" class="device-side-tab" data-panel="project">Проект</button>
          <button type="button" class="device-side-tab" data-panel="console">Консоль<span class="device-badge" data-role="badge-inner" hidden>0</span></button>
          <span class="device-flex"></span>
          <button type="button" class="device-side-close" data-act="panel-close" title="Свернуть панель">✕</button>
        </div>

        <div class="device-side-body" data-panel-body="sensors">
          <div class="device-block">
            <div class="device-block-title">Наклон</div>
            <div class="tilt-pad" data-role="tilt"><div class="tilt-dot" data-role="tilt-dot"></div></div>
            <div class="device-hint">Тяните точку, чтобы наклонить устройство</div>
          </div>
          <div class="device-block">
            <div class="device-block-title">Акселерометр</div>
            <label class="device-slider"><span>X</span><input type="range" min="-20" max="20" step="0.1" value="0" data-role="acc-x"><output data-role="acc-x-out">0.0</output></label>
            <label class="device-slider"><span>Y</span><input type="range" min="-20" max="20" step="0.1" value="0" data-role="acc-y"><output data-role="acc-y-out">0.0</output></label>
            <label class="device-slider"><span>Z</span><input type="range" min="-20" max="20" step="0.1" value="9.81" data-role="acc-z"><output data-role="acc-z-out">9.81</output></label>
          </div>
          <div class="device-block">
            <div class="device-block-title">Курс</div>
            <label class="device-slider"><span>°</span><input type="range" min="0" max="359" step="1" value="0" data-role="heading"><output data-role="heading-out">0</output></label>
          </div>
          <div class="device-block">
            <div class="device-block-title">События</div>
            <div class="device-actions">
              <button type="button" class="device-btn" data-act="shake">Тряхнуть</button>
              <button type="button" class="device-btn" data-act="reset-sensors">Сбросить датчики</button>
            </div>
            <div class="device-hint">Клавиатура устройства: <b data-role="keyb-state">выключена</b></div>
          </div>
          <div class="device-block">
            <div class="device-block-title">Ориентация</div>
            <div class="device-hint" data-role="orientation">Книжная · 0°</div>
            <div class="device-hint">Экран: <span data-role="size">-</span></div>
          </div>
        </div>

        <div class="device-side-body" data-panel-body="project" hidden>
          <div class="device-block">
            <div class="device-block-title">Приложение</div>
            <div class="device-hint">Package: <b data-role="pkg">-</b></div>
            <div class="device-hint">Название: <span data-role="app-name">-</span></div>
            <div class="device-hint">API: <span data-role="api-level">-</span> · плотность <span data-role="density">-</span></div>
          </div>
          <div class="device-block">
            <div class="device-block-title">Разрешения</div>
            <div data-role="perms" class="device-perms"><div class="device-hint">Разрешения не запрошены</div></div>
            <div class="device-actions">
              <button type="button" class="device-btn" data-act="ask-permission">Запросить разрешение</button>
            </div>
          </div>
          <div class="device-block">
            <div class="device-block-title">Настройки (SharedPreferences)</div>
            <div class="device-hint">Ключ и значение сохраняются между запусками.</div>
            <div class="device-prefs">
              <input type="text" data-role="pref-key" placeholder="ключ">
              <input type="text" data-role="pref-value" placeholder="значение">
              <button type="button" class="device-btn" data-act="pref-save">Записать</button>
            </div>
            <div class="device-hint" data-role="pref-state">-</div>
          </div>
          <div class="device-block">
            <div class="device-block-title">Местоположение</div>
            <label class="device-slider"><span>Ш</span><input type="range" min="-90" max="90" step="0.1" value="55.75" data-role="lat"><output data-role="lat-out">55.75</output></label>
            <label class="device-slider"><span>Д</span><input type="range" min="-180" max="180" step="0.1" value="37.62" data-role="lon"><output data-role="lon-out">37.62</output></label>
            <div class="device-actions">
              <button type="button" class="device-btn" data-act="geo">Отправить координаты</button>
            </div>
          </div>
        </div>

        <div class="device-side-body" data-panel-body="console" hidden>
          <div class="device-console" data-role="console"></div>
        </div>
      </aside>
    </div>
  </div>`;
}

function ensurePanel() {
  if (panel.built) return;
  const host = document.getElementById('device-host');
  if (!host) return;
  host.innerHTML = panelHtml();
  panel.built = true;

  const q = (role) => host.querySelector(`[data-role="${role}"]`);
  panel.els = {
    host,
    select: el('.device-select', host),
    custom: el('.device-custom', host),
    fps: q('fps'),
    size: q('size'),
    stage: q('stage'),
    phone: q('phone'),
    phoneInner: q('phone-inner'),
    phoneBody: q('phone-body'),
    screen: q('screen'),
    frame: q('frame'),
    lock: q('lock'),
    lockClock: q('lock-clock'),
    clock: q('clock'),
    empty: q('empty'),
    tilt: q('tilt'),
    tiltDot: q('tilt-dot'),
    console: q('console'),
    camera: q('camera'),
    badge: q('badge'),
    drawer: el('.device-side', host),
    keybState: q('keyb-state'),
    orientation: q('orientation'),
  };

  panel.els.select.value = panel.device;
  wireToolbar();
  wireSensors();
  wireMessages();
  restoreSettings();
  updateClock();
  setInterval(updateClock, 20000);
  applyDevice();
}

function updateClock() {
  const now = new Date();
  const text = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (panel.els.clock) panel.els.clock.textContent = text;
  if (panel.els.lockClock) panel.els.lockClock.textContent = text;
}

// ── Toolbar ──────────────────────────────────────────────────────────────────────────────────

function wireToolbar() {
  const host = panel.els.host;

  panel.els.select?.addEventListener('change', () => {
    panel.device = panel.els.select.value;
    const custom = panel.els.select.value === 'custom';
    if (panel.els.custom) panel.els.custom.hidden = !custom;
    if (custom) {
      const parsed = parseSize(panel.els.custom.value);
      if (parsed) panel.custom = parsed;
    }
    applyDevice();
    saveSettings();
  });

  panel.els.custom?.addEventListener('change', () => {
    const parsed = parseSize(panel.els.custom.value);
    if (!parsed) { addLog('warn', 'Размер не понят. Ожидается 390x844 или 390x844 @3'); return; }
    panel.custom = parsed;
    applyDevice();
    saveSettings();
  });

  host.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'run') runCurrentSketch();
      else if (act === 'stop') stopSketch();
      else if (act === 'rotate') { panel.landscape = !panel.landscape; applyDevice(); saveSettings(); }
      else if (act === 'keyboard') {
        panel.keyboard = !panel.keyboard;
        btn.classList.toggle('active', panel.keyboard);
        if (panel.els.keybState) panel.els.keybState.textContent = panel.keyboard ? 'включена' : 'выключена';
        saveSettings();
      } else if (act === 'touches') {
        panel.touches = !panel.touches;
        btn.classList.toggle('active', panel.touches);
        if (panel.running) runCurrentSketch();
        saveSettings();
      } else if (act === 'shot') saveScreenshot();
      else if (act === 'clear') clearConsole();
      else if (act === 'panel-sensors') setSidePanel(panel.side === 'sensors' && !panel.els.drawer?.classList.contains('collapsed') ? null : 'sensors');
      else if (act === 'panel-console') setSidePanel(panel.side === 'console' && !panel.els.drawer?.classList.contains('collapsed') ? null : 'console');
      else if (act === 'panel-close') setSidePanel(null);
      else if (act === 'shake') sendShake();
      else if (act === 'reset-sensors') resetSensors();
      else if (act === 'perm-allow') resolvePermission(true);
      else if (act === 'background') toggleBackground();
      else if (act === 'perm-deny') resolvePermission(false);
      else if (act === 'ask-permission') askPermissionDialog();
      else if (act === 'pref-save') savePrefFromForm();
      else if (act === 'geo') sendLocation();
    });
  });

  panel.els.frame?.addEventListener('load', () => {
    try { panel.els.frame.contentWindow.focus(); } catch (err) { /* the frame is not ready */ }
  });
}

function parseSize(text) {
  const m = String(text || '').match(/(\d{2,4})\s*[x×*]\s*(\d{2,4})(?:\s*@\s*(\d+(?:\.\d+)?))?/i);
  if (!m) return null;
  return { w: +m[1], h: +m[2], dpr: m[3] ? +m[3] : 2 };
}

// ── Sensors ─────────────────────────────────────────────────────────────────────────────────

function wireSensors() {
  const pad = panel.els.tilt;
  if (!pad) return;

  const setFromEvent = (e) => {
    const rect = pad.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    setTilt(x, y);
  };

  let dragging = false;
  pad.addEventListener('pointerdown', (e) => {
    dragging = true;
    pad.setPointerCapture(e.pointerId);
    setFromEvent(e);
  });
  pad.addEventListener('pointermove', (e) => { if (dragging) setFromEvent(e); });
  pad.addEventListener('pointerup', (e) => {
    dragging = false;
    try { pad.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
  });

  const bind = (role, key, out) => {
    const input = panel.els.host.querySelector(`[data-role="${role}"]`);
    if (!input) return;
    input.addEventListener('input', () => {
      const value = parseFloat(input.value);
      panel.sensors[key] = value;
      const outEl = panel.els.host.querySelector(`[data-role="${out}"]`);
      if (outEl) outEl.textContent = value.toFixed(2).replace(/\.00$/, '');
      pushSensors();
    });
  };
  const geo = (role, out) => {
    const input = panel.els.host.querySelector(`[data-role="${role}"]`);
    if (!input) return;
    input.addEventListener('input', () => {
      const outEl = panel.els.host.querySelector(`[data-role="${out}"]`);
      if (outEl) outEl.textContent = parseFloat(input.value).toFixed(2);
    });
  };
  geo('lat', 'lat-out');
  geo('lon', 'lon-out');
  bind('acc-x', 'x', 'acc-x-out');
  bind('acc-y', 'y', 'acc-y-out');
  bind('acc-z', 'z', 'acc-z-out');
  bind('heading', 'heading', 'heading-out');
}

function setTilt(x, y) {
  panel.sensors.x = Math.max(-1, Math.min(1, x)) * 9.81;
  panel.sensors.y = Math.max(-1, Math.min(1, y)) * 9.81;
  panel.sensors.z = 9.81;
  syncSensorInputs();
  pushSensors();
}

function syncSensorInputs() {
  const set = (role, out, value) => {
    const input = panel.els.host?.querySelector(`[data-role="${role}"]`);
    if (input) input.value = String(value);
    const outEl = panel.els.host?.querySelector(`[data-role="${out}"]`);
    if (outEl) outEl.textContent = Number(value).toFixed(2).replace(/\.00$/, '');
  };
  set('acc-x', 'acc-x-out', panel.sensors.x);
  set('acc-y', 'acc-y-out', panel.sensors.y);
  set('acc-z', 'acc-z-out', panel.sensors.z);
  set('heading', 'heading-out', panel.sensors.heading);
  const dot = panel.els.tiltDot;
  if (dot) {
    const x = Math.max(-1, Math.min(1, panel.sensors.x / 9.81));
    const y = Math.max(-1, Math.min(1, panel.sensors.y / 9.81));
    dot.style.left = `${50 + x * 42}%`;
    dot.style.top = `${50 + y * 42}%`;
  }
}

function resetSensors() {
  panel.sensors = { x: 0, y: 0, z: 9.81, heading: 0 };
  syncSensorInputs();
  pushSensors();
}

function pushSensors() {
  const frame = panel.els.frame;
  if (!frame || !frame.contentWindow) return;
  try {
    frame.contentWindow.postMessage({
      source: 'frogee-device-host',
      type: 'sensor',
      x: panel.sensors.x,
      y: panel.sensors.y,
      z: panel.sensors.z,
      heading: panel.sensors.heading,
      rotation: panel.landscape ? 90 : 0,
      orientation: panel.landscape ? 'landscape' : 'portrait',
    }, '*');
  } catch (err) { /* the frame is gone */ }
}

/** Сворачивает приложение в фон: вызывается onPause(), как в Android. */
function toggleBackground() {
  panel.inBackground = !panel.inBackground;
  const frame = panel.els.frame;
  try {
    frame?.contentWindow?.postMessage({ source: 'frogee-device-host', type: 'lifecycle', paused: panel.inBackground }, '*');
  } catch (err) { /* кадр закрыт */ }
  const btn = panel.els.host?.querySelector('[data-act="background"]');
  if (btn) {
    btn.classList.toggle('active', panel.inBackground);
    btn.title = panel.inBackground ? 'Вернуть приложение из фона' : 'Свернуть приложение в фон';
  }
  if (panel.els.lock) panel.els.lock.hidden = !panel.inBackground;
  addLog('info', panel.inBackground ? 'Приложение ушло в фон (onPause).' : 'Приложение вернулось (onResume).');
}

function askPermissionDialog() {
  const options = PERMISSIONS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
  const el = document.createElement('div');
  el.className = 'ps-modal';
  el.innerHTML = `
    <div class="ps-modal-box">
      <div class="ps-modal-head"><h2>Запрос разрешения</h2><button type="button" class="ps-close" data-close>✕</button></div>
      <div class="ps-modal-body">
        <div class="ps-field">
          <label for="ps-perm">Разрешение</label>
          <select id="ps-perm">${options}</select>
        </div>
      </div>
      <div class="ps-modal-foot">
        <button type="button" class="ps-btn ghost" data-close>Отмена</button>
        <button type="button" class="ps-btn primary" id="ps-perm-ok">Запросить</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => el.remove()));
  el.querySelector('#ps-perm-ok').addEventListener('click', () => {
    const permission = el.querySelector('#ps-perm').value;
    el.remove();
    askPermission(permission);
  });
}

function savePrefFromForm() {
  const key = panel.els.host?.querySelector('[data-role="pref-key"]')?.value?.trim();
  const value = panel.els.host?.querySelector('[data-role="pref-value"]')?.value ?? '';
  if (!key) return;
  panel.prefs[key] = value;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(panel.prefs)); } catch (err) { /* нет хранилища */ }
  renderPrefs();
  const frame = panel.els.frame;
  try {
    frame?.contentWindow?.postMessage({ source: 'frogee-device-host', type: 'prefs', data: panel.prefs }, '*');
  } catch (err) { /* кадр закрыт */ }
}

function sendLocation() {
  const lat = parseFloat(panel.els.host?.querySelector('[data-role="lat"]')?.value || '0');
  const lon = parseFloat(panel.els.host?.querySelector('[data-role="lon"]')?.value || '0');
  const frame = panel.els.frame;
  try {
    frame?.contentWindow?.postMessage({ source: 'frogee-device-host', type: 'location', lat, lon, alt: 0, accuracy: 5 }, '*');
  } catch (err) { /* кадр закрыт */ }
  addLog('info', `Координаты отправлены: ${lat}, ${lon}`);
}

function sendShake() {
  const frame = panel.els.frame;
  if (!frame || !frame.contentWindow) return;
  try {
    frame.contentWindow.postMessage({ source: 'frogee-device-host', type: 'sensor', shake: true }, '*');
  } catch (err) { /* the frame is gone */ }
}

// ── Device geometry ─────────────────────────────────────────────────────────────────────────

function currentDevice() {
  const base = panel.device === 'custom'
    ? { ...panel.custom, camera: 'hole', bezel: 10, radius: 40 }
    : (DEVICES[panel.device] || DEVICES['iphone-13']);
  return base;
}

function applyDevice() {
  if (!panel.built) return;
  const dev = currentDevice();
  // In landscape the screen simply becomes wide: the sketch sees the swapped size.
  const sw = panel.landscape ? dev.h : dev.w;
  const sh = panel.landscape ? dev.w : dev.h;
  const bezel = dev.bezel ?? 10;
  const bodyW = sw + bezel * 2;
  const bodyH = sh + bezel * 2;

  const body = panel.els.phoneBody;
  if (body) {
    body.classList.toggle('is-landscape', panel.landscape);
    // Силуэт - по реальному устройству: свой кант и свой радиус.
    body.style.setProperty('--phone-radius', `${dev.radius ?? Math.round(dev.w * 0.115)}px`);
    body.style.setProperty('--phone-bezel', `${dev.bezel ?? 10}px`);
    body.style.width = `${bodyW}px`;
    body.style.height = `${bodyH}px`;
    body.style.marginLeft = `${-bodyW / 2}px`;
    body.style.marginTop = `${-bodyH / 2}px`;
  }
  if (panel.els.screen) {
    panel.els.screen.style.width = `${sw}px`;
    panel.els.screen.style.height = `${sh}px`;
  }
  if (panel.els.phoneInner) {
    panel.els.phoneInner.style.width = `${bodyW}px`;
    panel.els.phoneInner.style.height = `${bodyH}px`;
  }
  if (panel.els.size) {
    panel.els.size.textContent = `${sw}×${sh} @${dev.dpr}x`;
  }
  // Вырез: Dynamic Island у iPhone, точечная камера у Pixel и Galaxy.
  const camera = panel.els.camera;
  if (camera) {
    const kind = dev.camera || 'hole';
    camera.hidden = kind === 'none';
    camera.className = `phone-camera phone-camera-${kind}`;
  }
  if (panel.els.orientation) {
    panel.els.orientation.textContent = panel.landscape ? 'Альбомная · 90°' : 'Книжная · 0°';
  }
  fitPhone();
  if (panel.running) runCurrentSketch();
}

function fitPhone() {
  if (!panel.built) return;
  const stage = panel.els.stage;
  const phone = panel.els.phone;
  const inner = panel.els.phoneInner;
  if (!stage || !phone || !inner) return;
  const dev = currentDevice();
  const bezel = dev.bezel ?? 10;
  const sw = panel.landscape ? dev.h : dev.w;
  const sh = panel.landscape ? dev.w : dev.h;
  const innerW = sw + bezel * 2;
  const innerH = sh + bezel * 2;
  const rect = stage.getBoundingClientRect();
  const availW = Math.max(80, rect.width - 24);
  const availH = Math.max(80, rect.height - 24);
  const k = Math.max(0.12, Math.min(availW / innerW, availH / innerH));
  phone.style.width = `${innerW * k}px`;
  phone.style.height = `${innerH * k}px`;
  inner.style.transform = `scale(${k})`;
}

// ── Running a sketch ────────────────────────────────────────────────────────────────────────

function sketchFromEditor() {
  const tab = state.currentTabs[state.activeTabIndex];
  if (!tab || !isEditorTab(tab)) return null;
  const name = tab.name || '';
  if (!/\.(pde|js|jsx|mjs)$/i.test(name)) return null;
  // The tab content is kept in sync with the editor on every keystroke.
  const code = tab.content || '';
  return { name, code, filePath: tab.filePath || null };
}

function currentSketch() {
  const active = sketchFromEditor();
  if (active) return active;
  // The active file is not a sketch - take the last .pde tab that is open.
  for (let i = state.currentTabs.length - 1; i >= 0; i--) {
    const tab = state.currentTabs[i];
    if (tab && isEditorTab(tab) && /\.(pde|js|jsx|mjs)$/i.test(tab.name || '')) {
      return { name: tab.name, code: tab.content || '', filePath: tab.filePath || null };
    }
  }
  return panel.sketch;
}

/**
 * All tabs of the sketch. Processing preprocesses several .pde files into one class,
 * so the functions and variables of one tab are visible in the others.
 */
async function collectSketchSources(sketch) {
  const files = [];
  const seen = new Set();
  const dir = sketch.filePath ? baseDirOf(sketch.filePath) : '';
  const add = (name, path, code) => {
    const key = path || name;
    if (seen.has(key)) return;
    seen.add(key);
    files.push({ name, path: path || null, code: code || '' });
  };

  // Open tabs first: they may hold unsaved changes.
  for (const tab of state.currentTabs) {
    if (!tab || !isEditorTab(tab)) continue;
    if (!/\.pde$/i.test(tab.name || '')) continue;
    if (dir && tab.filePath && baseDirOf(tab.filePath) !== dir) continue;
    add(tab.name, tab.filePath, tab.content);
  }
  // Then the .pde files of the folder that are not open.
  if (dir) {
    try {
      const res = await window.electronAPI?.listFiles?.(dir);
      for (const file of res?.files || []) {
        if (file.isDirectory || !/\.pde$/i.test(file.name)) continue;
        if (seen.has(file.path)) continue;
        const content = await window.electronAPI.getFileContent(file.path);
        if (content?.success) add(file.name, file.path, content.content);
      }
    } catch (err) { /* папки нет */ }
  }
  if (!files.length && sketch.code) add(sketch.name, sketch.filePath, sketch.code);

  // The main tab is the one named like the folder - as in Processing.
  const folderName = dir ? dir.split(/[\\/]/).pop() : '';
  const main = files.find((f) => folderName && f.name.replace(/\.pde$/i, '') === folderName)
    || files.find((f) => f.path === sketch.filePath)
    || files[0];
  if (main) {
    const index = files.indexOf(main);
    files.splice(index, 1);
    files.unshift(main);
  }
  return files;
}

/** Concatenates the tabs into one script and remembers the line offsets of each file. */
function buildSketchScript(sources) {
  let code = '';
  const offsets = [];
  let line = 1;
  const parts = sources.map((source, index) => {
    const result = transpileProcessing(source.code || '');
    let part = result.code;
    if (index > 0) {
      // setup()/draw() belongs to the main tab: the other tabs get their own names.
      part = part.replace(/^(\s*)function (setup|draw)\s*\(/gm, '$1function $2__$3(');
    }
    return part;
  });
  parts.forEach((part, index) => {
    const lines = part.split('\n').length;
    offsets.push({ name: sources[index].name, path: sources[index].path, start: line, end: line + lines - 1 });
    code += part + '\n';
    line += lines + 1;
  });
  if (!/\bfunction\s+(setup|draw)\s*\(/.test(code)) {
    addLog('warn', 'В скетче нет setup()/draw() - экран останется пустым.');
  }
  return { code, offsets };
}

/** Maps a line of the combined script back to the file it came from. */
function locateSketchLine(line) {
  if (!line) return null;
  for (const offset of panel.offsets) {
    if (line >= offset.start && line <= offset.end) {
      return { name: offset.name, line: line - offset.start + 1 };
    }
  }
  return null;
}

/** Файлы из data/ проекта - как assets в Processing for Android. */
async function loadSketchData(sketchPath) {
  const files = {};
  if (!sketchPath) return files;
  const dir = baseDirOf(sketchPath);
  try {
    const res = await window.electronAPI?.listFiles?.(`${dir}/data`);
    if (!res?.success || !res.files?.length) return files;
    for (const file of res.files) {
      if (file.isDirectory) continue;
      const content = await window.electronAPI.getFileContent(file.path);
      if (content?.success) files[file.name] = content.content;
    }
  } catch (err) { /* папки data нет */ }
  return files;
}

function baseDirOf(filePath) {
  if (!filePath) return '';
  return String(filePath).replace(/[\\/][^\\/]*$/, '');
}

function buildFrameHtml(sketch, frameOpts) {
  const runtimeSrc = createProcessingRuntime.toString();
  const payload = JSON.stringify(`${sketch}\n//# sourceURL=sketch.pde\n`).replace(/<\//g, '<\\/');
  const opts = JSON.stringify(frameOpts).replace(/<\//g, '<\\/');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;overflow:hidden;background:#000;}</style></head>
<body>
<script>window.__frogee = (${runtimeSrc})(${opts}); window.__frogee.install();</script>
<script>
try { (0, eval)(${payload}); } catch (err) { window.__frogee.__report(err); }
</script>
<script>window.__frogee.start();</script>
</body></html>`;
}

export async function runCurrentSketch() {
  ensurePanel();
  showDevicePanel();
  const sketch = currentSketch();
  if (!sketch) {
    addLog('warn', 'Нет скетча: откройте файл .pde и нажмите «Запустить».');
    return false;
  }
  panel.sketch = sketch;

  clearConsole();
  panel.errors = 0;
  updateBadge();

  // Все вкладки .pde склеиваются в один скетч - как это делает preprocessor Processing.
  const sources = await collectSketchSources(sketch);
  const built = buildSketchScript(sources);
  if (!built.code.trim()) {
    addLog('error', 'Скетч пуст.');
    return false;
  }
  panel.offsets = built.offsets;
  if (sources.length > 1) {
    addLog('info', `Вкладки: ${sources.map((s) => s.name).join(', ')}`);
  }

  const dev = currentDevice();
  try {
    panel.dataFiles = await loadSketchData(sketch.filePath);
  } catch (err) {
    panel.dataFiles = {};
  }
  const frameOpts = {
    width: panel.landscape ? dev.h : dev.w,
    height: panel.landscape ? dev.w : dev.h,
    dpr: dev.dpr,
    baseDir: baseDirOf(sketch.filePath),
    showTouches: panel.touches,
    packageName: panel.project?.packageName || 'com.example.sketch',
    permissions: panel.permissions,
    preferences: panel.prefs,
    dataFiles: panel.dataFiles,
  };

  addLog('info', `Запуск: ${sketch.name} · ${frameOpts.width}×${frameOpts.height} @${dev.dpr}x`);

  const frame = panel.els.frame;
  if (!frame) return false;
  frame.srcdoc = buildFrameHtml(built.code, frameOpts);
  panel.running = true;
  panel.locked = false;
  refreshProject();
  if (panel.els.lock) panel.els.lock.hidden = true;
  if (panel.els.empty) panel.els.empty.hidden = true;
  pushSensors();
  return true;
}

export function stopSketch() {
  const frame = panel.els?.frame;
  if (frame && frame.contentWindow) {
    try { frame.contentWindow.postMessage({ source: 'frogee-device-host', type: 'stop' }, '*'); } catch (err) { /* gone */ }
  }
  panel.running = false;
  addLog('info', 'Скетч остановлен.');
}

function saveScreenshot() {
  const frame = panel.els?.frame;
  if (!frame || !frame.contentWindow) return;
  try {
    const url = frame.contentWindow.document?.querySelector('canvas')?.toDataURL('image/png');
    if (!url) { addLog('warn', 'Скриншот недоступен.'); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = `device-${Date.now()}.png`;
    a.click();
  } catch (err) {
    addLog('warn', 'Скриншот недоступен.');
  }
}

// ── Android: разрешения, настройки, проект ─────────────────────────────────────────────

const PREFS_KEY = 'frogee.device.prefs';

const PERMISSION_LABELS = Object.fromEntries(PERMISSIONS.map((p) => [p.id, p.label]));

function askPermission(permission) {
  panel.pendingPermission = permission;
  const dialog = panel.els.host?.querySelector('[data-role="perm-dialog"]');
  if (!dialog) return;
  dialog.querySelector('[data-role="perm-app"]').textContent = panel.project?.packageName || 'com.example.sketch';
  dialog.querySelector('[data-role="perm-name"]').textContent = PERMISSION_LABELS[permission] || permission;
  dialog.hidden = false;
}

function resolvePermission(granted) {
  const permission = panel.pendingPermission;
  panel.pendingPermission = null;
  const dialog = panel.els.host?.querySelector('[data-role="perm-dialog"]');
  if (dialog) dialog.hidden = true;
  if (!permission) return;
  panel.permissions[permission] = granted;
  renderPermissions();
  const frame = panel.els.frame;
  try {
    frame?.contentWindow?.postMessage({ source: 'frogee-device-host', type: 'permission-result', permission, granted }, '*');
  } catch (err) { /* кадр закрыт */ }
}

function renderPermissions() {
  const box = panel.els.host?.querySelector('[data-role="perms"]');
  if (!box) return;
  const entries = Object.entries(panel.permissions);
  if (!entries.length) {
    box.innerHTML = '<div class="device-hint">Разрешения не запрошены</div>';
    return;
  }
  box.innerHTML = entries.map(([id, granted]) => `
    <div class="device-perm ${granted ? 'granted' : 'denied'}">
      <span>${PERMISSION_LABELS[id] || id}</span>
      <code>${id}</code>
      <b>${granted ? 'выдано' : 'запрещено'}</b>
    </div>`).join('');
}

function renderPrefs() {
  const state = panel.els.host?.querySelector('[data-role="pref-state"]');
  if (!state) return;
  const entries = Object.entries(panel.prefs || {});
  state.textContent = entries.length
    ? entries.map(([k, v]) => `${k} = ${v}`).join('  ·  ')
    : '-';
}

function renderProject() {
  const set = (role, text) => {
    const node = panel.els.host?.querySelector(`[data-role="${role}"]`);
    if (node) node.textContent = text;
  };
  const dev = currentDevice();
  set('pkg', panel.project?.packageName || 'com.example.sketch');
  set('app-name', panel.project?.name || 'Sketch');
  set('api-level', `API ${panel.project?.targetSdk || 34}`);
  set('density', `${dev.dpr}x`);
  renderPermissions();
  renderPrefs();
}

/** Подтягивает настройки проекта (processing-studio.json) рядом со скетчем. */
async function refreshProject() {
  const sketch = currentSketch();
  const root = sketch?.filePath ? baseDirOf(sketch.filePath) : state.currentFolder;
  const settings = root ? await loadProject(root) : null;
  panel.project = settings || null;
  renderProject();
}

// ── Console ─────────────────────────────────────────────────────────────────────────────────

function addLog(level, text) {
  const box = panel.els?.console;
  if (!box) return;
  const line = document.createElement('div');
  line.className = `device-log device-log-${level}`;
  line.textContent = text;
  box.appendChild(line);
  while (box.childElementCount > 400) box.removeChild(box.firstChild);
  box.scrollTop = box.scrollHeight;
  if (level === 'error') {
    panel.errors++;
    updateBadge();
  }
}

function updateBadge() {
  for (const role of ['badge', 'badge-inner']) {
    const badge = panel.els.host?.querySelector(`[data-role="${role}"]`);
    if (!badge) continue;
    badge.textContent = String(panel.errors);
    badge.hidden = panel.errors === 0;
  }
}

/** Opens the bottom drawer with the sensors or the console; null - collapses it. */
function setSidePanel(which) {
  const host = panel.els.host;
  if (!host) return;
  const drawer = host.querySelector('.device-side');
  if (drawer) drawer.classList.toggle('collapsed', !which);
  if (which) panel.side = which;
  host.querySelectorAll('.device-side-tab').forEach((tab) => {
    tab.classList.toggle('active', which && tab.dataset.panel === which);
  });
  host.querySelectorAll('[data-panel-body]').forEach((body) => {
    body.hidden = body.dataset.panelBody !== (which || panel.side);
  });
  requestAnimationFrame(fitPhone);
  // После анимации выдвижной панели телефон надо вписать заново.
  setTimeout(fitPhone, 220);
}

function clearConsole() {
  const box = panel.els?.console;
  if (box) box.innerHTML = '';
  panel.errors = 0;
  updateBadge();
}

function parseErrorLine(stack) {
  const m = String(stack || '').match(/sketch\.pde:(\d+)/);
  return m ? Number(m[1]) : null;
}

// ── Messages from the device frame ──────────────────────────────────────────────────────────

function wireMessages() {
  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || data.source !== 'frogee-device') return;
    if (data.type === 'log') addLog(data.level || 'log', data.text);
    else if (data.type === 'error') {
      const line = parseErrorLine(data.stack);
      const place = locateSketchLine(line);
      const where = place ? `Ошибка в ${place.name}, строка ${place.line}` : (line ? `Ошибка в строке ${line}` : 'Ошибка');
      addLog('error', `${where}: ${data.message}`);
      if (data.stack) addLog('trace', String(data.stack).split('\n').slice(0, 6).join('\n'));
      panel.running = false;
      setSidePanel('console');
    } else if (data.type === 'fps') {
      panel.fps = data.fps;
      if (panel.els.fps) panel.els.fps.textContent = `${data.fps} FPS`;
    } else if (data.type === 'ready') {
      panel.running = true;
      if (panel.els.empty) panel.els.empty.hidden = true;
    } else if (data.type === 'orientation') {
      // sketch зафиксировал ориентацию - поворачиваем устройство
      const mode = data.mode;
      const wantLandscape = mode === 1 || mode === 3;
      if (wantLandscape !== panel.landscape) {
        panel.landscape = wantLandscape;
        applyDevice();
      }
    } else if (data.type === 'keyboard') {
      panel.keyboard = !!data.open;
      const btn = panel.els.host?.querySelector('[data-act="keyboard"]');
      if (btn) btn.classList.toggle('active', panel.keyboard);
      if (panel.els.keybState) panel.els.keybState.textContent = panel.keyboard ? 'включена' : 'выключена';
    } else if (data.type === 'finish') {
      addLog('info', 'Приложение завершило работу (getActivity().finish()).');
      panel.running = false;
    } else if (data.type === 'save-data') {
      const root = baseDirOf(currentSketch()?.filePath);
      if (root && data.name) {
        window.electronAPI?.writeFile?.(`${root}/data/${data.name}`, data.data ?? '');
      }
    } else if (data.type === 'permission-request') {
      askPermission(data.permission);
    } else if (data.type === 'prefs') {
      panel.prefs = data.data || {};
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(panel.prefs)); } catch (err) { /* нет хранилища */ }
      renderPrefs();
    } else if (data.type === 'stopped') {
      panel.running = false;
    } else if (data.type === 'save') {
      const a = document.createElement('a');
      a.href = data.url;
      a.download = data.name || 'frame.png';
      a.click();
    }
  });

  // The keyboard of the IDE can be passed to the device.
  document.addEventListener('keydown', (e) => {
    if (!panel.keyboard || !panel.running) return;
    const tag = (e.target?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
    const frame = panel.els?.frame;
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ source: 'frogee-device-host', type: 'key', action: 'down', key: e.key, keyCode: e.keyCode, code: e.code }, '*');
    } catch (err) { /* gone */ }
    e.preventDefault();
  });
  document.addEventListener('keyup', (e) => {
    if (!panel.keyboard || !panel.running) return;
    const frame = panel.els?.frame;
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ source: 'frogee-device-host', type: 'key', action: 'up', key: e.key, keyCode: e.keyCode, code: e.code }, '*');
    } catch (err) { /* gone */ }
  });
}

// ── Settings ────────────────────────────────────────────────────────────────────────────────

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      device: panel.device,
      custom: panel.custom,
      landscape: panel.landscape,
      keyboard: panel.keyboard,
      touches: panel.touches,
      visible: panel.visible,
    }));
  } catch (err) { /* the storage is unavailable */ }
}

function restoreSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data.device && DEVICES[data.device]) panel.device = data.device;
    if (data.custom) panel.custom = data.custom;
    panel.landscape = !!data.landscape;
    panel.keyboard = !!data.keyboard;
    panel.touches = data.touches !== false;
    panel.visible = !!data.visible;
  } catch (err) { /* the settings are broken */ }
  if (panel.els.select) panel.els.select.value = panel.device;
  if (panel.els.custom) {
    panel.els.custom.hidden = panel.device !== 'custom';
    panel.els.custom.value = `${panel.custom.w}x${panel.custom.h} @${panel.custom.dpr}`;
  }
  const kb = panel.els.host?.querySelector('[data-act="keyboard"]');
  if (kb) kb.classList.toggle('active', panel.keyboard);
  const tc = panel.els.host?.querySelector('[data-act="touches"]');
  if (tc) tc.classList.toggle('active', panel.touches);
  if (panel.els.keybState) panel.els.keybState.textContent = panel.keyboard ? 'включена' : 'выключена';
  if (panel.visible) showDevicePanel();
}

// ── Right-side panel ────────────────────────────────────────────────────────────

const WIDTH_KEY = 'frogee.device.width';
const DEFAULT_PANEL_WIDTH = 430;
const MIN_PANEL_WIDTH = 300;

export function isDevicePanelVisible() {
  return panel.visible;
}

function panelWidth() {
  try { return Number(localStorage.getItem(WIDTH_KEY)) || DEFAULT_PANEL_WIDTH; } catch { return DEFAULT_PANEL_WIDTH; }
}

function applyPanelWidth(value, persist) {
  const stage = document.getElementById('main-layout');
  const max = stage ? Math.max(MIN_PANEL_WIDTH, stage.clientWidth * 0.6) : 720;
  const width = Math.round(Math.min(max, Math.max(MIN_PANEL_WIDTH, value)));
  const panelEl = document.getElementById('device-panel');
  if (panelEl) panelEl.style.width = `${width}px`;
  if (persist) { try { localStorage.setItem(WIDTH_KEY, String(width)); } catch (err) { /* the storage is unavailable */ } }
  return width;
}

export function showDevicePanel() {
  ensurePanel();
  const panelEl = document.getElementById('device-panel');
  const resizer = document.getElementById('device-resizer');
  if (panelEl) panelEl.style.display = 'flex';
  if (resizer) resizer.style.display = 'block';
  document.getElementById('device-btn')?.classList.add('active');
  panel.visible = true;
  applyPanelWidth(panelWidth(), false);
  requestAnimationFrame(fitPhone);
  refreshProject();
  saveSettings();
}

export function hideDevicePanel() {
  const panelEl = document.getElementById('device-panel');
  const resizer = document.getElementById('device-resizer');
  if (panelEl) panelEl.style.display = 'none';
  if (resizer) resizer.style.display = 'none';
  document.getElementById('device-btn')?.classList.remove('active');
  panel.visible = false;
  saveSettings();
}

export function toggleDevicePanel() {
  if (panel.visible) hideDevicePanel();
  else showDevicePanel();
}

export function setupDeviceEmulator() {
  ensurePanel();
  const host = document.getElementById('device-host');
  if (!host) return;
  // Side tabs: sensors / console
  host.querySelectorAll('.device-side-tab').forEach((tab) => {
    tab.addEventListener('click', () => setSidePanel(tab.dataset.panel));
  });
  // The power button turns the screen off.
  host.querySelector('[data-role="power"]')?.addEventListener('click', () => {
    panel.locked = !panel.locked;
    if (panel.els.lock) panel.els.lock.hidden = !panel.locked;
  });
  host.querySelector('[data-role="back"]')?.addEventListener('click', () => {
    const frame = panel.els.frame;
    try {
      frame?.contentWindow?.postMessage({ source: 'frogee-device-host', type: 'back' }, '*');
    } catch (err) { /* кадр закрыт */ }
  });
  host.querySelector('[data-role="lock"]')?.addEventListener('click', () => {
    panel.locked = false;
    if (panel.els.lock) panel.els.lock.hidden = true;
  });
  // The screen keeps the scale when the panel is resized.
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(() => fitPhone());
    observer.observe(host);
  }
  window.addEventListener('resize', () => fitPhone());

  // The panel width is dragged like the chat panel.
  const handle = document.getElementById('device-resizer');
  if (handle) {
    let dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('dragging');
      document.body.classList.add('resizing-panel');
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const panelEl = document.getElementById('device-panel');
      if (!panelEl) return;
      const right = panelEl.getBoundingClientRect().right;
      applyPanelWidth(right - e.clientX, false);
    });
    const stop = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing-panel');
      applyPanelWidth(panelWidth(), true);
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('dblclick', () => applyPanelWidth(DEFAULT_PANEL_WIDTH, true));
  }
}
