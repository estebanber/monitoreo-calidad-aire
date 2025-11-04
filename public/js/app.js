const API_BASE = '/api';
const INTERVALO_ACTUALIZACION = 5000;

let intervaloDatos = null;

const $  = (sel) => document.querySelector(sel);
const setText = (sel, txt) => { const el = $(sel); if (el) el.textContent = txt; };

document.addEventListener('DOMContentLoaded', () => {
  console.log('🌱 Monitor de Calidad de Aire iniciado');
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

  console.log(`🔄 Actualización automática cada ${INTERVALO_ACTUALIZACION / 10000} segundos`);
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
  const elEstado = document.getElementById('estado-aire'); // ej: <span class="estado-aire"></span>
  if (elEstado) {
    elEstado.textContent = estadoAire.texto;
    elEstado.className = `estado-aire ${estadoAire.clase}`;
  }

  const fecha = new Date(data.timestamp);
  setText('.ultimaActualizacion', fecha.toLocaleString('es-AR'));

  console.log(`📊 Datos actualizados: ${data.temperatura}°C, ${data.humedad}%, ${data.calidad_aire}`);
}

function obtenerEstadoAire(valor) {
  if (valor < 360)  return { texto: 'excelente, que buen momento para respirar', clase: 'aire-excelente' };
  if (valor < 520) return { texto: 'bueno, no hay riesgo',     clase: 'aire-bueno' };
  if (valor < 680) return { texto: 'moderado, precaucion',  clase: 'aire-moderado' };
  if (valor < 840) return { texto: 'malo, alejarse',      clase: 'aire-malo' };
  return { texto: 'muy malo, alejarse rapidamente', clase: 'aire-muy-malo'  };
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
  const limite = document.getElementById('limite-registros').value;

  try {
    const response = await fetch(`${API_BASE}/datos/historial?limite=${limite}`);
    const historial = await response.json();
    actualizarTablaHistorial(historial);
  } catch (error) {
    console.error('Error al cargar historial:', error);
    mostrarErrorTabla();
  }
}

function actualizarTablaHistorial(datos) {
  const tbody = document.querySelector('tablaHistorial tbody');

  if (datos.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="cargando">No hay datos disponibles</td></tr>';
    return;
  }

  tbody.innerHTML = datos.map(registro => `
    <tr>
      <td>${new Date(registro.timestamp).toLocaleString('es-AR')}</td>
      <td>${registro.temperatura.toFixed(1)}°C</td>
      <td>${registro.humedad.toFixed(1)}%</td>
      <td><span class="${obtenerEstadoAire(registro.calidad_aire).clase}">${registro.calidad_aire}</span></td>
      <td>${registro.dispositivo_id}</td>
    </tr>
  `).join('');
}

function mostrarErrorTabla() {
  const tbody = document.querySelector('#tablaHistorial tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="cargando">Error al cargar datos</td></tr>';
}


const limite = document.getElementById('limite-registros');
if (limite) limite.addEventListener('change', cargarHistorial);

window.addEventListener('beforeunload', () => {
  if (intervaloDatos) clearInterval(intervaloDatos);
});
