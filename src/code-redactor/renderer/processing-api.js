/**
 * Словарь API Processing и Android Mode — источник для автодополнения.
 * Составлен по документации Processing for Android (приложение B) и книге
 * «Processing для Android» (глава 9, 12, 14).
 */

export const PROCESSING_KEYWORDS = [
  'setup', 'draw', 'settings', 'size', 'fullScreen', 'noSmooth', 'smooth', 'pixelDensity', 'displayDensity',
  'background', 'fill', 'noFill', 'stroke', 'noStroke', 'strokeWeight', 'strokeCap', 'strokeJoin',
  'rect', 'square', 'ellipse', 'circle', 'arc', 'line', 'point', 'triangle', 'quad', 'bezier',
  'beginShape', 'vertex', 'curveVertex', 'bezierVertex', 'endShape', 'shape', 'text', 'textSize', 'textFont',
  'textAlign', 'textWidth', 'textAscent', 'textDescent', 'textLeading', 'textWrap', 'pushStyle', 'popStyle',
  'push', 'pop', 'pushMatrix', 'popMatrix', 'translate', 'rotate', 'scale', 'resetMatrix', 'applyMatrix',
  'image', 'loadImage', 'imageMode', 'tint', 'noTint', 'filter', 'blend', 'saveFrame', 'save',
  'color', 'colorMode', 'red', 'green', 'blue', 'alpha', 'hue', 'saturation', 'brightness', 'lerpColor', 'hex',
  'map', 'constrain', 'dist', 'norm', 'lerp', 'radians', 'degrees', 'sq', 'mag', 'random', 'randomSeed',
  'randomGaussian', 'noise', 'noiseSeed', 'noiseDetail', 'shuffle', 'abs', 'floor', 'ceil', 'round', 'sqrt',
  'pow', 'exp', 'log', 'min', 'max', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sign', 'hypot',
  'int', 'float', 'boolean', 'char', 'byte', 'short', 'long', 'str', 'parseInt', 'parseFloat', 'parseBool',
  'millis', 'second', 'minute', 'hour', 'day', 'month', 'year', 'frameCount', 'frameRate', 'deltaTime',
  'loop', 'noLoop', 'redraw', 'exit', 'nf', 'nfs', 'nfc', 'createFont', 'println', 'print', 'format',
  'loadStrings', 'saveStrings', 'loadJSONObject', 'saveJSONObject', 'loadJSONArray', 'loadTable', 'saveTable',
  'mouseX', 'mouseY', 'pmouseX', 'pmouseY', 'mouseButton', 'mousePressed', 'key', 'keyCode', 'keyPressed',
  'width', 'height', 'displayWidth', 'displayHeight', 'pixels', 'touches', 'focused', 'online',
  'mousePressed', 'mouseReleased', 'mouseDragged', 'mouseMoved', 'mouseClicked', 'mouseWheel',
  'keyPressed', 'keyReleased', 'keyTyped', 'touchStarted', 'touchMoved', 'touchEnded', 'backPressed',
  'windowResized', 'settings',
  // Android Mode
  'orientation', 'openKeyboard', 'closeKeyboard', 'requestPermission', 'hasPermission', 'getActivity',
  'getContext', 'getPreferences', 'getSensorManager', 'getPackageName', 'thread', 'runOnUiThread',
  'onPause', 'onResume', 'onSensorChanged', 'onPermissionGranted', 'onLocationChanged',
  'accelerometerX', 'accelerometerY', 'accelerometerZ', 'gyroscopeX', 'gyroscopeY', 'gyroscopeZ',
  'magnetometerX', 'magnetometerY', 'magnetometerZ', 'heading', 'rotation', 'latitude', 'longitude',
  'altitude', 'accuracy',
  // Константы
  'P2D', 'P3D', 'FX2D', 'WEBGL', 'OPENGL', 'AR', 'METRO', 'DEFAULT', 'PORTRAIT', 'LANDSCAPE',
  'REVERSE_PORTRAIT', 'REVERSE_LANDSCAPE', 'UNKNOWN', 'CENTER', 'LEFT', 'RIGHT', 'TOP', 'BOTTOM', 'BASELINE',
  'CORNER', 'CORNERS', 'RADIUS', 'POINTS', 'LINES', 'TRIANGLES', 'QUADS', 'CLOSE', 'POLYGON', 'PATH',
  'CONTAIN', 'COVER', 'STRETCH', 'ADAPTIVE_CONTAIN', 'ADAPTIVE_COVER', 'ADAPTIVE_STRETCH',
  'GEOMETRY', 'GROUP', 'TEXT', 'PRIMITIVE', 'ENTER', 'RETURN', 'BACKSPACE', 'TAB', 'ESC', 'DELETE',
  'UP', 'DOWN', 'CODED', 'CONTROL', 'ALT', 'SHIFT',
  // Типы
  'PVector', 'PImage', 'PFont', 'PGraphics', 'PShape', 'PApplet', 'AdaptiveUI', 'ArrayList', 'HashMap', 'JSONObject',
  'JSONArray', 'JSON', 'Sensor', 'SensorManager', 'SensorEvent', 'SensorEventListener', 'Context',
  'Activity', 'View', 'Bundle', 'Handler', 'Looper', 'Runnable', 'Thread', 'File', 'IOException',
];

/** Члены встроенных переменных и классов — подсказки после точки. */
export const PROCESSING_MEMBERS = [
  // Переменные
  'x', 'y', 'z', 'width', 'height', 'pixels', 'frameCount', 'frameRate', 'millis', 'deltaTime',
  'mouseX', 'mouseY', 'pmouseX', 'pmouseY', 'mouseButton', 'mousePressed', 'key', 'keyCode', 'keyPressed',
  'touches', 'displayDensity', 'orientation', 'rotation', 'heading', 'accelerometerX', 'accelerometerY',
  'accelerometerZ', 'gyroscopeX', 'gyroscopeY', 'gyroscopeZ', 'magnetometerX', 'magnetometerY',
  'magnetometerZ', 'latitude', 'longitude', 'altitude', 'accuracy', 'displayWidth', 'displayHeight',
  // PVector
  'add', 'sub', 'mult', 'div', 'mag', 'magSq', 'normalize', 'limit', 'setMag', 'heading', 'rotate',
  'dist', 'lerp', 'copy', 'array', 'set', 'fromAngle', 'fromAngleXYZ', 'random2D', 'add', 'sub', 'mult', 'dist', 'lerp',
  // PApplet
  'size', 'fullScreen', 'background', 'fill', 'noFill', 'stroke', 'noStroke', 'strokeWeight', 'rect', 'ellipse',
  'circle', 'line', 'point', 'triangle', 'quad', 'arc', 'text', 'textSize', 'textAlign', 'textFont', 'image',
  'loadImage', 'pushMatrix', 'popMatrix', 'translate', 'rotate', 'scale', 'push', 'pop', 'random', 'map',
  'constrain', 'dist', 'lerp', 'println', 'saveFrame', 'loadStrings', 'saveStrings', 'loadJSONObject',
  'requestPermission', 'hasPermission', 'getActivity', 'getContext', 'getPreferences', 'thread', 'exit',
  'loop', 'noLoop', 'redraw', 'frameRate', 'millis',
  'attach', 'detach', 'enableAdaptiveUI', 'disableAdaptiveUI', 'uiScale', 'toDesignX', 'toDesignY', 'toScreenX', 'toScreenY',
  // PImage / JSONObject
  'getWidth', 'getHeight', 'getPixel', 'loadPixels', 'updatePixels', 'resize', 'copy', 'filter',
  'getString', 'getInt', 'getFloat', 'getBoolean', 'getJSONObject', 'getJSONArray', 'getStringArray',
  'hasKey', 'setString', 'setInt', 'setFloat', 'setBoolean', 'remove', 'clear', 'size',
  // Sensor
  'getDefaultSensor', 'registerListener', 'unregisterListener', 'getName', 'getType', 'values', 'accuracy',
  'timestamp',
  // Activity
  'finish', 'runOnUiThread', 'setRequestedOrientation', 'getSystemService', 'getPackageManager',
  'getPreferences', 'getSharedPreferences', 'putString', 'getString',
];

/** Частые слова Java-скетчей — помогают автодополнению в .pde. */
export const PROCESSING_EXTRA = [
  'volatile', 'public', 'private', 'protected', 'static', 'final', 'abstract', 'synchronized', 'native',
  'implements', 'extends', 'interface', 'package', 'import', 'instanceof', 'super', 'this',
  'new', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
  'try', 'catch', 'finally', 'throw', 'throws', 'null', 'true', 'false', 'class', 'enum',
  'String', 'Integer', 'Float', 'Double', 'Boolean', 'Long', 'Object', 'Exception', 'RuntimeException',
  'Math', 'System', 'Thread', 'Timer', 'TimerTask',
];
