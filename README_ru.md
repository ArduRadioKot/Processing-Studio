# Processing Studio

Лёгкая IDE на Electron для Processing: редактор кода, эмулятор телефона и сборка
Android-проектов. Скетчи `.pde` запускаются прямо в IDE, а затем могут быть
экспортированы в готовые к сборке Gradle-проекты для Android — без Processing for Android.

![Processing Studio](website/img/hero.jpg)

## Возможности

**Примеры**
- Готовые скетчи из книги «Processing для Android»: первая программа, шарик-уровень на
  акселерометре, масштабирование щипком, кнопка `TouchButton`, след на `PVector`, запросы
  разрешений, проект MotionScope, связь с ESP32 по UDP и `PApplet` внутри Activity.
- Открываются из приветствия («Примеры…») или из палитры команд. Каждый пример создаётся
  в `projects/` и сразу открывается в редакторе.

**Эмулятор телефона**
- Панель справа: экран устройства, модели (iPhone, Pixel, Galaxy, iPad, свой размер),
  портретная и альбомная ориентация.
- Собственный рантайм Processing: canvas, фигуры, текст, цвета, матрицы, `PVector` и
  `ArrayList`.
- Несколько вкладок `.pde` объединяются в один скетч, как в препроцессоре Processing.
- Ввод как на телефоне: мультитач, мышь, клавиатура и индикатор касаний.
- Датчики: акселерометр, гироскоп, компас, наклон, тряска, ориентация и местоположение.
- Android-возможности прямо в эмуляторе: запросы разрешений (диалог на экране устройства),
  `SharedPreferences`, `getActivity()` и имя пакета приложения.
- Ошибки скетча показываются с номером строки исходного файла.

**Android-проекты**
- Мастер проекта: имя пакета, название приложения, min/target SDK, ориентация и разрешения.
- Экспорт в Gradle-проект: `settings.gradle`, `app/build.gradle`,
  `AndroidManifest.xml`, `MainActivity`, ресурсы и иконка.
- В проект входит собственный Java-рантайм `PApplet` (рисование на `Canvas`, касания,
  датчики и разрешения), поэтому Processing for Android не нужен.
- Готовый проект открывается в Android Studio и собирается обычным Gradle.

Подробный материал по Processing for Android (модель сборки, toolchain, ADB/Gradle,
сенсоры, permissions, lifecycle, отладка, перенос desktop-скетчей, Arduino/ESP32 и
production) — в [docs/processing-for-android.md](docs/processing-for-android.md).

**Код**
- Подсветка синтаксиса, диагностика, поиск и замена и поиск по проекту.
- Автодополнение: слова Processing и Android Mode, члены объектов после точки
  (`mouse.`, `config.`) и слова из открытых файлов. Tab — принять, стрелки — выбор,
  `Ctrl+Space` — вызвать вручную.
- Jupyter-ноутбуки с автоматическим поиском виртуальных окружений и выбором ядра.
- Скрипты `package.json` и несколько терминалов.
- Проводник с перетаскиванием файлов между папками, Git и историей изменений.

**Интерфейс**
- Тёмная тема в духе Android Studio: плоские панели, тонкие разделители и синий акцент.
- Светлая тема, настройки внешнего вида и шрифтов.
- Стекло в двух материалах: тонкое и прозрачное.
- Несколько окон, меню Dock и восстановление вкладок.

## Запуск

Нужен Node.js 18 или новее.

```bash
cd src/code-redactor
npm install
npm start
```

## Сборка

```bash
npm run build:mac     # .dmg
npm run build:win     # установщик Windows
npm run build:linux   # AppImage / deb
```

Результат появится в `src/code-redactor/dist`.

## Рабочая папка

Приложение создаёт в `Documents` свою папку:

```
~/Documents/ProcessingStudio/
├── config/     настройки приложения
├── projects/   проекты — по папке на проект
│   └── MotionScope/
│       ├── sketch.pde
│       └── processing-studio.json
└── themes/     пользовательские темы
```

Проект создаётся мастером «Новый Android-проект»: папка с именем проекта появляется
в `projects/`, а затем открывается в редакторе. Папку проектов можно открыть из приветствия
(«Папка проектов…») или из палитры команд.

Свои темы кладутся в `themes/`, формат описан в
[src/code-redactor/themes/README.md](src/code-redactor/themes/README.md).

## Структура

```
src/code-redactor/
  main.js, preload.js   процесс Electron и мост IPC
  lib/                  файлы, терминал, ИИ и окружения Python
  scripts/make-icon.mjs  генератор иконки приложения
  renderer/             интерфейс (ES-модули)
    device-runtime.js     рантайм Processing для эмулятора
    device-transpile.js   перевод .pde в JavaScript
    device-emulator.js    панель устройства
    processing-api.js     словарь API для автодополнения
    examples.js           примеры из книги
    examples-ui.js        галерея примеров
    android-project.js    модель проекта и экспорт в Android
    android-runtime.js    Java-рантайм PApplet для Android-проектов
    android-ui.js         мастер проекта и настройки приложения
  styles/               стили
  themes/               темы
website/                сайт проекта
```

## Платформы

macOS полностью протестирована. Сборка для Windows и Linux поддерживается, но прозрачность
окна на этих платформах заменяется непрозрачной темой.

## Лицензия

GPL 2.0 — полный текст в файле [LICENSE](LICENSE).

Автор: Frogeesoft.
