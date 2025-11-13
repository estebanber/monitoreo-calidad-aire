// server.js
const path = require("path");
const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, "datos_sensores.db");
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

const db = new sqlite3.Database(DB_PATH);

// ========= DB INIT =========
db.serialize(() => {
  db.run("PRAGMA foreign_keys=ON");

  // Tabla sensores: AHORA incluye lat, lng y last_seen
  db.run(`
    CREATE TABLE IF NOT EXISTS sensores (
      sensor_id TEXT PRIMARY KEY,
      password  TEXT NOT NULL,
      nombre    TEXT,
      ubicacion TEXT,
      lat       REAL,
      lng       REAL,
      created_at INTEGER NOT NULL,
      last_seen  INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS datos (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      sensor_id    TEXT NOT NULL,
      temperatura  REAL,
      humedad      REAL,
      calidad_aire INTEGER,
      timestamp    INTEGER NOT NULL,
      FOREIGN KEY(sensor_id) REFERENCES sensores(sensor_id) ON DELETE CASCADE
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_datos_sensor_time
          ON datos(sensor_id, timestamp DESC)`);
});

const now = () => Date.now();

// ========= HELPERS DB =========
function getAuthFromReq(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) {
    const token = h.slice(7);
    const sep = token.indexOf(":");
    if (sep > 0) {
      return {
        sensor_id: token.slice(0, sep),
        password: token.slice(sep + 1)
      };
    }
  }
  const b = req.body || {};
  if (b.sensor_id && b.password) {
    return { sensor_id: String(b.sensor_id), password: String(b.password) };
  }
  const q = req.query || {};
  if (q.sensor_id && q.password) {
    return { sensor_id: String(q.sensor_id), password: String(q.password) };
  }
  return null;
}

const verifySensor = (sensor_id, password) =>
  new Promise((resolve, reject) => {
    db.get(
      "SELECT sensor_id FROM sensores WHERE sensor_id=? AND password=?",
      [sensor_id, password],
      (e, row) => (e ? reject(e) : resolve(!!row))
    );
  });

const sensorExists = (sensor_id) =>
  new Promise((resolve, reject) => {
    db.get(
      "SELECT sensor_id FROM sensores WHERE sensor_id=?",
      [sensor_id],
      (e, row) => (e ? reject(e) : resolve(!!row))
    );
  });

const insertSensor = ({ sensor_id, password, nombre = null, ubicacion = null, lat = null, lng = null }) =>
  new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO sensores(sensor_id,password,nombre,ubicacion,lat,lng,created_at,last_seen)
       VALUES(?,?,?,?,?,?,?,?)`,
      [sensor_id, password, nombre, ubicacion, lat, lng, now(), now()],
      function (e) {
        if (e) reject(e);
        else resolve(true);
      }
    );
  });

const updateUbicacion = ({ sensor_id, lat, lng }) =>
  new Promise((resolve, reject) => {
    db.run(
      "UPDATE sensores SET lat=?, lng=?, last_seen=? WHERE sensor_id=?",
      [lat, lng, now(), sensor_id],
      function (e) {
        if (e) reject(e);
        else resolve(this.changes > 0);
      }
    );
  });

const insertDato = ({ sensor_id, temperatura, humedad, calidad_aire }) =>
  new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO datos(sensor_id,temperatura,humedad,calidad_aire,timestamp)
       VALUES(?,?,?,?,?)`,
      [sensor_id, temperatura ?? null, humedad ?? null, calidad_aire ?? null, now()],
      function (e) {
        if (e) reject(e);
        else resolve(this.lastID);
      }
    );
  });

const getUltimoDato = (sensor_id) =>
  new Promise((resolve, reject) => {
    const sql = sensor_id
      ? "SELECT * FROM datos WHERE sensor_id=? ORDER BY timestamp DESC LIMIT 1"
      : "SELECT * FROM datos ORDER BY timestamp DESC LIMIT 1";
    const params = sensor_id ? [sensor_id] : [];
    db.get(sql, params, (e, row) => (e ? reject(e) : resolve(row || null)));
  });

const getHistorial = ({ sensor_id, limite }) =>
  new Promise((resolve, reject) => {
    const lim = Math.max(1, Math.min(Number(limite) || 50, 500));
    const sql = sensor_id
      ? "SELECT * FROM datos WHERE sensor_id=? ORDER BY timestamp DESC LIMIT ?"
      : "SELECT * FROM datos ORDER BY timestamp DESC LIMIT ?";
    const params = sensor_id ? [sensor_id, lim] : [lim];
    db.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows || [])));
  });

const getStats = (sensor_id) =>
  new Promise((resolve, reject) => {
    const sql = sensor_id
      ? `SELECT COUNT(*) total_lecturas,
                AVG(temperatura) temp_promedio,
                AVG(humedad)     humedad_promedio
         FROM datos WHERE sensor_id=?`
      : `SELECT COUNT(*) total_lecturas,
                AVG(temperatura) temp_promedio,
                AVG(humedad)     humedad_promedio
         FROM datos`;
    const params = sensor_id ? [sensor_id] : [];
    db.get(sql, params, (e, row) =>
      e ? reject(e) : resolve(row || { total_lecturas: 0, temp_promedio: null, humedad_promedio: null })
    );
  });

// ========= ENDPOINTS =========

// Registro de sensor
app.post("/api/sensores/register", async (req, res) => {
  try {
    const sensor_id = String(req.body.sensor_id || "").trim();
    const password  = String(req.body.password  || "").trim();
    const nombre    = req.body.nombre    ? String(req.body.nombre).trim()    : null;
    const ubicacion = req.body.ubicacion ? String(req.body.ubicacion).trim() : null;
    const lat       = req.body.lat != null ? Number(req.body.lat) : null;
    const lng       = req.body.lng != null ? Number(req.body.lng) : null;

    if (!sensor_id || !password) {
      return res.status(400).json({ success:false, error:"faltan campos" });
    }

    const exists = await sensorExists(sensor_id);
    if (exists) {
      return res.status(409).json({ success:false, error:"sensor ya existe" });
    }

    await insertSensor({ sensor_id, password, nombre, ubicacion, lat, lng });
    res.json({ success:true, sensor_id });
  } catch (e) {
    console.error("Error /api/sensores/register:", e);
    res.status(500).json({ success:false, error:String(e.message || e) });
  }
});

// Actualizar ubicación del sensor autenticado
app.post("/api/sensores/ubicacion", async (req, res) => {
  try {
    const auth = getAuthFromReq(req);
    if (!auth) return res.status(401).json({ success:false, error:"auth requerida" });

    const ok = await verifySensor(auth.sensor_id, auth.password);
    if (!ok) return res.status(403).json({ success:false, error:"credenciales invalidas" });

    const lat = req.body.lat != null ? Number(req.body.lat) : null;
    const lng = req.body.lng != null ? Number(req.body.lng) : null;
    if (lat == null || lng == null) {
      return res.status(400).json({ success:false, error:"lat/lng requeridos" });
    }

    await updateUbicacion({ sensor_id: auth.sensor_id, lat, lng });
    res.json({ success:true });
  } catch (e) {
    console.error("Error /api/sensores/ubicacion:", e);
    res.status(500).json({ success:false, error:String(e.message || e) });
  }
});

// Ingesta de datos desde ESP32
app.post("/api/datos", async (req, res) => {
  try {
    const auth = getAuthFromReq(req);
    const { temperatura, humedad, calidad_aire, lat, lng } = req.body || {};

    if (!auth || !auth.sensor_id || !auth.password) {
      return res.status(401).json({ success:false, error:"auth requerida" });
    }
    const ok = await verifySensor(auth.sensor_id, auth.password);
    if (!ok) {
      return res.status(403).json({ success:false, error:"credenciales invalidas" });
    }

    const id = await insertDato({
      sensor_id: auth.sensor_id,
      temperatura,
      humedad,
      calidad_aire
    });

    if (lat != null && lng != null) {
      await updateUbicacion({ sensor_id: auth.sensor_id, lat:Number(lat), lng:Number(lng) });
    }

    res.json({ success:true, id });
  } catch (e) {
    console.error("Error /api/datos:", e);
    res.status(500).json({ success:false, error:String(e.message || e) });
  }
});

// Lectura actual
app.get("/api/datos/actual", async (req, res) => {
  try {
    const sensor_id = req.query.sensor_id ? String(req.query.sensor_id) : null;
    const row = await getUltimoDato(sensor_id);
    if (!row) return res.json({});

    res.json({
      temperatura: row.temperatura,
      humedad: row.humedad,
      calidad_aire: row.calidad_aire,
      timestamp: row.timestamp,
      dispositivo_id: row.sensor_id
    });
  } catch (e) {
    console.error("Error /api/datos/actual:", e);
    res.status(500).json({ error:String(e.message || e) });
  }
});

// Historial
app.get("/api/datos/historial", async (req, res) => {
  try {
    const sensor_id = req.query.sensor_id ? String(req.query.sensor_id) : null;
    const limite = req.query.limite || 50;
    const rows = await getHistorial({ sensor_id, limite });

    res.json(
      rows.map(r => ({
        temperatura: r.temperatura,
        humedad: r.humedad,
        calidad_aire: r.calidad_aire,
        timestamp: r.timestamp,
        dispositivo_id: r.sensor_id
      }))
    );
  } catch (e) {
    console.error("Error /api/datos/historial:", e);
    res.status(500).json({ error:String(e.message || e) });
  }
});

// Estadísticas globales o por sensor
app.get("/api/estadisticas", async (req, res) => {
  try {
    const sensor_id = req.query.sensor_id ? String(req.query.sensor_id) : null;
    const s = await getStats(sensor_id);
    res.json(s);
  } catch (e) {
    console.error("Error /api/estadisticas:", e);
    res.status(500).json({ error:String(e.message || e) });
  }
});

// === Promedios del día por sensor (para tabla de sensores.html) ===
app.get("/api/sensores/promedios-hoy", (req, res) => {
  const ahora = Date.now();
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);
  const tsInicio = inicioDia.getTime();

  const sql = `
    SELECT 
      s.sensor_id,
      s.nombre,
      s.ubicacion,
      AVG(d.temperatura)  AS temp_promedio_hoy,
      AVG(d.humedad)      AS humedad_promedio_hoy,
      AVG(d.calidad_aire) AS calidad_promedio_hoy,
      COUNT(d.id)         AS lecturas_hoy
    FROM sensores s
    LEFT JOIN datos d 
      ON d.sensor_id = s.sensor_id
     AND d.timestamp >= ?
     AND d.timestamp <= ?
    GROUP BY s.sensor_id, s.nombre, s.ubicacion
    ORDER BY s.sensor_id
  `;

  db.all(sql, [tsInicio, ahora], (err, rows) => {
    if (err) {
      console.error("Error /api/sensores/promedios-hoy:", err);
      return res.status(500).json({ error: "db_error" });
    }
    res.json(rows || []);
  });
});

// === Listado de sensores + última lectura (para mapa.js) ===
app.get("/api/sensores", (req, res) => {
  const sql = `
    SELECT 
      s.sensor_id, 
      s.nombre, 
      s.ubicacion,
      s.lat,
      s.lng,
      (SELECT temperatura  FROM datos d WHERE d.sensor_id=s.sensor_id ORDER BY timestamp DESC LIMIT 1) AS temperatura,
      (SELECT humedad      FROM datos d WHERE d.sensor_id=s.sensor_id ORDER BY timestamp DESC LIMIT 1) AS humedad,
      (SELECT calidad_aire FROM datos d WHERE d.sensor_id=s.sensor_id ORDER BY timestamp DESC LIMIT 1) AS calidad_aire,
      (SELECT timestamp    FROM datos d WHERE d.sensor_id=s.sensor_id ORDER BY timestamp DESC LIMIT 1) AS last_ts
    FROM sensores s
    ORDER BY s.sensor_id ASC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("Error /api/sensores:", err);
      return res.status(500).json({ error: "db_error" });
    }
    res.json(rows || []);
  });
});

// Raíz
app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
