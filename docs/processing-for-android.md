# Processing for Android: практический материал

Конспект книги «Processing для Android» (издание 2026) и список того, что Processing Studio
умеет из этого воспроизводит. Ориентир — документация Processing for Android и Android Developers.

## 1. Модель: из чего собирается приложение

```
Sketch (.pde)
   ↓  preprocessor
Java-класс (extends PApplet)
   ↓  Android build
Gradle + Android SDK
   ↓
DEX + ресурсы + AndroidManifest.xml
   ↓
APK
   ↓  adb
Телефон / эмулятор
```

Каждая стрелка — отдельный инструмент. Ошибка почти всегда belongs к одной из них, поэтому
сначала определи слой: редактор → сборка → установка → запуск → поведение.

В Processing Studio цепочка короче: свой рантайм выполняет скетч прямо в IDE (эмулятор
устройства), а экспорт в Android даёт обычный Gradle-проект с собственным `PApplet`.

## 2. Toolchain

| Компонент | Зачем | Типичная ошибка |
|---|---|---|
| Processing PDE | редактор, preprocessor, Android Mode | `Syntax error` |
| Android Mode | генерация Android-проекта | несовместимый manifest, SDK path |
| JDK | Gradle и компиляция | `requires Java 17`, `unsupported class version` |
| Android SDK | aapt2, D8, platform-tools | `SDK not found`, нет platform/build-tools |
| Gradle + AGP | оркестрация сборки | конфликт зависимостей, merge manifest |
| ADB | установка, shell, logcat | `unauthorized`, `offline`, `no devices` |

Актуальные версии (2026): стабильный Android Mode — 4.6.1 (413) с Processing 4, AGP 8.x,
JDK 17, compileSdk 33+.

> **ВНИМАНИЕ, публикация в Google Play.** С 31 августа 2026 новые приложения и обновления
> должны иметь `targetSdk = 36` (Android 16). «Приложение собирается» и «приложение можно
> публиковать» — не одно и то же. Для Play нужен современный Android Studio/Gradle-проект.

`minSdk ≤ targetSdk ≤ compileSdk`. Ориентиры: minSdk 26 (Android 8.0) для Android Mode,
targetSdk 36 для Play, API 33 — разрешение на уведомления, API 31+ — `BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT`.

## 3. Терминал: команды, которые пригодятся

```bash
# навигация
pwd; ls; cd ~/Documents/Project; cd ..

# Java
java -version
/usr/libexec/java_home -V
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

# ADB
which adb
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb uninstall com.example.app
adb logcat -c
adb logcat
adb logcat AndroidRuntime:E *:S     # только ошибки
adb logcat System.out:I *:S         # println() из sketch
adb shell
adb pair 192.168.1.42:37123         # отладка по Wi-Fi (Android 11+)
adb connect 192.168.1.42:41567

# Gradle
chmod +x gradlew
./gradlew tasks
./gradlew assembleDebug
./gradlew installDebug
./gradlew assembleDebug --stacktrace
./gradlew bundleRelease
```

На Windows: `where.exe adb`, `$env:PATH`, `.\gradlew.bat`, `Select-String`.

Статусы `adb devices`: `device` — всё готово; `unauthorized` — телефон не доверяет компьютеру
(разблокируй экран и прими RSA-ключ); `offline` — переподключи USB, `adb kill-server`; нет строки —
проверь кабель (нужен data, не только зарядка), режим USB и драйверы.

## 4. Структура sketch

```
MotionScope/
├── MotionScope.pde      # основной sketch; имя папки совпадает с именем файла
├── Sensors.pde          # работа с сенсорами
├── UI.pde               # отрисовка
├── History.pde          # состояние и данные
├── Config.pde           # загрузка конфигурации
├── data/
│   └── config.json      # ресурс (asset), только на чтение
└── code/                # дополнительные JAR
```

Вкладки `.pde` — не модули: preprocessor склеивает их в один Java-класс, глобальные переменные
и функции видны между вкладками. Классы из вкладок становятся внутренними классами sketch.

`data/` — ресурсы, которые приложение читает во время работы (`loadImage`, `loadJSONObject`).
`code/` — сторонние JAR; библиотеки на AWT/Swing/JavaFX на Android не заработают.

## 5. Экран, density, touch

```java
void setup() {
  fullScreen(P2D);
  orientation(PORTRAIT);
  textSize(24 * displayDensity);   // 1 dp ≈ 1/160 дюйма, density — пикселей на dp
}
```

`displayDensity` — коэффициент плотности (2.5–3.5 на типичном телефоне). Размеры удобнее
задавать долями экрана: `float m = width * 0.05;`, а не пикселями.

`mouseX/mouseY` эмулируются первым пальцем. Для мультитача — массив `touches[]`
(`x`, `y`, `id`, `area`, `pressure`) и callbacks `touchStarted/touchMoved/touchEnded`.
Сравнивай `touches[i].id`, а не индекс: порядок элементов может меняться.

Щипок двумя пальцами:

```java
if (touches.length == 2) {
  float d = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
  if (startDist < 0) { startDist = d; startZoom = zoom; }
  zoom = constrain(startZoom * d / startDist, 0.3, 5);
} else {
  startDist = -1;
}
```

## 6. Lifecycle и потоки

`draw()` вызывается десятки раз в секунду: сеть, диск, `loadImage()` и регистрация сенсоров
внутри `draw()` — ошибка. Тяжёлое выноси в `thread("имяФункции")` (в эмуляторе — отдельная задача).

```java
public void onPause() {
  unregisterSensors();
  super.onPause();
}
public void onResume() {
  super.onResume();
  registerSensors();
}
```

Поля, которые пишет поток сенсора, а читает `draw()`, объявляй `volatile`.

## 7. Manifest и permissions

Dangerous permissions требуют двух шагов: объявление в manifest (в PDE — Android → Sketch
Permissions) и runtime-запрос.

```java
void setup() {
  fullScreen();
  if (hasPermission("android.permission.CAMERA")) {
    initCamera();
  } else {
    requestPermission("android.permission.CAMERA", "onCameraPermission");
  }
}

void onCameraPermission(boolean granted) {
  if (granted) initCamera();
  else println("Без камеры этот экран недоступен");
}
```

Без объявления в manifest диалог не показывается — Android просто откажет
(`SecurityException`). Запрашивай разрешение в момент, когда пользователь понимает зачем.

## 8. Сенсоры

| Тип | Что измеряет | Единицы |
|---|---|---|
| `TYPE_ACCELEROMETER` | ускорение вместе с гравитацией | м/с² |
| `TYPE_LINEAR_ACCELERATION` | ускорение без гравитации | м/с² |
| `TYPE_GYROSCOPE` | скорость вращения | рад/с |
| `TYPE_MAGNETIC_FIELD` | магнитное поле (компас) | мкТл |
| `TYPE_ROTATION_VECTOR` | ориентация (сборка нескольких сенсоров) | кватернион |
| `TYPE_LIGHT` | освещённость | люкс |
| `TYPE_PROXIMITY` | близость к экрану | см |

Классический шарик-уровень:

```java
Context context = getContext();
manager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
sensor = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
if (sensor != null) {
  manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME);
}
```

Оси телефона в портрете: X — вправо, Y — вверх по экрану, Z — из экрана на тебя. Экранная ось Y
в Processing направлена вниз, поэтому знаки часто приходится инвертировать. В значении
акселерометра всегда присутствует гравитация (~9.81 м/с²) — для динамической составляющей
нужен фильтр или `TYPE_LINEAR_ACCELERATION`.

Простейший low-pass: `filtered += (raw - filtered) * alpha;` — `alpha = 0.14` даёт ~63% отклика
за 7 кадров, `0.02` — очень плавно, но с задержкой около секунды.

## 9. Файлы, сеть, библиотеки, BLE

`saveStrings()/loadStrings()/saveJSONObject()/loadJSONObject()` с относительным именем работают
во внутренней папке приложения: она переживает перезапуски, но не видна в файловом менеджере.
Файлы из `data/` — read-only assets, перезаписать их нельзя.

`INTERNET` — normal permission, runtime-диалога не требует, но запросы всё равно должны быть
асинхронными (иначе `NetworkOnMainThreadException`).

| Библиотека | Вероятность работы на Android |
|---|---|
| pure Java без desktop UI | часто высокая |
| `java.awt` / `javax.swing` / JavaFX | низкая |
| JNI/native только x86 desktop | низкая |
| AAR/JAR под Android | может, но проще в Android Studio |

На Android 12+ появились отдельные runtime-разрешения `BLUETOOTH_SCAN` и `BLUETOOTH_CONNECT`.
Для серьёзного BLE разумно вынести BLE-слой в обычный Android-проект, а Processing оставить
визуализатором.

## 10. Перенос desktop-скетча

| Desktop | Android Mode | Комментарий |
|---|---|---|
| `size(800, 600)` | `fullScreen()` | размеры считай от `width`/`height` |
| `mouseX`, `mousePressed` | то же или `touches[]` | нет hover и правой кнопки |
| `mouseWheel()` | щипок по `touches[]` | |
| `keyPressed()` | `openKeyboard()` + `keyPressed()` | клавиатура только по запросу |
| `surface.setTitle()`, иконка | manifest / Sketch Properties | |
| ControlP5, G4P (Swing/AWT) | свои кнопки | напиши простой `TouchButton` |
| `selectInput()`, `selectOutput()` | нет аналога | внутренняя папка или Intent |
| `processing.serial` | BLE, Wi-Fi, USB OTG | COM-порта нет |
| `textSize(16)` | `textSize(16 * displayDensity)` | иначе текст крошечный |

Кнопку лучше делать по схеме press → release: нажатие засчитывается, только если палец
отпущен над кнопкой, — так ведут себя системные кнопки Android.

## 11. Arduino и ESP32

`processing.serial` на Android не работает (нативные драйверы COM-порта). Варианты:

| Канал | Плюсы | Минусы |
|---|---|---|
| Wi-Fi (UDP/HTTP) | работает из Processing без библиотек | нужен ESP32 и общая сеть |
| Bluetooth LE | не нужен роутер, мало энергии | сложный API, runtime-разрешения |
| USB OTG | тот же Serial, что на ПК | нужна usb-serial-for-android и переходник |

Схема обмена: телефон пишет первым (`HELLO`), ESP32 отвечает по адресу отправителя —
узнавать IP телефона из sketch неудобно. ESP32 шлёт значение АЦП каждые 50 мс
(`analogRead(34)` → 0..4095, поэтому в `map()` ставь 4095, а не 1023).

Диагностика: телефон и плата в одной сети (не гостевая — она изолирует устройства), IP в sketch
совпадает с выводом Serial Monitor, разрешение `INTERNET` отмечено, ESP32 работает на 2.4 ГГц.
Логи `println()` смотри через `adb logcat System.out:I *:S`.

## 12. Отладка

| Симптом | Причина | Что делать |
|---|---|---|
| `adb: command not found` | platform-tools не в PATH | добавить в PATH |
| `unauthorized` | RSA не подтверждён | разблокировать телефон, принять ключ |
| `no devices` | USB/драйвер/режим | data-кабель, debugging, `adb devices` |
| `requires Java 17` | не тот JDK | `JAVA_HOME` → 17 |
| `SDK not found` | неверный SDK path | указать корректный SDK |
| `Manifest merger failed` | конфликт manifest | читать конфликтующие атрибуты |
| `SecurityException` | нет runtime-разрешения | manifest + `requestPermission` + ветка denied |
| `duplicate classes` | две несовместимые зависимости | dependency tree, убрать дубликат |
| `Cannot fit requested classes in a single dex` | слишком много методов | multidex или меньше библиотек |
| `OutOfMemoryError` | большие bitmap/allocations | не создавать ресурсы каждый кадр |
| чёрный экран P2D/P3D | GPU/OpenGL/ресурсы | проверить renderer, размер текстур |
| ANR | main thread заблокирован | убрать сеть/диск из UI-потока |

Перед правками: `java -version`, `adb devices`, `adb logcat -c` — и только потом запускать и
снимать свежий лог. Не начинай с `clean`: он не чинит код, permission или несовместимую библиотеку.

Первое содержательное сообщение важнее «BUILD FAILED» в конце.

## 13. Production

Debug APK подписан debug-ключом и не годится для релиза. Нужен release-ключ: он часть идентичности
приложения, его потеря делает обновление невозможным. Храни keystore и пароли отдельно от репозитория.

Package name после первой публикации в Google Play менять нельзя.

Когда PDE перестаёт справляться: много экранов и стандартного UI, тяжёлые зависимости, BLE,
камера, WorkManager, push, product flavors, CI/CD — тогда экспортируй Android-проект и
используй Processing Core только как renderer-слой (`PApplet` внутри `Activity` через `PFragment`).

## 14. Что Processing Studio делает из этого

Эмулятор устройства в IDE реализует:

- **Рендереры:** `P2D`, `P3D`, `WEBGL`, `FX2D`, `AR`, `METRO`; `size(w, h, P2D)`.
  3D не поддерживается — в консоли появляется предупреждение, рисуем в 2D.
- **Экран:** `fullScreen(P2D)`, `orientation(PORTRAIT|LANDSCAPE)` (-device поворачивается),
  `displayDensity`, `width`/`height`, `touches[]` с `id`/`area`/`pressure`.
- **Ввод:** `mouseX/mouseY`, `mousePressed`, `touchStarted/Moved/Ended`, `key`/`keyCode`
  (`key` — char, как в Java), константы `ENTER`, `BACKSPACE`, `CODED`, стрелки.
- **Клавиатура:** `openKeyboard()` / `closeKeyboard()` переключают передачу клавиатуры в устройство.
- **Кнопка «Назад»:** `backPressed()`; если хендлера нет — выход из приложения.
- **Разрешения:** `requestPermission(name)` и `requestPermission(name, "callback")`,
  `hasPermission(name)`, диалог на экране устройства, ответ в `onPermissionGranted(name, granted)`
  или в метод-колбэк с `boolean`.
- **Сенсоры:** высокоуровневые `accelerometerX/Y/Z`, `gyroscopeX/Y/Z`, `magnetometerX/Y/Z`,
  `heading`, `rotation`, `orientation`, `latitude/longitude` + шина `SensorManager`
  (`getContext().getSystemService(Context.SENSOR_SERVICE)`, `getDefaultSensor`,
  `registerListener`) с живыми значениями из панели датчиков.
- **Lifecycle:** `onPause()` / `onResume()` — кнопка «в фон» в панели и сворачивание панели.
- **Потоки:** `thread("name")`, `runOnUiThread()`.
- **Данные:** `loadJSONObject()` / `loadStrings()` читают `data/` проекта, `saveStrings()` /
  `saveJSONObject()` пишут во внутреннюю папку; `JSONObject` / `JSONArray` с `hasKey`,
  `getString/getInt/getFloat/getBoolean/getJSONObject/getJSONArray`.
- **Настройки:** `getPreferences()` — key/value, переживают перезапуск.
- **Приложение:** `getActivity()`, `getContext()`, `getPackageName()`, `getActivity().finish()`.
- **Совместимость с Java:** `int()/float()/boolean()/char()`, `color()`, `red/green/blue/alpha`,
  `hex()`, `nf()`, `createFont()`, `s.length()` → `s.length`, `Integer.parseInt` → `parseInt`,
  внутренние классы без `extends/implements`, `catch (Exception e)` → `catch (e)`.
- **Экспорт:** Gradle-проект с `PApplet` (Canvas, касания, `SensorManager`, разрешения,
  `getContext`, `thread`, `backPressed`) и `PVector`/`PFont` — Processing for Android не нужен.

### Несколько вкладок .pde

Вкладки одного проекта обрабатываются как в preprocessor Processing: все `.pde` в папке
склеиваются в один скетч, поэтому функции и переменные из `Config.pde` видны в `MotionScope.pde`.
Основная вкладка — та, чьё имя совпадает с именем папки; её `setup()`/`draw()` и есть точка
входа. Ошибка показывается с именем файла и строкой именно той вкладки, где она возникла.

При экспорте в Android все вкладки попадают в один Java-класс: поля и методы становятся
членами класса, вложенные классы — внутренними классами приложения.
