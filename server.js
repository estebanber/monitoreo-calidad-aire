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

// --- schema + migración ligera ---
db.serialize(() => {
  db.run("PRAGMA foreign_keys=ON");
  db.run(`CREATE TABLE IF NOT EXISTS sensores (
    sensor_id TEXT PRIMARY KEY,
    password  TEXT NOT NULL,
    nombre    TEXT,
    created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS datos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id TEXT NOT NULL,
    temperatura REAL,
    humedad REAL,
    calidad_aire INTEGER,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(sensor_id) REFERENCES sensores(sensor_id) ON DELETE CASCADE
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_datos_sensor_time ON datos(sensor_id, timestamp DESC)`);

  // intenta agregar columna nombre si faltaba (ignora error si ya existe)
  db.run(`ALTER TABLE sensores ADD COLUMN nombre TEXT`, () => {});
});

const now = () => Date.now();

function getAuthFromReq(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) {
    const token = h.slice(7);
    const p = token.indexOf(":");
    if (p > 0) return { sensor_id: token.slice(0, p), password: token.slice(p + 1) };
  }
  const b = req.body || {};
  if (b.sensor_id && b.password) return { sensor_id: String(b.sensor_id), password: String(b.password) };
  const q = req.query || {};
  if (q.sensor_id && q.password) return { sensor_id: String(q.sensor_id), password: String(q.password) };
  return null;
}

const sensorExists = (sensor_id) => new Promise((res, rej) => {
  db.get("SELECT 1 FROM sensores WHERE sensor_id=?", [sensor_id], (e, r) => e ? rej(e) : res(!!r));
});

const verifySensor = (sensor_id, password) => new Promise((res, rej) => {
  db.get("SELECT 1 FROM sensores WHERE sensor_id=? AND password=?", [sensor_id, password], (e, r) => e ? rej(e) : res(!!r));
});

const insertSensor = ({ sensor_id, password, nombre }) => new Promise((res, rej) => {
  db.run(
    "INSERT INTO sensores(sensor_id,password,nombre,created_at) VALUES(?,?,?,?)",
    [sensor_id, password, nombre || null, now()],
    function (e) { e ? rej(e) : res(true); }
  );
});

const insertDato = ({ sensor_id, temperatura, humedad, calidad_aire }) => new Promise((res, rej) => {
  db.run(
    "INSERT INTO datos(sensor_id,temperatura,humedad,calidad_aire,timestamp) VALUES(?,?,?,?,?)",
    [sensor_id, temperatura ?? null, humedad ?? null, calidad_aire ?? null, now()],
    function (e) { e ? rej(e) : res(this.lastID); }
  );
});

const getUltimoDato = (sensor_id) => new Promise((res, rej) => {
  const sql = sensor_id
    ? "SELECT * FROM datos WHERE sensor_id=? ORDER BY timestamp DESC LIMIT 1"
    : "SELECT * FROM datos ORDER BY timestamp DESC LIMIT 1";
  const params = sensor_id ? [sensor_id] : [];
  db.get(sql, params, (e, r) => e ? rej(e) : res(r || null));
});

const getHistorial = ({ sensor_id, limite }) => new Promise((res, rej) => {
  const lim = Math.max(1, Math.min(Number(limite) || 50, 500));
  const sql = sensor_id
    ? "SELECT * FROM datos WHERE sensor_id=? ORDER BY timestamp DESC LIMIT ?"
    : "SELECT * FROM datos ORDER BY timestamp DESC LIMIT ?";
  const params = sensor_id ? [sensor_id, lim] : [lim];
  db.all(sql, params, (e, rows) => e ? rej(e) : res(rows || []));
});

const getStats = (sensor_id) => new Promise((res, rej) => {
  const sql = sensor_id
    ? "SELECT COUNT(*) total_lecturas, AVG(temperatura) temp_promedio, AVG(humedad) humedad_promedio FROM datos WHERE sensor_id=?"
    : "SELECT COUNT(*) total_lecturas, AVG(temperatura) temp_promedio, AVG(humedad) humedad_promedio FROM datos";
  const params = sensor_id ? [sensor_id] : [];
  db.get(sql, params, (e, r) => e ? rej(e) : res(r || { total_lecturas:0, temp_promedio:null, humedad_promedio:null }));
});

// --- auth simple para UI (no ESP) ---
app.post("/api/auth/login", async (req, res) => {
  try {
    const { sensor_id, password } = req.body || {};
    if (!sensor_id || !password) return res.status(400).json({ success:false, error:"faltan campos" });
    const ok = await verifySensor(sensor_id, password);
    if (!ok) return res.status(403).json({ success:false, error:"credenciales invalidas" });
    res.json({ success:true, sensor_id });
  } catch (e) {
    res.status(500).json({ success:false, error:String(e.message || e) });
  }
});

app.post("/api/sensores/register", async (req, res) => {
  try {
    const sensor_id = String(req.body.sensor_id || "").trim();
    const password = String(req.body.password || "").trim();
    const nombre   = req.body.nombre ? String(req.body.nombre).trim() : null;
    if (!sensor_id || !password) return res.status(400).json({ success:false, error:"faltan campos" });
    const exists = await sensorExists(sensor_id);
    if (exists) return res.status(409).json({ success:false, error:"sensor ya existe" });
    await insertSensor({ sensor_id, password, nombre });
    res.json({ success:true, sensor_id });
  } catch (e) {
    res.status(500).json({ success:false, error:String(e.message || e) });
  }
});

// --- endpoint para ESP32 / envío de lecturas ---
app.post("/api/datos", async (req, res) => {
  try {
    const auth = getAuthFromReq(req);
    const { temperatura, humedad, calidad_aire } = req.body || {};
    if (!auth || !auth.sensor_id || !auth.password) return res.status(401).json({ success:false, error:"auth requerida" });
    const ok = await verifySensor(auth.sensor_id, auth.password);
    if (!ok) return res.status(403).json({ success:false, error:"credenciales invalidas" });
    const id = await insertDato({ sensor_id: auth.sensor_id, temperatura, humedad, calidad_aire });
    res.json({ success:true, id });
  } catch (e) {
    res.status(500).json({ success:false, error:String(e.message || e) });
  }
});

// --- lectura para UI ---
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
    res.status(500).json({ error:String(e.message || e) });
  }
});

app.get("/api/datos/historial", async (req, res) => {
  try {
    const sensor_id = req.query.sensor_id ? String(req.query.sensor_id) : null;
    const limite = req.query.limite || 50;
    const rows = await getHistorial({ sensor_id, limite });
    res.json(rows.map(r => ({
      temperatura: r.temperatura,
      humedad: r.humedad,
      calidad_aire: r.calidad_aire,
      timestamp: r.timestamp,
      dispositivo_id: r.sensor_id
    })));
  } catch (e) {
    res.status(500).json({ error:String(e.message || e) });
  }
});

app.get("/api/estadisticas", async (req, res) => {
  try {
    const sensor_id = req.query.sensor_id ? String(req.query.sensor_id) : null;
    const s = await getStats(sensor_id);
    res.json(s);
  } catch (e) {
    res.status(500).json({ error:String(e.message || e) });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
