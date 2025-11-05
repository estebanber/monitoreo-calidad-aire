const API_BASE = '/api';
const INTERVALO_ACTUALIZACION = 10000;

let intervaloDatos = null;
let grafico = null;

const $ = (sel) => document.querySelector(sel);
const setText = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };

document.addEventListener('DOMContentLoaded', () => {
  inicializarGrafico();
  iniciarActualizacionAutomatica();
  cargarDatosIniciales();
});

async function cargarDatosIniciales() {
  await cargarDatosActuales();
  await cargarEstadisticas();
  await cargarHistorial();
}

function iniciarActualizacionAutomatica() {
  intervaloDatos = setInterval(async () => {
    await cargarDatosActuales();
    await cargarEstadisticas();
  }, INTERVALO_ACTUALIZACION);
}

async function cargarDatosActuales() {
  try {
    const r = await fetch(`${API_BASE}/datos/actual`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (data && data.temperatura !== undefined) actualizarInterfazDatos(data);
    else mostrarSinDatos();
  } catch {
    mostrarErrorConexion();
  }
}

function actualizarInterfazDatos(data) {
  setText('.indicadorTemperatura', Number(data.temperatura).toFixed(1));
  setText('.indicadorHumedad', Number(data.humedad).toFixed(1));
  setText('.indicadorCalidad', data.calidad_aire);
  actualizarAnillo(data.calidad_aire);

  const estado = obtenerEstadoAire(data.calidad_aire);
  const elEstado = document.getElementById('estado-aire');
  if (elEstado) {
    elEstado.textContent = estado.texto;
    elEstado.className = `estado-aire ${estado.clase}`;
  }

  const fecha = new Date(data.timestamp);
  setText('.ultimaActualizacion', fecha.toLocaleString('es-AR'));
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
  const limite = document.getElementById('limite-registros')?.value ?? 50;
  try {
    const r = await fetch(`${API_BASE}/datos/historial?limite=${encodeURIComponent(limite)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const arr = await r.json();
    actualizarTablaHistorial(arr);
  } catch {
    mostrarErrorTabla();
  }
}

function actualizarTablaHistorial(datos) {
  const tbody = document.querySelector('#tabla-historial tbody');
  if (!tbody) return;

  if (!Array.isArray(datos) || datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="cargando">No hay datos disponibles</td></tr>';
    if (grafico) {
      grafico.data.labels = [];
      grafico.data.datasets.forEach(d => d.data = []);
      grafico.update();
    }
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

  if (grafico) {
    grafico.data.labels = datos.map(d => new Date(d.timestamp).toLocaleTimeString('es-AR'));
    grafico.data.datasets[0].data = datos.map(d => d.temperatura);
    grafico.data.datasets[1].data = datos.map(d => d.humedad);
    grafico.data.datasets[2].data = datos.map(d => d.calidad_aire);
    grafico.update();
  }
}

function mostrarErrorTabla() {
  const tbody = document.querySelector('#tabla-historial tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="cargando">Error al cargar datos</td></tr>';
}

async function cargarEstadisticas() {
  try {
    const r = await fetch(`${API_BASE}/estadisticas`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const s = await r.json();
    setText('.total-lecturas', s.total_lecturas ?? 0);
    setText('.temp-promedio', s.temp_promedio != null ? Number(s.temp_promedio).toFixed(1) : '--');
    setText('.humedad-promedio', s.humedad_promedio != null ? Number(s.humedad_promedio).toFixed(1) : '--');
  } catch {}
}

function inicializarGrafico() {
  const canvas = document.getElementById('graficoLecturas');
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
      scales: {
        x: { title: { display: true, text: 'Hora' } },
        y: { title: { display: true, text: 'Valor' } }
      }
    }
  });
}

const limiteEl = document.getElementById('limite-registros');
if (limiteEl) limiteEl.addEventListener('change', cargarHistorial);

window.addEventListener('beforeunload', () => {
  if (intervaloDatos) clearInterval(intervaloDatos);
});
// ===== Anillo LED con transición progresiva (de 24 a 1) =====
const RING_LEDS = 24;
let ringCanvas, ringCtx, leds = [];
let colorObjetivo = { r: 0, g: 255, b: 106 };
let animando = false;

function crearAnillo() {
  ringCanvas = document.getElementById('anillo-led-canvas');
  if (!ringCanvas) return;
  ringCtx = ringCanvas.getContext('2d');

  const w = ringCanvas.width, h = ringCanvas.height;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(cx, cy) - 16;
  const ledR = 9;

  leds = Array.from({ length: RING_LEDS }, (_, i) => {
    const ang = (i / RING_LEDS) * 2 * Math.PI;
    return {
      x: cx + r * Math.cos(ang),
      y: cy + r * Math.sin(ang),
      color: { r: 0, g: 255, b: 106 },
      progreso: 0,
      activo: false
    };
  });

  dibujarAnillo();
}

function actualizarAnillo(aqiRaw) {
  const aqi = Number(aqiRaw) || 0;
  colorObjetivo = colorForAQI(aqi);
  if (!animando) {
    animando = true;
    startWave(RING_LEDS - 1);
  }
}

function startWave(index) {
  if (index < 0) { animando = false; return; }

  const L = leds[index];
  L.activo = true;
  L.progreso += 0.2;

  const intervalo = setInterval(() => {
    L.progreso += 0.05;
    L.color.r += (colorObjetivo.r - L.color.r) * 0.2;
    L.color.g += (colorObjetivo.g - L.color.g) * 0.2;
    L.color.b += (colorObjetivo.b - L.color.b) * 0.2;

    dibujarAnillo();

    if (L.progreso >= 1) {
      clearInterval(intervalo);
      startWave(index - 1); // pasa al siguiente LED
    }
  }, 20);
}

function dibujarAnillo() {
  if (!ringCtx) return;
  const { width: w, height: h } = ringCanvas;
  ringCtx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const r = Math.min(cx, cy) - 16;
  const ledR = 9;

  const fondo = ringCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
  fondo.addColorStop(0, '#0d1b2a');
  fondo.addColorStop(1, '#000');
  ringCtx.fillStyle = fondo;
  ringCtx.beginPath();
  ringCtx.arc(cx, cy, r + 14, 0, Math.PI * 2);
  ringCtx.fill();

  for (const L of leds) {
    const c = `rgb(${L.color.r|0},${L.color.g|0},${L.color.b|0})`;
    ringCtx.shadowColor = c;
    ringCtx.shadowBlur = 10;
    ringCtx.fillStyle = c;
    ringCtx.beginPath();
    ringCtx.arc(L.x, L.y, ledR, 0, Math.PI * 2);
    ringCtx.fill();
    ringCtx.shadowBlur = 0;
  }
}

function colorForAQI(aqi) {
  const stops = [
    { aqi: 0,   c:{ r: 0, g:255, b:106 } },
    { aqi: 360, c:{ r:32, g:174, b:91 } },
    { aqi: 520, c:{ r:255, g:204, b:0 } },
    { aqi: 680, c:{ r:255, g:119, b:0 } },
    { aqi: 840, c:{ r:255, g:25, b:0 } }
  ];
  let i = 0; while (i < stops.length - 1 && aqi > stops[i + 1].aqi) i++;
  const s0 = stops[i], s1 = stops[i + 1] || s0;
  const t = (aqi - s0.aqi) / Math.max(1, s1.aqi - s0.aqi);
  return {
    r: s0.c.r + (s1.c.r - s0.c.r) * t,
    g: s0.c.g + (s1.c.g - s0.c.g) * t,
    b: s0.c.b + (s1.c.b - s0.c.b) * t
  };
}

window.addEventListener('load', crearAnillo);
window.ringTest = (v) => actualizarAnillo(v);
