// ====== CONFIG ======
const API_BASE = '/api';
const INTERVALO_ACTUALIZACION = 10000; // ms
const AR_TZ = 'America/Argentina/Mendoza';

// ====== STATE ======
let intervaloDatos = null;
let chartCombined = null;

// ====== HELPERS ======
const $ = (sel) => document.querySelector(sel);
const setText = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
const fmtTime = (ms) => new Date(ms).toLocaleString('es-AR', { timeZone: AR_TZ });
const getCreds = () => ({
  sensor_id: localStorage.getItem('sensor_id') || '',
  password:  localStorage.getItem('password')  || '',
});
const setCreds = (id, pw) => {
  localStorage.setItem('sensor_id', id);
  localStorage.setItem('password', pw);
};

// ====== UI TOGGLES (login / registro / app) ======
function mostrarLogin() {
  const L = $('.login-container'), R = $('.registro-container'), C = $('#contenido');
  if (L) L.style.display = 'block';
  if (R) R.style.display = 'none';
  if (C) C.style.display = 'none';
}
function mostrarRegistro() {
  const L = $('.login-container'), R = $('.registro-container'), C = $('#contenido');
  if (L) L.style.display = 'none';
  if (R) R.style.display = 'block';
  if (C) C.style.display = 'none';
}
function mostrarApp() {
  const L = $('.login-container'), R = $('.registro-container'), C = $('#contenido');
  if (L) L.style.display = 'none';
  if (R) R.style.display = 'none';
  if (C) C.style.display = 'block';
}

// ====== LOGIN / REGISTER ======
async function login() {
  const idEl = $('#sensor-id');
  const pwEl = $('#pass');
  const errEl = $('#error');
  const faltan = $('#completar');

  const sensor_id = idEl?.value.trim() || '';
  const password  = pwEl?.value.trim() || '';

  if (!sensor_id || !password) {
    if (faltan) faltan.textContent = 'Falta completar los campos';
    if (errEl) errEl.textContent = '';
    return;
  }
  if (faltan) faltan.textContent = '';

  // Verificación simple: si el sensor tiene datos/estadísticas, damos acceso
  try {
    const r = await fetch(`${API_BASE}/estadisticas?sensor_id=${encodeURIComponent(sensor_id)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    // Si responde, guardamos credenciales para POST desde ESP o futuras acciones
    setCreds(sensor_id, password);
    // Prefill inputs para próximas sesiones
    if (idEl) idEl.value = sensor_id;
    if (pwEl) pwEl.value = password;
    mostrarApp();
    // disparar cargas
    cargarDatosIniciales();
    if (!intervaloDatos) iniciarActualizacionAutomatica();
  } catch (e) {
    if (errEl) errEl.textContent = 'No se pudo validar el sensor';
  }
}

async function registrar() {
  const u = $('#reg-user');
  const p = $('#reg-pass');
  const ok = $('#registro-ok');
  const er = $('#registro-error');
  

  const sensor_id = u?.value.trim() || '';
  const password  = p?.value.trim() || '';
  if (!sensor_id || !password) {
    if (er) er.textContent = 'Completá ID y contraseña';
    if (ok) ok.textContent = '';
    return;
  }
  try {
    const r = await fetch(`${API_BASE}/sensores/register`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ sensor_id, password })
    });
    const j = await r.json();
    if (!r.ok || !j.success) throw new Error(j.error || 'Error de registro');
    if (ok) ok.textContent = 'Sensor registrado. Ahora podés iniciar sesión.';
    if (er) er.textContent = '';
  } catch (e) {
    if (er) er.textContent = String(e.message || e);
    if (ok) ok.textContent = '';
  }
}

// ====== DATOS INICIALES Y AUTO-REFRESH ======
document.addEventListener('DOMContentLoaded', () => {
  // Prefill si hay credenciales guardadas
  const creds = getCreds();
  const idEl = $('#sensor-id'), pwEl = $('#pass');
  if (idEl && creds.sensor_id) idEl.value = creds.sensor_id;
  if (pwEl && creds.password)  pwEl.value  = creds.password;

  // Arranca visible el login
  mostrarLogin();

  // Botones existen en HTML
  const btnLogin = $('#boton-login');
  if (btnLogin) btnLogin.onclick = login;
  const btnReg = $('#boton-registro');
  if (btnReg) btnReg.onclick = registrar;

  // Gráfico
  inicializarGrafico();

  // Anillos
  crearAnillosCanvas();

  // Historial selector
  const limiteEl = $('#limite-registros');
  if (limiteEl) limiteEl.addEventListener('change', cargarHistorial);
});

async function cargarDatosIniciales() {
  await cargarDatosActuales();
  await cargarHistorial();
}

function iniciarActualizacionAutomatica() {
  intervaloDatos = setInterval(async () => {
    await cargarDatosActuales();
  }, INTERVALO_ACTUALIZACION);
}

// ====== LECTURA DE API ======
async function cargarDatosActuales() {
  const { sensor_id } = getCreds();
  try {
    const r = await fetch(`${API_BASE}/datos/actual?sensor_id=${encodeURIComponent(sensor_id)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();

    if (data && data.temperatura != null) {
      actualizarInterfazDatos(data);
    } else {
      mostrarSinDatos();
    }
  } catch {
    mostrarErrorConexion();
  }
}

async function cargarHistorial() {
  const { sensor_id } = getCreds();
  const limite = $('#limite-registros')?.value ?? 50;
  try {
    const r = await fetch(`${API_BASE}/datos/historial?sensor_id=${encodeURIComponent(sensor_id)}&limite=${encodeURIComponent(limite)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    actualizarTablaHistorial(arr);
    actualizarGraficoConHistorial(arr);
  } catch {
    mostrarErrorTabla();
  }
}

// ====== UI: Datos actuales / Estados ======
function actualizarInterfazDatos(data) {
  setText('.indicadorTemperatura', Number(data.temperatura).toFixed(1));
  setText('.indicadorHumedad',     Number(data.humedad).toFixed(1));
  setText('.indicadorCalidad',     data.calidad_aire);

  const estado = obtenerEstadoAire(data.calidad_aire);
  const elEstado = $('#estado-aire');
  if (elEstado) {
    elEstado.textContent = estado.texto;
    elEstado.className = `estado-aire ${estado.clase}`;
  }

  setText('.ultimaActualizacion', fmtTime(Number(data.timestamp)));

  // Anillos
  actualizarAnillo('aire', data.calidad_aire);
  actualizarAnillo('temp', data.temperatura);
  actualizarAnillo('hum',  data.humedad);
}

function obtenerEstadoAire(v) {
  if (v < 360) return { texto: 'excelente, que buen momento para respirar', clase: 'aire-excelente' };
  if (v < 520) return { texto: 'bueno, no hay riesgo',                      clase: 'aire-bueno' };
  if (v < 680) return { texto: 'moderado, precaucion',                      clase: 'aire-moderado' };
  if (v < 840) return { texto: 'malo, alejarse',                            clase: 'aire-malo' };
  return { texto: 'muy malo, alejarse rapidamente',                         clase: 'aire-muy-malo' };
}

function mostrarSinDatos() {
  setText('.indicadorTemperatura', '--');
  setText('.indicadorHumedad', '--');
  setText('.indicadorCalidad', '--');
  setText('.estado-aire', 'Sin datos');
  setText('.ultimaActualizacion', 'No disponible');
}

function mostrarErrorConexion() {
  setText('.ultimaActualizacion', 'Error de conexión');
  const el = $('.ultimaActualizacion');
  if (el) el.style.color = '#e74c3c';
}

// ====== Historial: tabla ======
function actualizarTablaHistorial(datos) {
  const tbody = $('#tabla-historial tbody');
  if (!tbody) return;

  if (!Array.isArray(datos) || datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="cargando">No hay datos disponibles</td></tr>';
    return;
  }
  tbody.innerHTML = datos.map(r => `
    <tr>
      <td>${fmtTime(Number(r.timestamp))}</td>
      <td>${Number(r.temperatura).toFixed(1)}°C</td>
      <td>${Number(r.humedad).toFixed(1)}%</td>
      <td>${r.calidad_aire}</td>
      <td>${obtenerEstadoAire(r.calidad_aire).texto}</td>
    </tr>
  `).join('');
}

function mostrarErrorTabla() {
  const tbody = $('#tabla-historial tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="cargando">Error al cargar datos</td></tr>';
}

// ====== Gráfico combinado ======
function inicializarGrafico() {
  const canvas = $('#graficoLecturas');
  if (!canvas || !window.Chart) return;
  const ctx = canvas.getContext('2d');

  chartCombined = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Temperatura (°C)',      borderColor: 'red',   data: [], fill: false, tension: 0.1 },
        { label: 'Humedad (%)',           borderColor: 'blue',  data: [], fill: false, tension: 0.1 },
        { label: 'Calidad del Aire (AQI)',borderColor: 'green', data: [], fill: false, tension: 0.1 }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { title: { display: true, text: 'Hora' } },
        y: { title: { display: true, text: 'Valor' } }
      }
    }
  });
}

function actualizarGraficoConHistorial(datos) {
  if (!chartCombined || !Array.isArray(datos)) return;
  chartCombined.data.labels = datos.map(d => new Date(Number(d.timestamp))
    .toLocaleTimeString('es-AR', { timeZone: AR_TZ }));
  chartCombined.data.datasets[0].data = datos.map(d => Number(d.temperatura));
  chartCombined.data.datasets[1].data = datos.map(d => Number(d.humedad));
  chartCombined.data.datasets[2].data = datos.map(d => Number(d.calidad_aire));
  chartCombined.update();
}

// ====== 3 ANILLOS LED EN CANVAS (aire/temp/hum) ======
const RING_LEDS = 24;
let RINGS = {};

function crearAnillosCanvas() {
  const cvA = $('#anillo-aire-canvas');
  const cvT = $('#anillo-temp-canvas');
  const cvH = $('#anillo-hum-canvas');
  if (cvA) RINGS.aire = new RingCanvas(cvA, RING_LEDS, 'aire');
  if (cvT) RINGS.temp = new RingCanvas(cvT, RING_LEDS, 'temp');
  if (cvH) RINGS.hum  = new RingCanvas(cvH, RING_LEDS, 'hum');
}

function actualizarAnillo(tipo, valor) {
  const ring = RINGS[tipo];
  if (!ring) return;
  ring.setTargetColor(colorForValor(tipo, valor));
}

function colorForValor(tipo, v) {
  if (tipo === 'aire') {
    if (v < 360) return { r: 0, g: 255, b: 106 };
    if (v < 520) return { r: 32, g: 174, b: 91 };
    if (v < 680) return { r: 255, g: 204, b: 0 };
    if (v < 840) return { r: 255, g: 119, b: 0 };
    return { r: 255, g: 25,  b: 0 };
  }
  if (tipo === 'temp') {
    if (v < 10) return { r: 255, g: 255, b: 0 };
    if (v < 20) return { r: 0,   g: 0,   b: 255 };
    if (v < 30) return { r: 255, g: 200, b: 0 };
    return { r: 255, g: 60,  b: 0 };
  }
  if (tipo === 'hum') {
    if (v < 30) return { r: 157, g: 0,   b: 255 };
    if (v < 50) return { r: 255, g: 0,   b: 100 };
    if (v < 70) return { r: 0,   g: 255, b: 0 };
    return { r: 0,   g: 150, b: 255 };
  }
  return { r: 255, g: 255, b: 255 };
}

class RingCanvas {
  constructor(canvas, numLeds, tipo) {
    this.cv = canvas;
    this.ctx = this.cv.getContext('2d');
    this.num = numLeds;
    this.tipo = tipo;

    this.cx = this.cv.width / 2;
    this.cy = this.cv.height / 2;
    this.r  = Math.min(this.cx, this.cy) - 16;
    this.ledR = 9;

    // color por LED
    this.leds = Array.from({length: this.num}, () => ({ r: 0, g: 255, b: 106 }));
    this.target = { r: 0, g: 255, b: 106 };

    // animación secuencial
    this.waveIndex = this.num - 1; // empieza en el último
    this.progress = 0;
    this.running = false;

    this.lastTs = 0;
    requestAnimationFrame((ts) => this.loop(ts));
  }

  setTargetColor(rgb) {
    this.target = { ...rgb };
    this.waveIndex = this.num - 1; // reinicia ola
    this.progress = 0;
    this.running = true;
  }

  loop(ts) {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000) || 0.016;
    this.lastTs = ts;
    if (this.running) this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  update() {
    if (this.waveIndex < 0) { this.running = false; return; }
    const i = this.waveIndex;

    // transición suave del LED i hacia target
    const c0 = this.leds[i], c1 = this.target;
    const blend = 0.22; // suavidad de cambio de color
    const nr = c0.r + (c1.r - c0.r) * blend;
    const ng = c0.g + (c1.g - c0.g) * blend;
    const nb = c0.b + (c1.b - c0.b) * blend;
    this.leds[i] = { r: nr, g: ng, b: nb };

    // Si ya está muy cerca del color objetivo, pasa al LED anterior
    const dist = Math.abs(nr - c1.r) + Math.abs(ng - c1.g) + Math.abs(nb - c1.b);
    if (dist < 2) {
      this.leds[i] = { ...this.target };
      this.waveIndex -= 1;
    }
  }

  draw() {
    const ctx = this.ctx;
    const w = this.cv.width, h = this.cv.height;
    ctx.clearRect(0, 0, w, h);

    const g = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, this.r);
    g.addColorStop(0, '#0d1b2a');
    g.addColorStop(1, '#000');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.cx, this.cy, this.r + 14, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < this.num; i++) {
      const theta = (i / this.num) * Math.PI * 2;
      const x = this.cx + this.r * Math.cos(theta);
      const y = this.cy + this.r * Math.sin(theta);
      const c = this.leds[i];
      const col = `rgb(${c.r|0},${c.g|0},${c.b|0})`;

      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(x, y, this.ledR, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

// ====== Limpieza intervalo al salir ======
window.addEventListener('beforeunload', () => {
  if (intervaloDatos) clearInterval(intervaloDatos);
});
