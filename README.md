# 🌱 Monitor de Calidad de Aire - ESP32

Sistema de monitoreo ambiental para pasantías de electrónica y programación. Este proyecto permite recibir datos de sensores ESP32 (MQ135, DHT11) y visualizarlos en tiempo real a través de una interfaz web.

## 📋 Características

- **Backend Node.js** con Express y SQLite
- **Frontend vanilla JavaScript** (sin frameworks)
- **Base de datos SQLite** para almacenamiento local
- **API REST** para recibir datos del ESP32
- **Interfaz web responsive** para visualización
- **Simulador integrado** para pruebas sin hardware

## 🛠️ Instalación

### Requisitos Previos

#### Windows
1. **Node.js** (versión 16 o superior)
   - Descargar desde: https://nodejs.org/
   - Verificar instalación: `node --version` y `npm --version`

2. **Git** (opcional, para clonar el repositorio)
   - Descargar desde: https://git-scm.com/

#### Linux (Ubuntu/Debian)
```bash
# Actualizar sistema
sudo apt update

# Instalar Node.js y npm
sudo apt install nodejs npm

# Verificar instalación
node --version
npm --version

# Instalar Git (si no está instalado)
sudo apt install git
```

### Configuración del Proyecto

1. **Clonar o descargar el proyecto**
```bash
git clone <url-del-repositorio>
cd monitoreo-calidad-aire
```

2. **Instalar dependencias**
```bash
npm install
```

3. **Iniciar el servidor**
```bash
# Modo desarrollo (reinicia automáticamente)
npm run dev

# Modo producción
npm start
```

4. **Abrir en el navegador**
   - Ir a: http://localhost:3000

## 🚀 Uso del Sistema

### Panel Web
- **Datos Actuales**: Muestra temperatura, humedad y calidad de aire en tiempo real
- **Estadísticas**: Promedios y totales de las últimas 24 horas
- **Historial**: Tabla con registros anteriores
- **Simulador**: Para probar el sistema sin ESP32

### API Endpoints

#### Enviar datos desde ESP32
```http
POST /api/datos
Content-Type: application/json

{
  "temperatura": 25.5,
  "humedad": 60.2,
  "calidad_aire": 150,
  "dispositivo_id": "ESP32_001"
}
```

#### Obtener datos actuales
```http
GET /api/datos/actual
```

#### Obtener historial
```http
GET /api/datos/historial?limite=50
```

#### Obtener estadísticas
```http
GET /api/estadisticas
```

## 🔌 Configuración ESP32

### Código Arduino Básico
```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// Configuración WiFi
const char* ssid = "TU_WIFI";
const char* password = "TU_PASSWORD";

// Configuración servidor
const char* serverURL = "http://192.168.1.100:3000/api/datos";

// Configuración sensores
#define DHT_PIN 4
#define MQ135_PIN A0
#define LED_PIN 2

DHT dht(DHT_PIN, DHT11);

void setup() {
  Serial.begin(115200);
  dht.begin();
  
  // Conectar WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Conectando WiFi...");
  }
  Serial.println("WiFi conectado!");
}

void loop() {
  // Leer sensores
  float temperatura = dht.readTemperature();
  float humedad = dht.readHumidity();
  int calidadAire = analogRead(MQ135_PIN);
  
  // Enviar datos
  if (!isnan(temperatura) && !isnan(humedad)) {
    enviarDatos(temperatura, humedad, calidadAire);
  }
  
  delay(30000); // Enviar cada 30 segundos
}

void enviarDatos(float temp, float hum, int aire) {
  HTTPClient http;
  http.begin(serverURL);
  http.addHeader("Content-Type", "application/json");
  
  // Crear JSON
  StaticJsonDocument<200> doc;
  doc["temperatura"] = temp;
  doc["humedad"] = hum;
  doc["calidad_aire"] = aire;
  doc["dispositivo_id"] = "ESP32_001";
  
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Enviar POST
  int httpResponseCode = http.POST(jsonString);
  
  if (httpResponseCode > 0) {
    Serial.println("Datos enviados correctamente");
  } else {
    Serial.println("Error al enviar datos");
  }
  
  http.end();
}
```

### Librerías Necesarias para Arduino
- WiFi (incluida en ESP32)
- HTTPClient (incluida en ESP32)
- ArduinoJson
- DHT sensor library

## 📁 Estructura del Proyecto

```
monitoreo-calidad-aire/
├── server.js              # Servidor Node.js principal
├── package.json           # Dependencias y scripts
├── datos_sensores.db      # Base de datos SQLite (se crea automáticamente)
├── README.md             # Este archivo
└── public/               # Frontend
    ├── index.html        # Página principal
    ├── css/
    │   └── styles.css    # Estilos CSS
    └── js/
        └── app.js        # JavaScript de la aplicación
```

## 🧪 Pruebas

### Usando el Simulador Web
1. Ir a la sección "Simulador" en la página web
2. Ingresar valores de prueba:
   - Temperatura: 20-30°C
   - Humedad: 40-80%
   - Calidad aire: 0-500
3. Hacer clic en "Enviar Datos"
4. Verificar que aparezcan en "Datos Actuales" e "Historial"

### Usando curl (Terminal)
```bash
curl -X POST http://localhost:3000/api/datos \
  -H "Content-Type: application/json" \
  -d '{"temperatura": 24.5, "humedad": 65.0, "calidad_aire": 120}'
```

## 🔧 Personalización

### Cambiar Puerto del Servidor
Editar `server.js`, línea 6:
```javascript
const PORT = 3001; // Cambiar a puerto deseado
```

### Modificar Intervalo de Actualización
Editar `public/js/app.js`, línea 3:
```javascript
const INTERVALO_ACTUALIZACION = 10000; // 10 segundos
```

### Agregar Nuevos Sensores
1. Modificar la tabla en `server.js` (función de creación de tabla)
2. Actualizar endpoints para recibir nuevos datos
3. Modificar frontend para mostrar nuevos valores

## 🐛 Solución de Problemas

### El servidor no inicia
- Verificar que Node.js esté instalado: `node --version`
- Verificar que las dependencias estén instaladas: `npm install`
- Verificar que el puerto 3000 no esté ocupado

### No se reciben datos del ESP32
- Verificar que ESP32 y servidor estén en la misma red
- Cambiar la IP en el código Arduino por la IP de tu computadora
- Verificar que el firewall no bloquee el puerto 3000

### La página web no carga
- Verificar que el servidor esté ejecutándose
- Ir a http://localhost:3000 (no abrir el archivo HTML directamente)

## 📚 Próximos Pasos

1. **Conectar ESP32 real** con sensores MQ135 y DHT11
2. **Agregar anillo de LEDs** para indicaciones visuales
3. **Implementar alertas** por valores críticos
4. **Agregar gráficos** para visualización histórica
5. **Configurar base de datos remota** para múltiples dispositivos

## 👥 Contribuir

Este es un proyecto educativo para pasantías. Los estudiantes pueden:
- Agregar nuevas funcionalidades
- Mejorar la interfaz de usuario
- Optimizar el código
- Documentar mejoras

## 📄 Licencia

MIT License - Proyecto educativo para pasantías 2025