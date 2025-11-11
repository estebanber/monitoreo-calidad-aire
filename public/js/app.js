// ===== Config =====
const API_BASE = '/api';
const INTERVALO_ACTUALIZACION = 10000;

// ===== Estado =====
let intervaloDatos = null;
let grafico = null;

// Utils DOM
const $ = (sel) => document.querySelector(sel);
const setText = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };

// ===== Inicio =====
document.addEventListener('DOMContentLoaded', () => {
  inicializarGrafico();
  iniciarActualizacionAutomatica();
  cargarDatosIniciales();
});
window.addEventListener('load', crearAnillos); // crea los 3 anillos al cargar

// ===== Flujo de datos =====
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

  actualizarAnillo('aire', data.calidad_aire);
  actualizarAnillo('temp', data.temperatura);
  actualizarAnillo('hum',  data.humedad);

  const estado = obtenerEstadoAire(data.calidad_aire);
  const elEstado = document.getElementById('estado-aire');
  if (elEstado) {
    elEstado.textContent = estado.texto;
    elEstado.className = `estado-aire ${estado.clase}`;
  }

  const t = new Date(data.timestamp).toLocaleTimeString('es-AR');

  // Protecciones por si no existen gráficos separados
  if (typeof chartTemp !== 'undefined' && chartTemp) {
    chartTemp.data.labels.push(t);
    chartTemp.data.datasets[0].data.push(Number(data.temperatura));
    if (chartTemp.data.labels.length > 100) { chartTemp.data.labels.shift(); chartTemp.data.datasets[0].data.shift(); }
    chartTemp.update();
  }
  if (typeof chartHum !== 'undefined' && chartHum) {
    chartHum.data.labels.push(t);
    chartHum.data.datasets[0].data.push(Number(data.humedad));
    if (chartHum.data.labels.length > 100) { chartHum.data.labels.shift(); chartHum.data.datasets[0].data.shift(); }
    chartHum.update();
  }
}

// ===== UI helpers =====
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
function mostrarHoraArgentina() {
  const el = document.querySelector('.ultimaActualizacion');
  if (!el) return;
  const ahora = new Date();
  el.textContent = ahora.toLocaleTimeString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires'
  });
}
setInterval(mostrarHoraArgentina, 1000);

// ===== Historial + tabla + gráfico combinado =====
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
    setText('.total-lecturas',   s.total_lecturas ?? 0);
    setText('.temp-promedio',    s.temp_promedio != null ? Number(s.temp_promedio).toFixed(1) : '--');
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
        { label: 'Temperatura (°C)',       borderColor: 'red',   data: [], fill: true, tension: 0.1 },
        { label: 'Humedad (%)',            borderColor: 'blue',  data: [], fill: true, tension: 0.1 },
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

// ===== 3 anillos en Canvas (aire, temp, hum) =====
const RING_LEDS = 24;
let RINGS = {};

function crearAnillos() {
  const ids = ['aire', 'temp', 'hum'];
  ids.forEach(id => {
    const cv = document.getElementById(`anillo-${id}-canvas`);
    if (cv) RINGS[id] = crearRing(cv);
  });
  dibujarTodos();
}

function crearRing(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
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

  return { ctx, cx, cy, r, ledR, leds, colorObjetivo: { r: 0, g: 255, b: 106 }, animando: false };
}

function actualizarAnillo(tipo, valor) {
  const ring = RINGS[tipo];
  if (!ring) return;

  const target = colorForValor(tipo, valor);
  ring.colorObjetivo = target;

  if (!ring.animando) {
    ring.animando = true;
    startWave(ring, RING_LEDS - 1);
  }
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
  Object.values(RINGS).forEach(ring => dibujarRing(ring));
}

function dibujarRing(ring) {
  const ctx = ring.ctx;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

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
    if (v < 360) return { r: 0, g: 255, b: 4 };
    if (v < 520) return { r: 81, g: 255, b: 0 };
    if (v < 680) return { r: 157, g: 255, b: 0 };
    if (v < 840) return { r: 255, g: 93, b: 0 };
    return { r: 255, g: 0, b: 0 };
  }
  if (tipo === 'temp') {
    if (v < 10) return { r: 0 , g: 251, b: 255 };
    if (v < 20) return { r: 4, g: 159, b: 226 };
    if (v < 30) return { r: 1, g: 100, b: 228 };
    return { r: 76, g: 0, b: 230 };
  }
  if (tipo === 'hum') {
    if (v < 30) return { r: 240, g: 0, b: 144 };
    if (v < 50) return { r: 204, g: 0, b: 122 };
    if (v < 70) return { r: 179, g: 0, b: 143 };
    return { r: 136, g: 2, b: 130 };
  }
  return { r: 255, g: 255, b: 255 };
}

// Test manual desde consola: ringTest('aire', 700)
window.ringTest = (t, val) => actualizarAnillo(t, val);







//Incio de sesion y Registro
function mostrarRegistro() {
    document.querySelector(".login-container").style.display = "none";
    document.querySelector(".registro-container").style.display = "block";
}

function mostrarLogin() {
    document.querySelector(".login-container").style.display = "block";
    document.querySelector(".registro-container").style.display = "none";
}





async function registrar() {
    const sensor_id = document.getElementById("reg-user").value;
    const password = document.getElementById("reg-pass").value;

    const error = document.getElementById("registro-error");
    const ok = document.getElementById("registro-ok");

    error.textContent = "";
    ok.textContent = "";

    if (!sensor_id || !password) {
        error.textContent = "Completá todos los campos.";
        return;
    }

    const body = { sensor_id, password };

    try {
        const res = await fetch("/api/registro", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const data = await res.json();

        if (res.ok) {
            ok.textContent = "Cuenta creada correctamente.";
        } else {
            error.textContent = data.message || "Error al registrar.";
        }
    } catch {
        error.textContent = "No se pudo conectar al servidor.";
    }
}
async function registrar() {
    const sensor_id = document.getElementById("reg-user").value;
    const password = document.getElementById("reg-pass").value;

    const error = document.getElementById("registro-error");
    const ok = document.getElementById("registro-ok");

    error.textContent = "";
    ok.textContent = "";

    if (!sensor_id || !password) {
        error.textContent = "Completá todos los campos.";
        return;
    }

    const body = { sensor_id, password };

    try {
        const res = await fetch("/api/registro", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const data = await res.json();

        if (res.ok) {
            ok.textContent = "Cuenta creada correctamente.";
        } else {
            error.textContent = data.message || "Error al registrar.";
        }
    } catch {
        error.textContent = "No se pudo conectar al servidor.";
    }
}



async function login() {
    const sensor_id = document.getElementById("user").value.trim();
    const password = document.getElementById("pass").value.trim();

    const error = document.getElementById("error");
    const completar = document.getElementById("completar");

    // Siempre comienzan ocultos
    error.style.display = "none";
    completar.style.display = "none";

    // ✅ Si falta completar campos
    if (!sensor_id || !password) {
        completar.style.display = "block";
        return;
    }

    try {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sensor_id, password })
        });

        const data = await res.json();

        // ✅ Credenciales inválidas
        if (!res.ok) {
            error.textContent = data.message || "Usuario o contraseña incorrectos.";
            error.style.display = "block";
            return;
        }

        // ✅ Login exitoso
        document.querySelector(".login-container").style.display = "none";
        document.getElementById("contenido").style.display = "block";

        localStorage.setItem("sensor_id", sensor_id);

        cargarDatosActuales(sensor_id);
        cargarHistorial(sensor_id);

    } catch (err) {
        error.textContent = "No se pudo conectar al servidor.";
        error.style.display = "block";
    }
}










async function cargarDatosActuales(sensor_id) {
    const res = await fetch(`/api/lecturas/actual?sensor_id=${sensor_id}`);
    const data = await res.json();

    // actualizar tus elementos del HTML
    document.getElementById("temperatura").textContent = data.temperatura;
    document.getElementById("humedad").textContent = data.humedad;
    document.getElementById("calidad_aire").textContent = data.calidad_aire;
}
