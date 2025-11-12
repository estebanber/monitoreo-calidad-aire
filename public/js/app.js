const API_BASE = '/api';
const INTERVALO_ACTUALIZACION = 10000;

let intervaloDatos = null;
let grafico = null;

const $ = (sel) => document.querySelector(sel);
const setText = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };
const byId = (id) => document.getElementById(id);

// ------- LOGIN + REGISTRO -------
function mostrarLogin() {
  const login = $('.login-container');
  const registro = $('.registro-container');
  const app = $('#contenido');
  if (login) login.style.display = '';
  if (registro) registro.style.display = 'none';
  if (app) app.style.display = 'none';
}
function mostrarRegistro() {
  const login = $('.login-container');
  const registro = $('.registro-container');
  if (login) login.style.display = 'none';
  if (registro) registro.style.display = '';
}
function mostrarApp() {
  const login = $('.login-container');
  const registro = $('.registro-container');
  const app = $('#contenido');
  if (login) login.style.display = 'none';
  if (registro) registro.style.display = 'none';
  if (app) app.style.display = '';
}

async function login() {
  const sensor_id = byId('sensor-id')?.value?.trim();
  const password  = byId('pass')?.value?.trim();
  const msgErr = byId('error');
  const msgComp = byId('completar');

  if (!sensor_id || !password) {
    if (msgComp) { msgComp.textContent = 'Falta completar los campos'; msgComp.style.display = ''; }
    if (msgErr) msgErr.style.display = 'none';
    return;
  }
  if (msgComp) msgComp.style.display = 'none';

  try {
    const r = await fetch(`${API_BASE}/api/../api/auth/login`.replace('/api/api','/api'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensor_id, password })
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'login inválido');
    localStorage.setItem('sensor_id', sensor_id);
    localStorage.setItem('password', password);
    mostrarApp();
    // arranca la app
    inicializarGrafico();
    iniciarActualizacionAutomatica();
    cargarDatosIniciales();
  } catch (e) {
    if (msgErr) { msgErr.textContent = e.message; msgErr.style.display = ''; }
  }
}

async function registrar() {
  const sensor_id = byId('reg-user')?.value?.trim();
  const password  = byId('reg-pass')?.value?.trim();
  const ok = byId('registro-ok');
  const err = byId('registro-error');
  if (!sensor_id || !password) {
    if (err) { err.textContent = 'Completá sensor y contraseña'; err.style.display=''; }
    if (ok) ok.style.display='none';
    return;
  }
  try {
    const r = await fetch(`${API_BASE}/sensores/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensor_id, password, nombre: sensor_id })
    });
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'no se pudo registrar');
    if (ok) { ok.textContent = 'Registro ok. Ahora iniciá sesión.'; ok.style.display=''; }
    if (err) err.style.display='none';
  } catch (e) {
    if (err) { err.textContent = e.message; err.style.display=''; }
    if (ok) ok.style.display='none';
  }
}

window.mostrarRegistro = mostrarRegistro;
window.mostrarLogin = mostrarLogin;
window.login = login;
window.registrar = registrar;

// ------- APP -------
document.addEventListener('DOMContentLoaded', () => {
  // muestra login por defecto
  mostrarLogin();

  // si ya tenías sesión guardada, entra directo
  const sid = localStorage.getItem('sensor_id');
  const pwd = localStorage.getItem('password');
  if (sid && pwd) {
    mostrarApp();
    inicializarGrafico();
    iniciarActualizacionAutomatica();
    cargarDatosIniciales();
  }
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

async function cargarDatosActuales() {
  try {
    const sensor_id = localStorage.getItem('sensor_id') || '';
    const r = await fetch(`${API_BASE}/datos/actual${sensor_id ? `?sensor_id=${encodeURIComponent(sensor_id)}`:''}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data && data.temperatura !== undefined) actualizarInterfazDatos(data);
    else mostrarSinDatos();
  } catch (e) {
    mostrarErrorConexion();
  }
}

function actualizarInterfazDatos(d) {
  setText('.indicadorTemperatura', Number(d.temperatura).toFixed(1));
  setText('.indicadorHumedad', Number(d.humedad).toFixed(1));
  setText('.indicadorCalidad', d.calidad_aire);

  const estado = obtenerEstadoAire(d.calidad_aire);
  const elEstado = $('#estado-aire');
  if (elEstado) {
    elEstado.textContent = estado.texto;
    elEstado.className = `estado-aire ${estado.clase}`;
  }

  const fecha = new Date(d.timestamp);
  setText('.ultimaActualizacion', fecha.toLocaleString('es-AR'));

  actualizarAnillo('aire', d.calidad_aire);
  actualizarAnillo('temp', d.temperatura);
  actualizarAnillo('hum',  d.humedad);
}

function obtenerEstadoAire(v) {
  if (v < 360) return { texto: 'excelente, que buen momento para respirar', clase: 'aire-excelente' };
  if (v < 520) return { texto: 'bueno, no hay riesgo', clase: 'aire-bueno' };
  if (v < 680) return { texto: 'moderado, precaucion', clase: 'aire-moderado' };
  if (v < 840) return { texto: 'malo, alejarse', clase: 'aire-malo' };
  return { texto: 'muy malo, alejarse rapidamente', clase: 'aire-muy-malo' };
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

async function cargarHistorial() {
  const sensor_id = localStorage.getItem('sensor_id') || '';
  const limite = byId('limite-registros')?.value || 50;
  try {
    const r = await fetch(`${API_BASE}/datos/historial?limite=${encodeURIComponent(limite)}${sensor_id ? `&sensor_id=${encodeURIComponent(sensor_id)}`:''}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    actualizarTablaHistorial(arr);
  } catch {
    mostrarErrorTabla();
  }
}

function actualizarTablaHistorial(datos) {
  const tbody = $('#tabla-historial tbody');
  if (!tbody) return;
  if (!Array.isArray(datos) || datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="cargando">No hay datos disponibles</td></tr>';
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

function mostrarErrorTabla() {
  const tbody = $('#tabla-historial tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="cargando">Error al cargar datos</td></tr>';
}

// ------- Chart combinado (si lo usás) -------
function inicializarGrafico() {
  const canvas = byId('graficoLecturas');
  if (!canvas || !window.Chart) return;
  const ctx = canvas.getContext('2d');
  grafico = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Temperatura (°C)', borderColor: 'red', data: [], fill: true, tension: 0.1 },
        { label: 'Humedad (%)', borderColor: 'blue', data: [], fill: true, tension: 0.1 },
        { label: 'Calidad del Aire (AQI)', borderColor: 'green', data: [], fill: true, tension: 0.1 }
      ]
    },
    options: {
      responsive: true,
      scales: { x: { title: { display: true, text: 'Hora' } }, y: { title: { display: true, text: 'Valor' } } }
    }
  });
}

// ====== ANILLOS LED EN CANVAS (aire, temp, hum) ======
const RING_LEDS = 24;
let RINGS = {};

function crearAnillos() {
  const map = { aire: 'anillo-aire-canvas', temp: 'anillo-temp-canvas', hum: 'anillo-hum-canvas' };
  Object.entries(map).forEach(([k, id]) => {
    const cv = byId(id);
    if (cv) RINGS[k] = crearRing(cv);
  });
  dibujarTodos();
}

function crearRing(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(cx, cy) - 16;
  const ledR = 9;
  const leds = Array.from({ length: RING_LEDS }, (_, i) => {
    const ang = (i / RING_LEDS) * 2 * Math.PI;
    return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang), color: { r: 0, g: 255, b: 106 }, progreso: 0 };
  });
  return { ctx, cx, cy, r, ledR, leds, colorObjetivo: { r: 0, g: 255, b: 106 }, animando: false };
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

function actualizarAnillo(tipo, valor) {
  const ring = RINGS[tipo];
  if (!ring) return;
  ring.colorObjetivo = colorForValor(tipo, Number(valor) || 0);
  if (!ring.animando) { ring.animando = true; startWave(ring, RING_LEDS - 1); }
}

function startWave(ring, index) {
  if (index < 0) { ring.animando = false; return; }
  const L = ring.leds[index];
  const goal = ring.colorObjetivo;
  L.progreso = 0;
  const intervalo = setInterval(() => {
    L.progreso += 0.05;
    L.color.r += (goal.r - L.color.r) * 0.2;
    L.color.g += (goal.g - L.color.g) * 0.2;
    L.color.b += (goal.b - L.color.b) * 0.2;
    dibujarRing(ring);
    if (L.progreso >= 1) {
      clearInterval(intervalo);
      startWave(ring, index - 1);
    }
  }, 20);
}

function dibujarTodos() {
  Object.values(RINGS).forEach(r => dibujarRing(r));
}

function dibujarRing(ring) {
  const ctx = ring.ctx;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
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

window.addEventListener('load', crearAnillos);
