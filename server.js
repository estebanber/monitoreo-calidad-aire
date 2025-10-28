const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Inicializar base de datos SQLite
const db = new sqlite3.Database('./datos_sensores.db');

// Crear tabla si no existe
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS lecturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    temperatura REAL,
    humedad REAL,
    calidad_aire INTEGER,
    dispositivo_id TEXT DEFAULT 'ESP32_001'
  )`);
});

// Ruta para recibir datos del ESP32
app.post('/api/datos', (req, res) => {
  const { temperatura, humedad, calidad_aire, dispositivo_id } = req.body;
  
  if (temperatura === undefined || humedad === undefined || calidad_aire === undefined) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  const stmt = db.prepare(`INSERT INTO lecturas (temperatura, humedad, calidad_aire, dispositivo_id) 
                          VALUES (?, ?, ?, ?)`);
  
  stmt.run([temperatura, humedad, calidad_aire, dispositivo_id || 'ESP32_001'], function(err) {
    if (err) {
      console.error('Error al insertar datos:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    
    console.log(`Datos recibidos - Temp: ${temperatura}°C, Humedad: ${humedad}%, Aire: ${calidad_aire}`);
    res.json({ 
      success: true, 
      id: this.lastID,
      mensaje: 'Datos guardados correctamente' 
    });
  });
  
  stmt.finalize();
});

// Ruta para obtener datos actuales (último registro)
app.get('/api/datos/actual', (req, res) => {
  db.get(`SELECT * FROM lecturas ORDER BY timestamp DESC LIMIT 1`, (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Error al consultar datos' });
    }
    res.json(row || { mensaje: 'No hay datos disponibles' });
  });
});

// Ruta para obtener historial (últimas 100 lecturas)
app.get('/api/datos/historial', (req, res) => {
  const limite = req.query.limite || 100;
  
  db.all(`SELECT * FROM lecturas ORDER BY timestamp DESC LIMIT ?`, [limite], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Error al consultar historial' });
    }
    res.json(rows);
  });
});

// Ruta para estadísticas básicas
app.get('/api/estadisticas', (req, res) => {
  db.get(`SELECT 
    COUNT(*) as total_lecturas,
    AVG(temperatura) as temp_promedio,
    AVG(humedad) as humedad_promedio,
    AVG(calidad_aire) as aire_promedio,
    MIN(temperatura) as temp_minima,
    MAX(temperatura) as temp_maxima
    FROM lecturas 
    WHERE datetime(timestamp) >= datetime('now', '-24 hours')`, (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Error al calcular estadísticas' });
    }
    res.json(row);
  });
});

// Servir página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🌱 Servidor ejecutándose en http://localhost:${PORT}`);
  console.log(`📊 Panel de control disponible en http://localhost:${PORT}`);
  console.log(`🔌 Endpoint para ESP32: POST http://localhost:${PORT}/api/datos`);
});

// Cerrar base de datos al terminar
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Base de datos cerrada.');
    process.exit(0);
  });
});