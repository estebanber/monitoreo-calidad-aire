#include <Adafruit_NeoPixel.h>
#include <DHT.h>
#include <WiFi.h>
#include <HTTPClient.h>

#define DHTPIN 5
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

#define MQ135_PIN 34
#define LED_PIN 18
#define NUM_LEDS 24
#define BUZZER_PIN 23
Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

const char* ssid = "Wakapi-Staff";
const char* password = "Network!2019";
const char* serverURL = "http://192.168.48.238:3000/api/datos";

unsigned long previousMillis = 0;
const unsigned long interval = 45000;
int modoActual = 0;
unsigned long previousBeepMillis = 0;
bool buzzerOn = false;

void setup() {
  Serial.begin(115200);
  dht.begin();
  strip.begin();
  strip.show();
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  WiFi.begin(ssid, password);
  Serial.print("Conectando a WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nWiFi Conectado!");
}

void loop() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  int airValue = analogRead(MQ135_PIN);

  if (isnan(h) || isnan(t)) {
    Serial.println("Error leyendo DHT11");
    delay(200);
    return;
  }

  Serial.print("Temperatura: ");
  Serial.print(t);
  Serial.print(" °C   Humedad: ");
  Serial.print(h);
  Serial.print("%   Calidad Aire: ");
  Serial.println(airValue);

  unsigned long currentMillis = millis();

  if (modoActual == 0) {
    actualizarLEDsCalidad(airValue);
  } else if (modoActual == 1) {
    actualizarLEDsTemperatura(t);
  } else {
    actualizarLEDsHumedad(h);
  }
  manejarBuzzer(airValue);

  enviarDatos(t, h, airValue);
  if (currentMillis - previousMillis >= interval) {
    previousMillis = currentMillis;
    animacionArcoiris(5000);
    modoActual = (modoActual + 1) % 3;
  }

  delay(200);
}
void manejarBuzzer(int airValue) {
  unsigned long currentMillis = millis();
  if (airValue < 360) {
    digitalWrite(BUZZER_PIN, LOW); 
    return;
  }

  unsigned long beepInterval = 0;
  int beepDuration = 150;
  if (airValue < 520) {
    beepInterval = 20000;
  } else if (airValue < 680) {
    beepInterval = 8000;
  } else if (airValue < 840) {
    beepInterval = 3000;
  } else {
    beepInterval = 500;
  }
  if (currentMillis - previousBeepMillis >= beepInterval) {
    previousBeepMillis = currentMillis;
    tone(BUZZER_PIN, 2000, beepDuration);  // tono de 2 kHz
  }
}

void actualizarLEDsCalidad(int airValue) {
  airValue = constrain(airValue, 200, 1000);
  float calidad = map(airValue, 200, 1000, 100, 0);

  for (int i = 0; i < NUM_LEDS; i++) {
    float nivel = (float)i / (NUM_LEDS - 1) * 100;
    if (nivel <= calidad) {
      int r = map(nivel, 0, 100, 0, 255);
      int g = 255;
      int b = 0;
      strip.setPixelColor(i, strip.Color(r, g, b));
    } else {
      strip.setPixelColor(i, strip.Color(255, 0, 0));
    }
  }
  strip.show();
}

void actualizarLEDsTemperatura(float temp) {
  temp = constrain(temp, 0, 40);
  float porcentaje = map(temp, 0, 40, 0, 100);

  for (int i = 0; i < NUM_LEDS; i++) {
    float nivel = (float)i / (NUM_LEDS - 1) * 100;

    if (nivel <= porcentaje) {
      strip.setPixelColor(i, strip.Color(255, 255, 0));
    } else {
      strip.setPixelColor(i, strip.Color(0, 0, 255));
    }
  }

  strip.show();
}

void actualizarLEDsHumedad(float hum) {
  hum = constrain(hum, 0, 100);
  float porcentaje = map(hum, 0, 100, 0, 100);

  for (int i = 0; i < NUM_LEDS; i++) {
    float nivel = (float)i / (NUM_LEDS - 1) * 100;

    if (nivel <= porcentaje) {
      strip.setPixelColor(i, strip.Color(157, 0, 255));
    } else {
      strip.setPixelColor(i, strip.Color(255, 0, 100));
    }
  }

  strip.show();
}

void animacionArcoiris(int duracion) {
  unsigned long start = millis();
  while (millis() - start < duracion) {
    for (int j = 0; j < 256; j++) {
      for (int i = 0; i < NUM_LEDS; i++) {
        int pixelHue = (i * 256 / NUM_LEDS + j) & 255;
        strip.setPixelColor(i, strip.gamma32(strip.ColorHSV(pixelHue * 256)));
      }
      strip.show();
      delay(20);
    }
  }
}

void enviarDatos(float temp, float hum, int air) {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverURL);
    http.addHeader("Content-Type", "application/json");

    String json = "{\"temperatura\":" + String(temp) +
                  ",\"humedad\":" + String(hum) +
                  ",\"calidad_aire\":" + String(air) + "}";

    int code = http.POST(json);
    Serial.print("HTTP: ");
    Serial.println(code);
    http.end();
  } else {
    Serial.println("No conectado a WiFi");
  }
}