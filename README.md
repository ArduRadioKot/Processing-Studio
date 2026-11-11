# Processing Studio

A lightweight Electron IDE for Processing: a code editor, phone emulator, and Android
project builder. `.pde` sketches run directly in the IDE, and can be exported as
ready-to-build Gradle projects for Android — without Processing for Android.

![Processing Studio](website/img/hero.jpg)

## Features

**Examples**
- Ready-made sketches from the book “Processing for Android”: a first program, an
  accelerometer level bubble, pinch-to-zoom, the `TouchButton`, a trace on a `PVector`,
  permission requests, the MotionScope project, UDP communication with an ESP32, and
  `PApplet` inside an Activity.
- Open them from the welcome screen (“Examples…”) or the command palette. Each example
  is created in `projects/` and immediately opened in the editor.

**Phone emulator**
- A right-hand panel with the device screen, device models (iPhone, Pixel, Galaxy, iPad,
  and custom size), and portrait/landscape orientation.
- A custom Processing runtime: canvas, shapes, text, colors, matrices, `PVector`, and
  `ArrayList`.
- Multiple `.pde` tabs are combined into a single sketch, just like the Processing
  preprocessor.
- Phone-like input: multitouch, mouse, keyboard, and a touch indicator.
- Sensors: accelerometer, gyroscope, compass, tilt, shake, orientation, and location.
- Android features directly in the emulator: permission requests (shown as a dialog on the
  device screen), `SharedPreferences`, `getActivity()`, and the app package name.
- Sketch errors are shown with the source file's line number.

**Android projects**
- Project wizard: package name, app name, min/target SDK, orientation, and permissions.
- Export to a Gradle project: `settings.gradle`, `app/build.gradle`,
  `AndroidManifest.xml`, `MainActivity`, resources, and an icon.
- The project includes its own Java `PApplet` runtime (drawing on `Canvas`, touch input,
  sensors, and permissions), so Processing for Android is not required.
- The generated project opens in Android Studio and builds with standard Gradle.

Detailed information about Processing for Android (build model, toolchain, ADB/Gradle,
sensors, permissions, lifecycle, debugging, porting desktop sketches, Arduino/ESP32, and
production) is available in [docs/processing-for-android.md](docs/processing-for-android.md).

**Code**
- Syntax highlighting, diagnostics, find and replace, and project-wide search.
- Autocomplete: Processing and Android Mode words, object members after a dot
  (`mouse.`, `config.`), and words from open files. Press Tab to accept, use the arrow
  keys to select, or press `Ctrl+Space` manually.
- Jupyter notebooks with automatic virtual environment discovery and kernel selection.
- `package.json` scripts and multiple terminals.
- A file explorer with drag-and-drop between folders, Git, and change history.

**Interface**
- A dark Android Studio-inspired theme: flat panels, thin dividers, and a blue accent.
- A light theme, appearance settings, and font settings.
- Glass in two materials: thin and transparent.
- Multiple windows, a Dock menu, and tab restoration.

## Running

Node.js 18 or newer is required.

```bash
cd src/code-redactor
npm install
npm start
```

## Building

```bash
npm run build:mac     # .dmg
npm run build:win     # Windows installer
npm run build:linux   # AppImage / deb
```

The result will be placed in `src/code-redactor/dist`.

## Working directory

The application creates its own folder in `Documents`:

```
~/Documents/ProcessingStudio/
├── config/     application settings
├── projects/   projects — one folder per project
│   └── MotionScope/
│       ├── sketch.pde
│       └── processing-studio.json
└── themes/     custom themes
```

Create a project with the “New Android Project” wizard: a folder named after the project
appears in `projects/` and is then opened in the editor. Open the projects folder from the
welcome screen (“Projects Folder…”) or the command palette.

Place custom themes in `themes/`; the format is described in
[src/code-redactor/themes/README.md](src/code-redactor/themes/README.md).

## Structure

```
src/code-redactor/
  main.js, preload.js   Electron process and IPC bridge
  lib/                  files, terminal, AI, and Python environments
  scripts/make-icon.mjs  application icon generator
  renderer/             interface (ES modules)
    device-runtime.js     Processing runtime for the emulator
    device-transpile.js   .pde-to-JavaScript transpiler
    device-emulator.js    device panel
    processing-api.js     API dictionary for autocomplete
    examples.js           examples from the book
    examples-ui.js        examples gallery
    android-project.js    project model and Android export
    android-runtime.js    Java PApplet runtime for Android projects
    android-ui.js         project wizard and app settings
  styles/               styles
  themes/               themes
website/                project website
```

## Platforms

macOS has been fully tested. Windows and Linux builds are supported, but window
transparency is replaced with an opaque theme on those platforms.

## License

GPL 2.0 — see the full text in [LICENSE](LICENSE).

Author: Frogeesoft.
