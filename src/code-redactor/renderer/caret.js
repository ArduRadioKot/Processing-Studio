/**
 * Каретка рисуется поверх подсветки: нативный caret textarea в Chromium
 * уезжает при CSS zoom, лигатурах и разной ширине overlay/textarea.
 */
const MIRROR_PROPS = [
  'boxSizing', 'font', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
  'letterSpacing', 'lineHeight', 'tabSize', 'paddingTop', 'paddingRight',
  'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
  'borderBottomWidth', 'borderLeftWidth', 'whiteSpace', 'wordWrap',
  'overflowWrap', 'fontVariantLigatures',
];

function ensureMirror(wrap) {
  let mirror = wrap.querySelector('.caret-mirror');
  if (mirror) return mirror;
  mirror = document.createElement('pre');
  mirror.className = 'caret-mirror';
  mirror.setAttribute('aria-hidden', 'true');
  wrap.appendChild(mirror);
  return mirror;
}

function ensureBar(wrap) {
  let bar = wrap.querySelector('.editor-caret');
  if (bar) return bar;
  bar = document.createElement('div');
  bar.className = 'editor-caret';
  bar.hidden = true;
  wrap.appendChild(bar);
  return bar;
}

function copyMetrics(from, to) {
  const cs = getComputedStyle(from);
  for (const prop of MIRROR_PROPS) to.style[prop] = cs[prop];
  to.style.scrollbarGutter = cs.scrollbarGutter;
  to.style.overflow = 'hidden';
  // The textarea's border box includes its scrollbar gutter. Using clientWidth
  // makes wrapped lines in the mirror break earlier than in the real editor.
  to.style.width = `${from.offsetWidth}px`;
  to.style.height = `${from.offsetHeight}px`;
}

/** Положение каретки в координатах wrap (локальные CSS-пиксели, с учётом zoom предка). */
export function measureCaret(el) {
  const wrap = el?.closest('.code-editor-wrap');
  if (!el || !wrap) return null;
  const mirror = ensureMirror(wrap);
  copyMetrics(el, mirror);
  const pos = el.selectionStart;
  const text = el.value;
  const mark = document.createElement('span');
  mark.className = 'caret-mark';
  mark.textContent = '\u200b';
  mirror.replaceChildren(
    document.createTextNode(text.slice(0, pos)),
    mark,
    document.createTextNode(text.slice(pos) || '\n'),
  );
  mirror.scrollTop = el.scrollTop;
  mirror.scrollLeft = el.scrollLeft;
  const wr = wrap.getBoundingClientRect();
  const mr = mark.getBoundingClientRect();
  const zoom = wr.width / (wrap.offsetWidth || wr.width) || 1;
  const cs = getComputedStyle(el);
  const x = (mr.left - wr.left) / zoom;
  const y = (mr.top - wr.top) / zoom;
  return {
    x,
    y,
    height: parseFloat(cs.lineHeight) || mr.height || 16,
  };
}

function hideBar(bar) {
  if (bar && !bar.hidden) bar.hidden = true;
}

function showBar(el) {
  const wrap = el.closest('.code-editor-wrap');
  const bar = ensureBar(wrap);
  if (document.activeElement !== el || el.selectionStart !== el.selectionEnd) {
    hideBar(bar);
    return;
  }
  const pos = measureCaret(el);
  if (!pos) { hideBar(bar); return; }
  if (pos.x < 0 || pos.x >= el.clientWidth || pos.y < 0 || pos.y >= el.clientHeight) {
    hideBar(bar);
    return;
  }
  bar.hidden = false;
  bar.style.height = `${pos.height}px`;
  bar.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = '';
}

let frame = 0;
const schedule = (el) => {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const active = document.activeElement;
    const target = el && document.activeElement === el ? el : (active?.id === 'editor' || active?.id === 'editor-right' ? active : null);
    document.querySelectorAll('.editor-caret').forEach((bar) => {
      const wrap = bar.parentElement;
      const ta = wrap?.querySelector('textarea');
      if (ta && ta === target) showBar(ta);
      else hideBar(bar);
    });
  });
};

export function setupCaret() {
  ['editor', 'editor-right'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    // The update loop visits existing bars; create one for each pane first.
    ensureBar(el.closest('.code-editor-wrap'));
    ['input', 'focus', 'blur', 'mouseup', 'keyup', 'click'].forEach((evt) => el.addEventListener(evt, () => schedule(el)));
    el.addEventListener('scroll', () => schedule(el));
    el.addEventListener('pointermove', (evt) => { if (evt.buttons) schedule(el); });
  });
  document.addEventListener('selectionchange', () => schedule());
  window.addEventListener('resize', () => schedule());
  window.addEventListener('frogee:content', () => schedule());
  schedule();
}
