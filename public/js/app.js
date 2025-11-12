// ===== Config =====
const API_BASE = '/api';
const INTERVALO_ACTUALIZACION = 10000;

// ===== Helpers DOM =====
const $ = (sel) => document.querySelector(sel);
const byId = (id) => document.getElementById(id);
const setText = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
const show = (el) => { if (el) el.style.display = ''; };
const hide = (el) => { if (el) el.style.display = 'none'; };

// ===== Estado =====
let intervaloDatos = null;
let grafico = null;
let SENSOR_ID = null;
let SENSOR_PASS = null;

// ===== Inicio =====
document.addEventListener('DOMContentLoaded', () => {
  prepararUIAuth();
  prepararChart();
  prepararAnillos();

  const tieneCredenciales = localStorage.getItem('sensor_id') && localStorage.getItem('sensor_pass');

  // SIEMPRE mostrar login al inicio
  mostrarLogin();
});

// ===== Auth UI =====
function prepararUIAuth() {
  const loginBtn = byId('boton-login');
  if (loginBtn) loginBtn.onclick = login;
}

function mostrarLogin() {
  hide($('#contenido'));
  show($('.login-container'));
  hide($('.registro-container'));
  limpiarMensajesAuth();
}

function mostrarRegistro() {
  hide($('.login-container'));
  show($('.registro-container'));
  limpiarMensajesAuth();
}

function limpiarMensajesAuth() {
  const e1 = byId('error'); if (e1) e1.textContent = '';
  const e2 = byId('completar'); if (e2) e2.textContent = '';
  const re = byId('registro-error'); if (re) re.textContent = '';
  const rk = byId('registro-ok'); if (rk) rk.textContent = '';
}

function mostrarApp() {
  show($('#contenido'));
  hide($('.login-container'));
  hide($('.registro-container'));
}

// ===== Credenciales =====
function guardarCredenciales(id, pass) {
  SENSOR_ID = String(id || '').trim();
  SENSOR_PASS = String(pass || '').trim();
  localStorage.setItem('sensor_id', SENSOR_ID);
  localStorage.setItem('sensor_pass', SENSOR_PASS);
}

function leerCredenciales() {
  SENSOR_ID = localStorage.getItem('sensor_id') || null;
  SENSOR_PASS = localStorage.getItem('sensor_pass') || null;
}

// ===== Login / Registro =====
async function login() {
  const idEl = byId('sensor-id');
  const pwEl = byId('pass');
  const errorEl = byId('error');
  const faltanEl = byId('completar');

  if (!idEl || !pwEl) return;

  const id = idEl.value.trim();
  const pw = pwEl.value.trim();

  if (!id || !pw) {
    if (faltanEl) faltanEl.textContent = 'Falta completar los campos';
    return;
  }

  guardarCredenciales(id, pw);

  mostrarApp();
  startPolling();
  await cargarDatosIniciales();

  if (errorEl) errorEl.textContent = '';
  if (faltanEl) faltanEl.textContent = '';
}

async function registrar() {
  const u = byId('reg-user');
  const p = byId('reg-pass');
  const ok = byId('registro-ok');
  const er = byId('registro-error');
  if (!u || !p) return;

  const sensor_id = (u.value || '').trim();
  const password  = (p.value || '').trim();

  if (!sensor_id || !password) {
    if (er) er.textContent = 'Completá usuario y contraseña';
    return;
  }

  try {
    const r = await fetch(`${API_BASE}/sensores/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensor_id, password })
    });
    const data = await r.json();
    if (!r.ok || !data.success) {
      if (er) er.textContent = data?.error || 'Error registrando';
      if (ok) ok.textContent = '';
      return;
    }
    if (ok) ok.textContent = 'Registrado. Ahora iniciá sesión.';
    if (er) er.textContent = '';
  } catch (e) {
    if (er) er.textContent = 'Error de red';
  }
}

window.mostrarRegistro = mostrarRegistro;
window.mostrarLogin = mostrarLogin;
window.login = login;
window.registrar = registrar;

// ===== Polling =====
function startPolling() {
  if (intervaloDatos) clearInterval(intervaloDatos);
  intervaloDatos = setInterval(async () => {
    await cargarDatosActuales();
    await cargarEstadisticas();
  }, INTERVALO_ACTUALIZACION);
}

async function cargarDatosIniciales() {
  await cargarDatosActuales();
  await cargarEstadisticas();
  await cargarHistorial();
}

// ===== Datos actuales / Estadísticas / Historial =====
async function cargarDatosActuales() {
  try {
    const qs = SENSOR_ID ? `?sensor_id=${encodeURIComponent(SENSOR_ID)}` : '';
    const r = await fetch(`${API_BASE}/datos/actual${qs}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!data || data.temperatura === undefined) {
      setText('.ultimaActualizacion', 'Sin datos');
      return;
    }
    setText('#temperatura', Number(data.temperatura).toFixed(1));
    setText('#humedad', Number(data.humedad).toFixed(1));
    setText('#calidad_aire', data.calidad_aire);

    const estado = obtenerEstadoAire(Number(data.calidad_aire));
    const elEstado = byId('estado-aire');
    if (elEstado) {
      elEstado.textContent = estado.texto;
      elEstado.className = `estado-aire ${estado.clase}`;
    }

    const fecha = new Date(Number(data.timestamp));
    setText('.ultimaActualizacion', fecha.toLocaleString('es-AR'));

    actualizarAnillo('aire', Number(data.calidad_aire));
    actualizarAnillo('temp', Number(data.temperatura));
    actualizarAnillo('hum',  Number(data.humedad));
  } catch {
    setText('.ultimaActualizacion', 'Error de conexión');
  }
}

async function cargarEstadisticas() {
  try {
    const qs = SENSOR_ID ? `?sensor_id=${encodeURIComponent(SENSOR_ID)}` : '';
    const r = await fetch(`${API_BASE}/estadisticas${qs}`);
    if (!r.ok) return;
    const s = await r.json();
    setText('.total-lecturas', s.total_lecturas ?? 0);
    setText('.temp-promedio', s.temp_promedio != null ? Number(s.temp_promedio).toFixed(1) : '--');
    setText('.humedad-promedio', s.humedad_promedio != null ? Number(s.humedad_promedio).toFixed(1) : '--');
  } catch {}
}

async function cargarHistorial() {
  const sel = byId('limite-registros');
  const lim = sel ? sel.value : 50;
  try {
    const qs = new URLSearchParams({ limite: String(lim) });
    if (SENSOR_ID) qs.append('sensor_id', SENSOR_ID);
    const r = await fetch(`${API_BASE}/datos/historial?${qs.toString()}`);
    if (!r.ok) throw new Error();
    const arr = await r.json();
    actualizarTablaHistorial(arr);
    actualizarGrafico(arr);
  } catch {
    const tbody = $('#tabla-historial tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="cargando">Error al cargar datos</td></tr>';
  }
}

function actualizarTablaHistorial(datos) {
  const tbody = $('#tabla-historial tbody');
  if (!tbody) return;

  if (!Array.isArray(datos) || datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="cargando">No hay datos</td></tr>';
    return;
  }

  tbody.innerHTML = datos.map(r => `
    <tr>
      <td>${new Date(r.timestamp).toLocaleString('es-AR')}</td>
      <td>${Number(r.temperatura).toFixed(1)}°C</td>
      <td>${Number(r.humedad).toFixed(1)}%</td>
      <td>${r.calidad_aire}</td>
      <td>${obtenerEstadoAire(r.calidad_aire).texto}</td>
    </tr>
  `).join('');
}

// ===== Chart.js =====
function prepararChart() {
  const canvas = byId('graficoLecturas');
  if (!canvas || !window.Chart) return;
  const ctx = canvas.getContext('2d');
  grafico = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Temperatura (°C)', borderColor: 'red',   data: [], fill: false, tension: 0.2 },
        { label: 'Humedad (%)',      borderColor: 'blue',  data: [], fill: false, tension: 0.2 },
        { label: 'Calidad (AQI)',    borderColor: 'green', data: [], fill: false, tension: 0.2 }
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

function actualizarGrafico(datos) {
  if (!grafico || !Array.isArray(datos)) return;
  grafico.data.labels = datos.map(d => new Date(d.timestamp).toLocaleTimeString('es-AR'));
  grafico.data.datasets[0].data = datos.map(d => Number(d.temperatura));
  grafico.data.datasets[1].data = datos.map(d => Number(d.humedad));
  grafico.data.datasets[2].data = datos.map(d => Number(d.calidad_aire));
  grafico.update();
}

// ===== Estado aire =====
function obtenerEstadoAire(v) {
  if (v < 360) return { texto: 'excelente, que buen momento para respirar', clase: 'aire-excelente' };
  if (v < 520) return { texto: 'bueno, no hay riesgo',                      clase: 'aire-bueno' };
  if (v < 680) return { texto: 'moderado, precaución',                       clase: 'aire-moderado' };
  if (v < 840) return { texto: 'malo, alejarse',                             clase: 'aire-malo' };
  return { texto: 'muy malo, alejarse rápidamente',                          clase: 'aire-muy-malo' };
}

// ===== Anillos LED en Canvas (aire, temp, hum) =====
const RING_LEDS = 24;
const RINGS = {};

function prepararAnillos() {
  crearRing('aire',  'anillo-aire-canvas');
  crearRing('temp',  'anillo-temp-canvas');
  crearRing('hum',   'anillo-hum-canvas');
  dibujarTodosRings();
}

function crearRing(key, canvasId) {
  const cv = byId(canvasId);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  const cx = w / 2, cy = h / 2;
  const r  = Math.min(cx, cy) - 16;
  const ledR = 9;

  const leds = Array.from({ length: RING_LEDS }, (_, i) => {
    const ang = (i / RING_LEDS) * 2 * Math.PI;
    return {
      x: cx + r * Math.cos(ang),
      y: cy + r * Math.sin(ang),
      color: { r: 0, g: 255, b: 106 },
      progreso: 0
    };
  });

  RINGS[key] = { ctx, cx, cy, r, ledR, leds, colorObjetivo: { r: 0, g: 255, b: 106 }, animando: false };
}

function actualizarAnillo(tipo, valor) {
  const ring = RINGS[tipo];
  if (!ring) return;

  ring.colorObjetivo = colorForValor(tipo, valor);
  if (!ring.animando) {
    ring.animando = true;
    waveStep(ring, RING_LEDS - 1);
  }
}

function waveStep(ring, idx) {
  if (idx < 0) { ring.animando = false; return; }
  const L = ring.leds[idx];
  const goal = ring.colorObjetivo;
  L.progreso = 0;

  const tmr = setInterval(() => {
    L.progreso += 0.06;
    L.color.r += (goal.r - L.color.r) * 0.25;
    L.color.g += (goal.g - L.color.g) * 0.25;
    L.color.b += (goal.b - L.color.b) * 0.25;

    dibujarRing(ring);

    if (L.progreso >= 1) {
      clearInterval(tmr);
      L.color = { ...goal };
      waveStep(ring, idx - 1);
    }
  }, 18);
}

function dibujarTodosRings() {
  Object.values(RINGS).forEach(dibujarRing);
}

function dibujarRing(ring) {
  const ctx = ring.ctx;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);

  const fondo = ctx.createRadialGradient(ring.cx, ring.cy, 0, ring.cx, ring.cy, ring.r);
  fondo.addColorStop(0, '#0d1b2a');
  fondo.addColorStop(1, '#000');
  ctx.fillStyle = fondo;
  ctx.beginPath();
  ctx.arc(ring.cx, ring.cy, ring.r + 14, 0, Math.PI * 2);
  ctx.fill();

  for (const L of ring.leds) {
    const c = `rgb(${L.color.r|0},${L.color.g|0},${L.color.b|0})`;
    ctx.shadowColor = c;
    ctx.shadowBlur = 10;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(L.x, L.y, ring.ledR, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function colorForValor(tipo, v) {
  if (tipo === 'aire') {
    if (v < 360) return { r: 0, g: 255, b: 106 };
    if (v < 520) return { r: 32, g: 174, b: 91 };
    if (v < 680) return { r: 255, g: 204, b: 0 };
    if (v < 840) return { r: 255, g: 119, b: 0 };
    return { r: 255, g: 25, b: 0 };
  }
  if (tipo === 'temp') {
    if (v < 10) return { r: 255, g: 255, b: 0 };
    if (v < 20) return { r: 0, g: 0, b: 255 };
    if (v < 30) return { r: 255, g: 200, b: 0 };
    return { r: 255, g: 60, b: 0 };
  }
  if (tipo === 'hum') {
    if (v < 30) return { r: 157, g: 0, b: 255 };
    if (v < 50) return { r: 255, g: 0, b: 100 };
    if (v < 70) return { r: 0, g: 255, b: 0 };
    return { r: 0, g: 150, b: 255 };
  }
  return { r: 255, g: 255, b: 255 };
}

// Exponer funciones usadas en enlaces del HTML
window.mostrarLogin = mostrarLogin;
window.mostrarRegistro = mostrarRegistro;
