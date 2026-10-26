/** Runs the commands chosen in the native macOS menu bar (the menu itself is built in main.js). */
import { toggleMarkdownPreview } from './markdown.js';
import { state } from './state.js';
import { saveAllConfig } from './save-hook.js';
import { isNotebookTab, isEditorTab } from './tab-model.js';
import { createNewFile, closeTab, reopenClosedTab, setSplitView, openTabInSplit, updateTabsList } from './tabs.js';
import { createNewNotebook, openFileOrFolder, saveFile, saveFileAs, openFindBar, openReplaceBar, changeEditorZoom, applyEditorZoom, applyWordWrap, applyLineNumbers } from './editor.js';
import { openFolder, switchActivity, setActivityVisible } from './explorer.js';
import { openCommandPalette, openQuickOpen, openGoToLine, openSymbols, runCurrentFile, toggleSidebarPanel, toggleZen, toggleTheme, formatDocument, openTodos } from './palette.js';
import { toggleTerminal, appendBuildLog, clearBuildLog, showBuildConsole } from './terminal.js';
import { toggleChat } from './chat.js';
import { toggleDevicePanel, runCurrentSketch, showDevicePanel } from './device-emulator.js';
import { toggleGlass } from './glass.js';
import { openToolchainWizard } from './toolchain-wizard.js';
import { runPipelineAction } from './pipelines.js';

const openSettings = () => {
  const modal = document.getElementById('modal-settings');
  if (modal) modal.style.display = 'flex';
};
const toggleSplit = () => {
  if (state.splitView) { setSplitView(false); updateTabsList(); } else if (state.activeTabIndex >= 0) openTabInSplit(state.activeTabIndex);
};

const COMMANDS = {
  settings: openSettings,
  'new-file': createNewFile,
  'new-notebook': createNewNotebook,
  open: openFileOrFolder,
  'open-folder': openFolder,
  'quick-open': openQuickOpen,
  save: saveFile,
  'save-as': saveFileAs,
  autosave: () => { state.autoSave = !state.autoSave; const box = document.getElementById('autosave-checkbox'); if (box) box.checked = state.autoSave; saveAllConfig(); },
  'close-tab': () => state.activeTabIndex >= 0 && closeTab(state.activeTabIndex),
  'reopen-tab': reopenClosedTab,
  find: openFindBar,
  replace: openReplaceBar,
  'goto-line': openGoToLine,
  symbols: openSymbols,
  format: formatDocument,
  'search-project': () => switchActivity('search'),
  todos: openTodos,
  palette: openCommandPalette,
  'view-explorer': () => switchActivity('explorer'),
  'view-search': () => switchActivity('search'),
  'view-git': () => switchActivity('git'),
  'view-run': () => switchActivity('debug'),
  'toggle-sidebar': toggleSidebarPanel,
  'toggle-terminal': toggleTerminal,
  terminal: toggleTerminal,
  'toggle-chat': toggleChat,
  device: () => toggleDevicePanel(),
  'device-run': () => { showDevicePanel(); runCurrentSketch(); },
  'md-preview': () => toggleMarkdownPreview(),
  split: toggleSplit,
  'toggle-theme': toggleTheme,
  'toggle-glass': toggleGlass,
  'word-wrap': () => applyWordWrap(!state.wordWrapEnabled, true),
  'line-numbers': () => applyLineNumbers(!state.lineNumbersEnabled, true),
  zen: toggleZen,
  'zoom-in': () => changeEditorZoom(0.1),
  'zoom-out': () => changeEditorZoom(-0.1),
  'zoom-reset': () => applyEditorZoom(1, true),
  'run-file': runCurrentFile,
  'toolchain-wizard': () => openToolchainWizard(),
  'project-build': async () => {
    switchActivity('debug');
    clearBuildLog();
    showBuildConsole();
    const result = await runPipelineAction('build');
    appendBuildLog(result.ok ? (result.path || 'Сборка завершена') : (result.error || 'Сборка не удалась'), {
      level: result.ok ? 'info' : 'error',
    });
  },
};

export function setupMenuBridge() {
  window.electronAPI?.onMenuCommand?.((id) => {
    try { COMMANDS[id]?.(); } catch (err) { console.error('[menu]', id, err); }
  });
}
