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
Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

const char* ssid = "Wakapi-Staff";
const char* password = "Network!2019";
const char* serverURL = "http://192.168.48.238:3000/api/datos";

float calidadSuavizada = 100.0;  // Valor inicial

void setup() {
  Serial.begin(115200);
  dht.begin();
  strip.begin();
  strip.show();

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
  Serial.print("%   Air: ");
  Serial.println(airValue);

  actualizarLEDs(airValue);
  enviarDatos(t, h, airValue);

  delay(200);
}

void actualizarLEDs(int airValue) {
  airValue = constrain(airValue, 200, 1000);
  float calidad = map(airValue, 200, 1000, 100, 0);

  calidadSuavizada = calidadSuavizada * 0.93 + calidad * 0.07;

  for (int i = 0; i < NUM_LEDS; i++) {
    float nivel = (float)i / (NUM_LEDS - 1) * 100;
    if (nivel <= calidadSuavizada) {
      strip.setPixelColor(i, strip.Color(0, 255, 0));
    } else {
      float factor = (nivel - calidadSuavizada) / (100.0 / NUM_LEDS);
      factor = constrain(factor, 0, 1);
      int r = map(factor * 100, 0, 100, 255, 255);
      int g = map(factor * 100, 0, 100, 255, 0);
      strip.setPixelColor(i, strip.Color(r, g, 0));
    }
  }

  strip.show();
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


