/*
 * Monitor de Calidad de Aire - ESP32
 * Proyecto de Pasantías - Electrónica y Programación
 * 
 * Sensores:
 * - MQ135: Calidad de aire (pin analógico A0)
 * - DHT11: Temperatura y humedad (pin digital 4)
 * - Anillo LEDs: Indicaciones visuales (pin digital 2)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ========== CONFIGURACIÓN ==========
// WiFi
const char* ssid = "TU_WIFI_AQUI";
const char* password = "TU_PASSWORD_AQUI";

// Servidor (cambiar por la IP de tu computadora)
const char* serverURL = "http://192.168.1.100:3000/api/datos";

// Pines de sensores
#define DHT_PIN 4        // DHT11 conectado al pin 4
#define MQ135_PIN A0     // MQ135 conectado al pin analógico A0
#define LED_RING_PIN 2   // Anillo de LEDs conectado al pin 2

// Configuración sensores
DHT dht(DHT_PIN, DHT11);

// Variables globales
unsigned long ultimoEnvio = 0;
const unsigned long INTERVALO_ENVIO = 30000; // 30 segundos
const unsigned long INTERVALO_LECTURA = 2000; // 2 segundos

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  Serial.println("🌱 Monitor de Calidad de Aire - ESP32");
  
  // Inicializar sensores
  dht.begin();
  pinMode(LED_RING_PIN, OUTPUT);
  
  // Conectar WiFi
  conectarWiFi();
  
  // Indicar que está listo
  parpadearLED(3, 500); // 3 parpadeos rápidos
  Serial.println("✅ Sistema listo!");
}

// ========== LOOP PRINCIPAL ==========
void loop() {
  unsigned long tiempoActual = millis();
  
  // Leer sensores cada 2 segundos
  if (tiempoActual - ultimoEnvio >= INTERVALO_LECTURA) {
    float temperatura = dht.readTemperature();
    float humedad = dht.readHumidity();
    int valorMQ135 = analogRead(MQ135_PIN);
    
    // Mostrar lecturas en Serial
    mostrarLecturas(temperatura, humedad, valorMQ135);
    
    // Actualizar LEDs según calidad de aire
    actualizarLEDs(valorMQ135);
    
    // Enviar datos al servidor cada 30 segundos
    if (tiempoActual - ultimoEnvio >= INTERVALO_ENVIO) {
      if (!isnan(temperatura) && !isnan(humedad)) {
        enviarDatos(temperatura, humedad, valorMQ135);
        ultimoEnvio = tiempoActual;
      } else {
        Serial.println("❌ Error leyendo DHT11");
      }
    }
  }
  
  delay(100); // Pequeña pausa para no saturar el procesador
}

// ========== FUNCIONES WiFi ==========
void conectarWiFi() {
  Serial.print("Conectando a WiFi");
  WiFi.begin(ssid, password);
  
  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 20) {
    delay(500);
    Serial.print(".");
    intentos++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("✅ WiFi conectado!");
    Serial.print("📡 IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("❌ Error conectando WiFi");
  }
}

// ========== FUNCIONES DE SENSORES ==========
void mostrarLecturas(float temp, float hum, int aire) {
  Serial.println("📊 Lecturas actuales:");
  Serial.printf("   🌡️  Temperatura: %.1f°C\n", temp);
  Serial.printf("   💧 Humedad: %.1f%%\n", hum);
  Serial.printf("   🌬️  Calidad aire: %d\n", aire);
  Serial.println();
}

void actualizarLEDs(int valorAire) {
  // Mapear valor del sensor a intensidad LED (0-255)
  int intensidad = map(valorAire, 0, 1023, 0, 255);
  
  // Controlar LED según calidad
  if (valorAire < 100) {
    // Aire excelente - LED verde suave
    analogWrite(LED_RING_PIN, 50);
  } else if (valorAire < 200) {
    // Aire bueno - LED verde
    analogWrite(LED_RING_PIN, 100);
  } else if (valorAire < 400) {
    // Aire moderado - LED amarillo (parpadeo lento)
    digitalWrite(LED_RING_PIN, (millis() / 1000) % 2);
  } else if (valorAire < 600) {
    // Aire malo - LED rojo (parpadeo rápido)
    digitalWrite(LED_RING_PIN, (millis() / 500) % 2);
  } else {
    // Aire muy malo - LED rojo constante
    digitalWrite(LED_RING_PIN, HIGH);
  }
}

void parpadearLED(int veces, int duracion) {
  for (int i = 0; i < veces; i++) {
    digitalWrite(LED_RING_PIN, HIGH);
    delay(duracion);
    digitalWrite(LED_RING_PIN, LOW);
    delay(duracion);
  }
}

// ========== FUNCIONES DE COMUNICACIÓN ==========
void enviarDatos(float temperatura, float humedad, int calidadAire) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi desconectado, reintentando...");
    conectarWiFi();
    return;
  }
  
  HTTPClient http;
  http.begin(serverURL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000); // Timeout de 5 segundos
  
  // Crear JSON con los datos
  StaticJsonDocument<200> doc;
  doc["temperatura"] = round(temperatura * 10) / 10.0; // Redondear a 1 decimal
  doc["humedad"] = round(humedad * 10) / 10.0;
  doc["calidad_aire"] = calidadAire;
  doc["dispositivo_id"] = "ESP32_001";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  Serial.println("📤 Enviando datos al servidor...");
  Serial.println("   JSON: " + jsonString);
  
  // Enviar POST request
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.printf("✅ Datos enviados correctamente (Código: %d)\n", httpResponseCode);
    Serial.println("   Respuesta: " + response);
    
    // Parpadeo de confirmación
    parpadearLED(2, 200);
    
  } else {
    Serial.printf("❌ Error al enviar datos (Código: %d)\n", httpResponseCode);
    
    // Parpadeo de error
    parpadearLED(5, 100);
  }
  
  http.end();
  Serial.println();
}

// ========== FUNCIONES DE UTILIDAD ==========
String obtenerEstadoAire(int valor) {
  if (valor < 100) return "Excelente";
  if (valor < 200) return "Bueno";
  if (valor < 400) return "Moderado";
  if (valor < 600) return "Malo";
  return "Muy Malo";
}

// Función para mostrar información del sistema
void mostrarInfoSistema() {
  Serial.println("========== INFO DEL SISTEMA ==========");
  Serial.printf("Chip ID: %08X\n", (uint32_t)ESP.getEfuseMac());
  Serial.printf("Memoria libre: %d bytes\n", ESP.getFreeHeap());
  Serial.printf("Frecuencia CPU: %d MHz\n", ESP.getCpuFreqMHz());
  Serial.printf("WiFi RSSI: %d dBm\n", WiFi.RSSI());
  Serial.println("=====================================");
}