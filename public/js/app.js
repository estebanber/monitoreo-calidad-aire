const API_BASE = '/api';
const INTERVALO_ACTUALIZACION = 10000;

let intervaloDatos = null;
let grafico = null;

const $  = (sel) => document.querySelector(sel);
const setText = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };

document.addEventListener('DOMContentLoaded', () => {
  console.log('🌱 Monitor de Calidad de Aire iniciado');
  inicializarGrafico();
  iniciarActualizacionAutomatica();
  cargarDatosIniciales();
});

async function cargarDatosIniciales() {
  await cargarDatosActuales();
  await cargarEstadisticas();   // si no la querés, borrá esta línea y la función
  await cargarHistorial();
}

function iniciarActualizacionAutomatica() {
  intervaloDatos = setInterval(async () => {
    await cargarDatosActuales();
    await cargarEstadisticas();
  }, INTERVALO_ACTUALIZACION);

  console.log(`🔄 Actualización automática cada ${INTERVALO_ACTUALIZACION / 1000} segundos`);
}

async function cargarDatosActuales() {
  try {
    const response = await fetch(`${API_BASE}/datos/actual`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data?.temperatura !== undefined) {
      actualizarInterfazDatos(data);
    } else {
      mostrarSinDatos();
    }
  } catch (error) {
    console.error('Error al cargar datos actuales:', error);
    mostrarErrorConexion();
  }
}

function actualizarInterfazDatos(data) {
  setText('.indicadorTemperatura', Number(data.temperatura).toFixed(1));
  setText('.indicadorHumedad',     Number(data.humedad).toFixed(1));
  setText('.indicadorCalidad',     data.calidad_aire);

  const estadoAire = obtenerEstadoAire(data.calidad_aire);
  const elEstado = document.getElementById('estado-aire');
  if (elEstado) {
    elEstado.textContent = estadoAire.texto;
    elEstado.className = `estado-aire ${estadoAire.clase}`;
  }

  const fecha = new Date(data.timestamp);
  setText('.ultimaActualizacion', fecha.toLocaleString('es-AR'));

  console.log(`📊 Datos actualizados: ${data.temperatura}°C, ${data.humedad}%, ${data.calidad_aire}`);
}

function obtenerEstadoAire(valor) {
  if (valor < 360) return { texto: 'excelente, que buen momento para respirar', clase: 'aire-excelente' };
  if (valor < 520) return { texto: 'bueno, no hay riesgo',                      clase: 'aire-bueno' };
  if (valor < 680) return { texto: 'moderado, precaucion',                      clase: 'aire-moderado' };
  if (valor < 840) return { texto: 'malo, alejarse',                            clase: 'aire-malo' };
  return { texto: 'muy malo, alejarse rapidamente',                              clase: 'aire-muy-malo' };
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

// ---- Historial + gráfico ----
async function cargarHistorial() {
  const limiteEl = document.getElementById('limite-registros');
  const limite = limiteEl ? limiteEl.value : 50;

  try {
    const response = await fetch(`${API_BASE}/datos/historial?limite=${encodeURIComponent(limite)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const historial = await response.json();
    actualizarTablaHistorial(historial);
  } catch (error) {
    console.error('Error al cargar historial:', error);
    mostrarErrorTabla();
  }
}

function actualizarTablaHistorial(datos) {
  const tbody = document.querySelector('#tabla-historial tbody');
  if (!tbody) return;

  if (!Array.isArray(datos) || datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="cargando">No hay datos disponibles</td></tr>';
    if (grafico) { grafico.data.labels = []; grafico.data.datasets.forEach(d=>d.data=[]); grafico.update(); }
    return;
  }

  // Tabla
  tbody.innerHTML = datos.map(registro => `
    <tr>
      <td>${new Date(registro.timestamp).toLocaleString('es-AR')}</td>
      <td>${Number(registro.temperatura).toFixed(1)}°C</td>
      <td>${Number(registro.humedad).toFixed(1)}%</td>
      <td>${registro.calidad_aire}</td>
      <td>${obtenerEstadoAire(registro.calidad_aire).texto}</td>
    </tr>
  `).join('');

  // Gráfico
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

// ---- Estadísticas (stub seguro) ----
async function cargarEstadisticas() {
  try {
    const r = await fetch(`${API_BASE}/estadisticas`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const s = await r.json();
    setText('.total-lecturas',   s.total_lecturas ?? 0);
    setText('.temp-promedio',    s.temp_promedio != null ? Number(s.temp_promedio).toFixed(1) : '--');
    setText('.humedad-promedio', s.humedad_promedio != null ? Number(s.humedad_promedio).toFixed(1) : '--');
  } catch (e) {
    console.error('Error al cargar estadísticas:', e);
  }
}

// ---- Chart.js ----
function inicializarGrafico() {
  const canvas = document.getElementById('graficoLecturas');
  if (!canvas || !window.Chart) return; // no rompe si falta
  const ctx = canvas.getContext('2d');

  grafico = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Temperatura (°C)',      borderColor: 'red',   data: [], fill: true, tension: 0.1 },
        { label: 'Humedad (%)',           borderColor: 'blue',  data: [], fill: true, tension: 0.1 },
        { label: 'Calidad del Aire (AQI)',borderColor: 'green', data: [], fill: true, tension: 0.1 }
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

// eventos
const limiteEl = document.getElementById('limite-registros');
if (limiteEl) limiteEl.addEventListener('change', cargarHistorial);

window.addEventListener('beforeunload', () => {
  if (intervaloDatos) clearInterval(intervaloDatos);
});
