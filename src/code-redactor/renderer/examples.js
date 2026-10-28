/**
 * Примеры из книги «Processing для Android» - готовые заготовки проектов.
 * Каждый пример создаётся в ~/Documents/ProcessingStudio/projects/<Имя> и открывается в редакторе.
 */

export const EXAMPLES = [
  {
    id: 'first',
    title: 'Первая программа',
    hint: 'Глава 3.4 - минимальный sketch: fullScreen, фон и круг под пальцем.',
    files: [
      {
        name: 'first.pde',
        content: `// Первая программа для Processing for Android.
void setup() {
  fullScreen();
  noStroke();
}

void draw() {
  background(24);
  fill(80, 200, 255);
  circle(mouseX, mouseY, 120);
}
`,
      },
    ],
  },
  {
    id: 'ball-level',
    title: 'Шарик-уровень',
    hint: 'Глава 12.1 - акселерометр через Android SensorManager: шарик катается по экрану.',
    files: [
      {
        name: 'ballLevel.pde',
        content: `// Глава 12.1: шарик-уровень на акселерометре.
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

SensorManager manager;
Sensor sensor;
AccelListener listener;
volatile float ax, ay;
float x, y, vx, vy;

void setup() {
  fullScreen();
  orientation(PORTRAIT);
  x = width / 2;
  y = height / 2;

  Context context = getContext();
  manager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
  sensor = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
  listener = new AccelListener();
  if (sensor != null) {
    manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME);
  }
}

void draw() {
  background(20);
  if (sensor == null) {
    fill(255);
    text("Акселерометр не найден", 40, 80);
    return;
  }
  // Ось X сенсора направлена вправо, но растёт при наклоне влево.
  vx = (vx - ax * 0.5) * 0.96;
  vy = (vy + ay * 0.5) * 0.96;
  x = constrain(x + vx, 0, width);
  y = constrain(y + vy, 0, height);
  fill(80, 200, 255);
  noStroke();
  circle(x, y, 40 * displayDensity);
}

class AccelListener implements SensorEventListener {
  public void onSensorChanged(SensorEvent event) {
    ax = event.values[0];
    ay = event.values[1];
  }
  public void onAccuracyChanged(Sensor s, int accuracy) { }
}
`,
      },
    ],
  },
  {
    id: 'pinch',
    title: 'Масштаб щипком',
    hint: 'Глава 9.5 - мультитач: расстояние между двумя пальцами меняет масштаб.',
    files: [
      {
        name: 'pinch.pde',
        content: `// Глава 9.5: масштабирование двумя пальцами.
float zoom = 1;
float startDist = -1;
float startZoom = 1;

void setup() {
  fullScreen();
}

void draw() {
  background(20);
  if (touches.length == 2) {
    float d = dist(touches[0].x, touches[0].y, touches[1].x, touches[1].y);
    if (startDist < 0) {          // жест только начался
      startDist = d;
      startZoom = zoom;
    }
    zoom = constrain(startZoom * d / startDist, 0.3, 5);
  } else {
    startDist = -1;               // пальцев не два - жест закончен
  }
  translate(width / 2, height / 2);
  scale(zoom);
  rectMode(CENTER);
  fill(80, 200, 255);
  rect(0, 0, 200, 200, 20);
}
`,
      },
    ],
  },
  {
    id: 'touch-button',
    title: 'Кнопка TouchButton',
    hint: 'Глава 14.1 - своя кнопка вместо ControlP5: размеры в долях экрана, отклик на отпускание.',
    files: [
      {
        name: 'touchButton.pde',
        content: `// Глава 14.1: адаптивная кнопка вместо ControlP5.
TouchButton playBtn, resetBtn;
int counter = 0;

void setup() {
  fullScreen();
  orientation(PORTRAIT);
  float w = width * 0.8;
  float h = 56 * displayDensity;            // ≈ 9 мм на любом экране
  playBtn  = new TouchButton("+1",    (width - w) / 2, height * 0.55, w, h);
  resetBtn = new TouchButton("Сброс", (width - w) / 2, height * 0.55 + h * 1.4, w, h);
  textAlign(CENTER, CENTER);
}

void draw() {
  background(24, 26, 32);
  fill(255);
  textSize(64 * displayDensity);
  text(counter, width / 2, height * 0.3);
  playBtn.display();
  resetBtn.display();
}

void mousePressed() {
  playBtn.press(mouseX, mouseY);
  resetBtn.press(mouseX, mouseY);
}

void mouseReleased() {
  if (playBtn.release(mouseX, mouseY))  counter++;
  if (resetBtn.release(mouseX, mouseY)) counter = 0;
}

class TouchButton {
  String label;
  float x, y, w, h;
  boolean pressed = false;

  TouchButton(String label, float x, float y, float w, float h) {
    this.label = label;
    this.x = x; this.y = y; this.w = w; this.h = h;
  }

  boolean over(float px, float py) {
    return px > x && px < x + w && py > y && py < y + h;
  }

  void press(float px, float py) {
    pressed = over(px, py);
  }

  // true - если палец отпущен над кнопкой (нажатие засчитано)
  boolean release(float px, float py) {
    boolean clicked = pressed && over(px, py);
    pressed = false;
    return clicked;
  }

  void display() {
    noStroke();
    fill(pressed ? color(50, 140, 220) : color(45, 50, 62));
    rect(x, y, w, h, h * 0.25);
    fill(255);
    textSize(h * 0.4);
    text(label, x + w / 2, y + h / 2);
  }
}
`,
      },
    ],
  },
  {
    id: 'vector-trail',
    title: 'След на PVector',
    hint: 'Глава 14.2 - перенос desktop-анимации: PVector, сила от пальца, трение.',
    files: [
      {
        name: 'vectorTrail.pde',
        content: `// Глава 14.2: перенос desktop-анимации с PVector на телефон.
PVector pos, vel;

void setup() {
  fullScreen();
  pos = new PVector(width / 2, height / 2);
  vel = new PVector(0, 0);
}

void draw() {
  noStroke();
  fill(20, 20, 30, 40);                     // полупрозрачный прямоугольник - «шлейф»
  rect(0, 0, width, height);
  if (mousePressed) {
    PVector target = new PVector(mouseX, mouseY);
    PVector force = PVector.sub(target, pos);
    force.setMag(0.6 * displayDensity);     // сила не зависит от расстояния
    vel.add(force);
  }
  vel.mult(0.97);                           // трение
  vel.limit(25 * displayDensity);
  pos.add(vel);
  noStroke();
  fill(255, 160, 60);
  circle(pos.x, pos.y, 30 * displayDensity);
}
`,
      },
    ],
  },
  {
    id: 'permissions',
    title: 'Разрешения',
    hint: 'Глава 11 - requestPermission/hasPermission и колбэк с boolean.',
    files: [
      {
        name: 'permissions.pde',
        content: `// Глава 11: запрос runtime-разрешения.
void setup() {
  fullScreen();
  if (hasPermission("android.permission.CAMERA")) {
    initCamera();
  } else {
    requestPermission("android.permission.CAMERA", "onCameraPermission");
  }
}

void draw() {
  background(20);
  fill(230);
  textSize(16 * displayDensity);
  text("CAMERA: " + hasPermission("android.permission.CAMERA"), 40, 60);
}

void onCameraPermission(boolean granted) {
  if (granted) initCamera();
  else println("Без камеры этот экран недоступен");
}

void initCamera() {
  println("Камера готова");
}
`,
      },
    ],
  },
  {
    id: 'motion-scope',
    title: 'MotionScope',
    hint: 'Главы 18-19 - учебный проект: сенсоры, lifecycle, адаптивный UI, data/config.json.',
    files: [
      {
        name: 'MotionScope.pde',
        content: `// MotionScope.pde - учебный проект для Processing for Android.
String appTitle = "MotionScope";
float smoothing = 0.14;
boolean frozen = false;

void setup() {
  fullScreen(P2D);
  orientation(PORTRAIT);
  loadAppConfig();
  initHistory();
  initSensors();
}

void draw() {
  updateSensorModel();
  pushHistory(accelMagnitude);

  background(18, 20, 26);
  drawHeader();
  drawSensorCards();
  drawMotionBubble();
  drawHistoryGraph();
  drawFooter();
}

// На Android touchStarted() вызывается при начале касания.
void touchStarted() {
  frozen = !frozen;
}
`,
      },
      {
        name: 'Sensors.pde',
        content: `// Sensors.pde - Android Sensor API.
import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;

SensorManager sensorManager;
Sensor accelerometer;
AccelerometerListener accelerometerListener;

volatile float rawAx = 0;
volatile float rawAy = 0;
volatile float rawAz = 0;

float ax = 0;
float ay = 0;
float az = 0;
float accelMagnitude = 0;
boolean sensorAvailable = false;
boolean sensorRegistered = false;

void initSensors() {
  Context appContext = getContext();
  sensorManager = (SensorManager) appContext.getSystemService(Context.SENSOR_SERVICE);
  accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
  accelerometerListener = new AccelerometerListener();
  sensorAvailable = accelerometer != null;
  registerSensors();
}

void registerSensors() {
  if (!sensorAvailable || sensorManager == null) return;
  if (accelerometerListener == null) return;
  if (sensorRegistered) return;
  sensorManager.registerListener(accelerometerListener, accelerometer, SensorManager.SENSOR_DELAY_GAME);
  sensorRegistered = true;
}

void unregisterSensors() {
  if (sensorManager != null && accelerometerListener != null && sensorRegistered) {
    sensorManager.unregisterListener(accelerometerListener);
    sensorRegistered = false;
  }
}

void updateSensorModel() {
  if (frozen) return;
  ax += (rawAx - ax) * smoothing;
  ay += (rawAy - ay) * smoothing;
  az += (rawAz - az) * smoothing;
  accelMagnitude = sqrt(ax * ax + ay * ay + az * az);
}

class AccelerometerListener implements SensorEventListener {
  public void onSensorChanged(SensorEvent event) {
    rawAx = event.values[0];
    rawAy = event.values[1];
    rawAz = event.values[2];
  }

  public void onAccuracyChanged(Sensor sensor, int accuracy) { }
}
`,
      },
      {
        name: 'Config.pde',
        content: `// Config.pde - загрузка конфигурации.
void loadAppConfig() {
  try {
    JSONObject config = loadJSONObject("config.json");
    if (config == null) return;

    if (config.hasKey("title")) {
      appTitle = config.getString("title");
    }

    if (config.hasKey("smoothing")) {
      smoothing = constrain(config.getFloat("smoothing"), 0.01, 1.0);
    }
  }
  catch (Exception e) {
    println("Config error: " + e.getMessage());
  }
}
`,
      },
      {
        name: 'History.pde',
        content: `// History.pde - кольцевой буфер показаний.
final int HISTORY_SIZE = 120;
float[] history = new float[HISTORY_SIZE];
int historyHead = 0;

void initHistory() {
  for (int i = 0; i < HISTORY_SIZE; i++) history[i] = 0;
}

void pushHistory(float value) {
  if (frozen) return;
  history[historyHead] = value;
  historyHead = (historyHead + 1) % HISTORY_SIZE;
}
`,
      },
      {
        name: 'UI.pde',
        content: `// UI.pde - отрисовка интерфейса.
float u() {
  // Наша условная единица интерфейса зависит от меньшей стороны экрана.
  return min(width, height) / 100.0;
}

void drawHeader() {
  float m = 5 * u();
  fill(245);
  textSize(6.0 * u());
  text(appTitle, m, 9 * u());

  fill(150, 160, 176);
  textSize(3.3 * u());
  text(sensorAvailable ? "accelerometer connected" : "accelerometer not found",
       m, 14 * u());
}

void drawSensorCards() {
  float m = 5 * u();
  float gap = 2 * u();
  float cardW = (width - 2 * m - 2 * gap) / 3.0;
  float y = 19 * u();

  drawValueCard(m, y, cardW, "X", ax);
  drawValueCard(m + cardW + gap, y, cardW, "Y", ay);
  drawValueCard(m + 2 * (cardW + gap), y, cardW, "Z", az);
}

void drawValueCard(float x, float y, float w, String label, float value) {
  float h = 18 * u();
  noStroke();
  fill(31, 35, 45);
  rect(x, y, w, h, 3 * u());

  fill(154, 166, 188);
  textSize(3.0 * u());
  text(label, x + 3 * u(), y + 5 * u());

  fill(245);
  textSize(4.2 * u());
  text(nf(value, 1, 2), x + 3 * u(), y + 12 * u());
}

void drawMotionBubble() {
  float cx = width / 2.0;
  float cy = 53 * u();
  float radius = 15 * u();

  noFill();
  stroke(73, 82, 102);
  strokeWeight(max(1, 0.4 * u()));
  circle(cx, cy, radius * 2);
  line(cx - radius, cy, cx + radius, cy);
  line(cx, cy - radius, cx, cy + radius);

  float bx = cx + constrain(-ax / 10.0, -1, 1) * radius * 0.8;
  float by = cy + constrain( ay / 10.0, -1, 1) * radius * 0.8;

  noStroke();
  fill(80, 200, 255);
  circle(bx, by, 4.2 * u());

  fill(180);
  textSize(3.0 * u());
  textAlign(CENTER, BASELINE);
  text("|a| = " + nf(accelMagnitude, 1, 2) + " m/s²", cx, cy + radius + 6 * u());
  textAlign(LEFT, BASELINE);
}

void drawHistoryGraph() {
  float m = 5 * u();
  float x = m;
  float y = 75 * u();
  float w = width - 2 * m;
  float h = 15 * u();

  noStroke();
  fill(31, 35, 45);
  rect(x, y, w, h, 3 * u());

  stroke(80, 200, 255);
  strokeWeight(max(1, 0.35 * u()));
  noFill();
  beginShape();
  for (int i = 0; i < HISTORY_SIZE; i++) {
    int idx = (historyHead + i) % HISTORY_SIZE;
    float px = map(i, 0, HISTORY_SIZE - 1, x + 2 * u(), x + w - 2 * u());
    float v = constrain(history[idx], 0, 20);
    float py = map(v, 0, 20, y + h - 2 * u(), y + 2 * u());
    vertex(px, py);
  }
  endShape();
}

void drawFooter() {
  fill(135, 145, 160);
  textSize(2.8 * u());
  String state = frozen ? "PAUSED - tap to resume" : "LIVE - tap to freeze";
  textAlign(CENTER, BASELINE);
  text(state, width / 2.0, height - 4 * u());
  textAlign(LEFT, BASELINE);
}
`,
      },
      {
        name: 'data/config.json',
        content: `{
  "title": "MotionScope",
  "smoothing": 0.14
}
`,
      },
    ],
  },
  {
    id: 'esp32',
    title: 'Связь с ESP32 по UDP',
    hint: 'Глава 15 - телефон спрашивает значения у платы и управляет светодиодом.',
    files: [
      {
        name: 'esp32Link.pde',
        content: `// Глава 15: связь с ESP32 по UDP.
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;

String ESP_IP   = "192.168.1.50";   // IP из Serial Monitor
int    ESP_PORT = 4210;

final int N = 100;                   // сколько точек на графике
int[] values = new int[N];
int head = 0;                        // кольцевой буфер

volatile boolean netRunning = false;
volatile int generation = 0;         // номер «поколения» сетевого потока
volatile long lastPacketMs = -100000;
volatile String pendingCommand = null;
boolean ledOn = false;

void setup() {
  fullScreen();
  orientation(PORTRAIT);
  textSize(18 * displayDensity);
  startNetwork();
}

void startNetwork() {
  if (netRunning) return;
  netRunning = true;
  generation++;
  thread("networkLoop");             // вся сеть - в фоновом потоке
}

void networkLoop() {
  int myGen = generation;            // старый поток не должен мешать новому
  DatagramSocket socket = null;
  try {
    InetAddress esp = InetAddress.getByName(ESP_IP);
    socket = new DatagramSocket();
    socket.setSoTimeout(200);
    byte[] buf = new byte[64];
    long lastHello = 0;
    while (netRunning && myGen == generation) {
      if (millis() - lastPacketMs > 1000 && millis() - lastHello > 1000) {
        send(socket, esp, "HELLO");
        lastHello = millis();
      }
      String cmd = pendingCommand;
      if (cmd != null) {
        send(socket, esp, cmd);
        pendingCommand = null;
      }
      try {
        DatagramPacket p = new DatagramPacket(buf, buf.length);
        socket.receive(p);
        String s = new String(p.getData(), 0, p.getLength()).trim();
        int v = Integer.parseInt(s);
        synchronized (values) {
          values[head] = v;
          head = (head + 1) % N;
        }
        lastPacketMs = millis();
      } catch (SocketTimeoutException e) {
        // данных нет - идём на следующий круг
      } catch (NumberFormatException e) {
        // мусорный пакет - игнорируем
      }
    }
  } catch (Exception e) {
    println("Network error: " + e);
  } finally {
    if (socket != null) socket.close();
    if (myGen == generation) netRunning = false;
  }
}

void send(DatagramSocket socket, InetAddress addr, String msg) throws Exception {
  byte[] data = msg.getBytes();
  socket.send(new DatagramPacket(data, data.length, addr, ESP_PORT));
}

void draw() {
  background(18, 20, 26);
  boolean online = millis() - lastPacketMs < 1000;
  float m = width * 0.05;

  fill(online ? color(90, 220, 140) : color(230, 90, 90));
  text(online ? "ESP32 online" : "Нет связи с " + ESP_IP, m, m + 20 * displayDensity);

  // график последних N значений
  float gx = m, gy = height * 0.15, gw = width - 2 * m, gh = height * 0.45;
  noStroke();
  fill(31, 35, 45);
  rect(gx, gy, gw, gh, 12);
  stroke(80, 200, 255);
  strokeWeight(2 * displayDensity);
  noFill();
  beginShape();
  synchronized (values) {
    for (int i = 0; i < N; i++) {
      int v = values[(head + i) % N];
      vertex(map(i, 0, N - 1, gx, gx + gw), map(v, 0, 4095, gy + gh, gy));
    }
  }
  endShape();

  // кнопка LED
  float bh = 64 * displayDensity;
  float by = height - m - bh;
  noStroke();
  fill(ledOn ? color(255, 200, 60) : color(60, 66, 80));
  rect(m, by, width - 2 * m, bh, bh * 0.25);
  fill(ledOn ? 0 : 255);
  textAlign(CENTER, CENTER);
  text(ledOn ? "LED: ВКЛ" : "LED: ВЫКЛ", width / 2, by + bh / 2);
  textAlign(LEFT, BASELINE);
}

void mouseReleased() {
  float m = width * 0.05;
  float bh = 64 * displayDensity;
  if (mouseY > height - m - bh) {
    ledOn = !ledOn;
    pendingCommand = ledOn ? "LED1" : "LED0";   // отправит фоновый поток
  }
}
`,
      },
      {
        name: 'esp32/esp32.ino',
        content: `// Скетч для ESP32 (Arduino IDE).
// Потенциометр - GPIO34, светодиод - GPIO2.
#include <WiFi.h>
#include <WiFiUdp.h>

const char* WIFI_SSID = "MyWiFi";
const char* WIFI_PASS = "password";
const int   UDP_PORT  = 4210;
const int   POT_PIN   = 34;
const int   LED_PIN   = 2;

WiFiUDP udp;
IPAddress phoneIp;
uint16_t phonePort = 0;
bool hasPhone = false;
unsigned long lastSend = 0;

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());   // этот адрес впиши в sketch на телефоне
  udp.begin(UDP_PORT);
}

void loop() {
  // 1. принимаем команды от телефона
  int size = udp.parsePacket();
  if (size > 0) {
    char buf[32];
    int n = udp.read(buf, sizeof(buf) - 1);
    buf[n] = 0;
    phoneIp   = udp.remoteIP();
    phonePort = udp.remotePort();
    hasPhone  = true;
    if (strcmp(buf, "LED1") == 0) digitalWrite(LED_PIN, HIGH);
    if (strcmp(buf, "LED0") == 0) digitalWrite(LED_PIN, LOW);
  }

  // 2. каждые 50 мс отправляем значение потенциометра (0..4095)
  if (hasPhone && millis() - lastSend >= 50) {
    lastSend = millis();
    udp.beginPacket(phoneIp, phonePort);
    udp.print(analogRead(POT_PIN));
    udp.endPacket();
  }
}
`,
      },
    ],
  },
  {
    id: 'android-studio',
    title: 'PApplet внутри Activity',
    hint: 'Глава 21.3 - Processing Core как renderer-слой обычного Android-проекта.',
    files: [
      {
        name: 'Sketch.java',
        content: `// Sketch.java - sketch как обычный Java-класс в Android Studio.
import processing.core.PApplet;

public class Sketch extends PApplet {
  public void settings() {
    fullScreen(P2D);
  }

  public void setup() {
    orientation(PORTRAIT);
  }

  public void draw() {
    background(24);
    fill(80, 200, 255);
    circle(mouseX, mouseY, 120);
  }
}
`,
      },
      {
        name: 'MainActivity.java',
        content: `// MainActivity.java - встраиваем sketch в Activity.
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import androidx.appcompat.app.AppCompatActivity;
import processing.android.CompatUtils;
import processing.android.PFragment;
import processing.core.PApplet;

public class MainActivity extends AppCompatActivity {
  private PApplet sketch;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    FrameLayout frame = new FrameLayout(this);
    frame.setId(CompatUtils.getUniqueViewId());
    setContentView(frame, new ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT));

    sketch = new Sketch();
    PFragment fragment = new PFragment(sketch);
    fragment.setView(frame, this);
  }

  // пробрасываем результат запросов разрешений в sketch
  @Override
  public void onRequestPermissionsResult(int requestCode,
      String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (sketch != null) {
      sketch.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }
  }
}
`,
      },
      {
        name: 'README.md',
        content: `# PApplet внутри Activity

Схема из главы 21: Activity отвечает за навигацию, разрешения и сервисы,
а sketch только рисует.

1. Возьми \`processing-core.jar\` из Android Mode и положи в \`app/libs/\`.
2. Подключи в \`app/build.gradle\`:
   \`implementation files('libs/processing-core.jar')\`
3. Создай \`Sketch.java\` и \`MainActivity.java\` из этого примера.
`,
      },
    ],
  },
];

export function exampleById(id) {
  return EXAMPLES.find((e) => e.id === id) || null;
}
