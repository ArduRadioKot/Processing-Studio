/**
 * Рабочая папка Processing Studio в «Документах»:
 *   ~/Documents/ProcessingStudio/
 *     config/    настройки приложения
 *     projects/  проекты (по папке на проект)
 *     themes/    пользовательские темы
 *     toolchain/ JDK, Android SDK, Gradle, Node — ставит установщик сборки
 */
const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const { ipcMain, app } = require('electron');

function resolveDocumentsPath() {
  try {
    if (app && typeof app.getPath === 'function') return app.getPath('documents');
  } catch { /* app ещё не готов */ }
  return path.join(os.homedir(), 'Documents');
}

const documentsPath = resolveDocumentsPath();
const studioRoot = path.join(documentsPath, 'ProcessingStudio');
const configDir = path.join(studioRoot, 'config');
const projectsDir = path.join(studioRoot, 'projects');
const themesDir = path.join(studioRoot, 'themes');
const toolchainDir = path.join(studioRoot, 'toolchain');

async function ensureStudioDirs() {
  for (const dir of [studioRoot, configDir, projectsDir, themesDir, toolchainDir]) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error('Не удалось создать папку', dir, error.message);
    }
  }
}

/** Имя папки проекта: без запрещённых символов и пробелов в начале/конце. */
function safeFolderName(name) {
  const clean = String(name || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || 'Sketch';
}

function registerStudioIpc() {
  ipcMain.handle('studio-paths', async () => {
    try {
      await ensureStudioDirs();
      return { success: true, root: studioRoot, config: configDir, projects: projectsDir, themes: themesDir, toolchain: toolchainDir };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Создаёт папку проекта в ~/Documents/ProcessingStudio/projects
  ipcMain.handle('studio-create-project', async (event, name) => {
    try {
      await ensureStudioDirs();
      const dir = path.join(projectsDir, safeFolderName(name));
      await fs.mkdir(dir, { recursive: true });
      return { success: true, path: dir, projects: projectsDir };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Открывает папку проектов в файловом менеджере
  ipcMain.handle('studio-reveal-projects', async () => {
    try {
      await ensureStudioDirs();
      const { shell } = require('electron');
      shell.openPath(projectsDir);
      return { success: true, path: projectsDir };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  documentsPath,
  studioRoot,
  configDir,
  projectsDir,
  themesDir,
  toolchainDir,
  ensureStudioDirs,
  registerStudioIpc,
};
