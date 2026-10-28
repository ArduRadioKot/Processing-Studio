/**
 * Шаблоны новых проектов. Сборщики платформ сюда не входят:
 * только скетч, конфиг и зависимости выбранного стека.
 */

import { KIND_ANDROID, KIND_MULTI, STACK_ANDROID, STACK_WEB, TARGET_ANDROID, TARGET_WEB, toProjectFile } from './project-model.js';
import { joinPath } from './android-project.js';
import { ADAPTIVE_UI_JAVA } from './android-runtime.js';

export const SKETCH_TEMPLATE = `// Обработка касаний и кнопок
float x;
float y;
boolean pressed = false;

void setup() {
  size(390, 844);
  AdaptiveUI.attach(this);
  background(20);
  noStroke();
}

void draw() {
  background(20);
  fill(0, 140, 255);
  ellipse(x, y, 60, 60);
  fill(230);
  textSize(18);
  textAlign(CENTER, TOP);
  text("Processing Studio", width / 2, 50);
}

void mousePressed() {
  x = mouseX;
  y = mouseY;
  pressed = true;
}

void touchStarted() {
  x = mouseX;
  y = mouseY;
  pressed = true;
}
`;

function androidReadme(settings) {
  return `# ${settings.name}

Тип: Android
Стек: Processing2Android (Java, Android SDK, Gradle)

Скетч \`${settings.sketch}\` остаётся Processing (.pde). Нативный Gradle-проект
создаётся командой «Экспортировать» или «Собрать» в IDE (папка \`android/\`).

JDK, Android SDK и Gradle ставит пакетный менеджер в панели «Запуск».
`;
}

function npmName(settings) {
  const raw = String(settings.packageName || settings.name || 'sketch')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return raw || 'sketch';
}

function capacitorPackageJson(settings) {
  return {
    name: npmName(settings),
    version: '1.0.0',
    private: true,
    description: settings.name || '',
    scripts: {
      cap: 'cap',
    },
  };
}

function capacitorConfig(settings) {
  return {
    appId: settings.packageName || 'com.example.sketch',
    appName: settings.name || 'Sketch',
    webDir: 'www',
    android: { allowMixedContent: true },
  };
}

function capacitorIndex(settings) {
  const title = settings.name || 'Sketch';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${title}</title>
  <style>
    html, body { margin: 0; height: 100%; background: #141414; color: #e8e8e8; font: 15px/1.45 system-ui, sans-serif; }
    p { margin: 0; padding: 24px; }
  </style>
</head>
<body>
  <p>Папка <code>www</code> для Capacitor. Скетч Processing сюда попадёт, когда подключат экспорт Processing2Web.</p>
</body>
</html>
`;
}

function multiReadme(settings) {
  return `# ${settings.name}

Тип: мультиплатформенный (Android / iOS / Web)
Стек: Processing2Web + Capacitor

Capacitor ставится в эту папку при создании проекта. Сборка Web / Android / iOS -
кнопка «Собрать» в панели «Запуск» или пакетный менеджер, если нет Node / SDK.

Скетч \`${settings.sketch}\` транслируется в JavaScript существующим Processing2Web
(тот же транслятор, что в эмуляторе).

Целевая платформа по умолчанию: ${settings.target || TARGET_WEB}.
Для iOS потребуется Xcode и подпись приложения.
`;
}

/**
 * Файлы, которые нужно записать в папку нового проекта.
 * @returns {{ relative: string, content: string }[]}
 */
export function filesForNewProject(settings) {
  const explicit = toProjectFile(settings, { explicit: true });
  const files = [
    { relative: explicit.sketch || 'sketch.pde', content: settings.sketchSource || SKETCH_TEMPLATE },
    { relative: 'processing-studio.json', content: JSON.stringify(explicit, null, 2) },
  ];
  if (explicit.kind === KIND_ANDROID) {
    files.push({ relative: 'README.md', content: androidReadme(explicit) });
    if (explicit.adaptiveUi) {
      files.push({
        relative: 'libraries/AdaptiveUI.java',
        content: ADAPTIVE_UI_JAVA.replace('%(package)s', explicit.packageName),
      });
    }
  } else {
    files.push(
      { relative: 'README.md', content: multiReadme(explicit) },
      { relative: 'package.json', content: JSON.stringify(capacitorPackageJson(explicit), null, 2) },
      { relative: 'capacitor.config.json', content: JSON.stringify(capacitorConfig(explicit), null, 2) },
      { relative: 'www/index.html', content: capacitorIndex(explicit) },
      { relative: '.gitignore', content: 'node_modules/\ndist/\n.DS_Store\n' },
    );
  }
  return files;
}

export async function writeProjectFiles(folder, settings) {
  const files = filesForNewProject(settings);
  for (const file of files) {
    const res = await window.electronAPI?.writeFile?.(joinPath(folder, file.relative), file.content);
    if (!res?.success) return { ok: false, error: res?.error || `Не удалось записать ${file.relative}`, files };
  }
  return { ok: true, files };
}

export { KIND_ANDROID, KIND_MULTI, STACK_ANDROID, STACK_WEB, TARGET_ANDROID, TARGET_WEB };
