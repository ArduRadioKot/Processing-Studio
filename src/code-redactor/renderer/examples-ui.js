/**
 * Галерея примеров из книги «Processing для Android».
 * Пример создаётся в ~/Documents/ProcessingStudio/projects/<Имя> и открывается в редакторе.
 */
import { EXAMPLES, exampleById } from './examples.js';
import { toast } from './image-view.js';
import { escapeHtml } from './utils.js';

let overlay = null;

function closeGallery() {
  overlay?.remove();
  overlay = null;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay) closeGallery();
});

/** Создаёт проект примера на диске и открывает его. */
export async function createExample(id) {
  const example = exampleById(id);
  if (!example) return null;
  const created = await window.electronAPI?.studioCreateProject?.(example.title);
  if (!created?.success) {
    toast(created?.error ? `Не удалось создать папку: ${created.error}` : 'Не удалось создать папку проекта');
    return null;
  }
  for (const file of example.files) {
    const written = await window.electronAPI?.writeFile?.(`${created.path}/${file.name}`, file.content);
    if (!written?.success) toast(`Не удалось записать ${file.name}`);
  }
  const settings = {
    name: example.title.replace(/[^A-Za-z0-9]+/g, '') || 'Example',
    packageName: `com.example.${example.id.replace(/[^a-z0-9]+/gi, '').toLowerCase()}`,
    minSdk: 26,
    targetSdk: 34,
    orientation: 'unspecified',
    permissions: ['INTERNET'],
    theme: 'dark',
    sketch: example.files[0]?.name || 'sketch.pde',
  };
  await window.electronAPI?.writeFile?.(`${created.path}/processing-studio.json`, JSON.stringify(settings, null, 2));
  try {
    const { loadFolderContents } = await import('./explorer.js');
    await loadFolderContents(created.path);
  } catch (err) { /* проект уже создан */ }
  toast(`Пример «${example.title}» создан: ${created.path}`);
  return created.path;
}

/** Модальное окно со списком примеров. */
export function openExamplesGallery() {
  closeGallery();
  overlay = document.createElement('div');
  overlay.className = 'ps-modal';
  overlay.innerHTML = `
    <div class="ps-modal-box ps-gallery">
      <div class="ps-modal-head">
        <h2>Примеры из книги «Processing для Android»</h2>
        <button type="button" class="ps-close" data-close>✕</button>
      </div>
      <div class="ps-modal-body">
        <div class="ps-hint">Пример создаётся в ProcessingStudio/projects и открывается в редакторе.</div>
        <div class="ps-examples">
          ${EXAMPLES.map((e) => `
            <div class="ps-example" data-id="${e.id}">
              <div class="ps-example-text">
                <div class="ps-example-title">${escapeHtml(e.title)}</div>
                <div class="ps-example-hint">${escapeHtml(e.hint)}</div>
              </div>
              <button type="button" class="ps-btn primary" data-create="${e.id}">Создать</button>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeGallery(); });
  overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeGallery));
  overlay.querySelectorAll('[data-create]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    b.textContent = 'Создаём…';
    await createExample(b.dataset.create);
    closeGallery();
  }));
  document.body.appendChild(overlay);
  return overlay;
}
