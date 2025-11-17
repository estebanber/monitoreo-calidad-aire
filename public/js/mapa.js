// mapa.js
const API_SENSORES = '/api/sensores';
let map;
let markers = new Map(); // sensor_id -> marker

function colorByAQI(aqi) {
  if (aqi == null) return 'gray';
  if (aqi < 360) return 'green';
  if (aqi < 520) return 'lime';
  if (aqi < 680) return 'gold';
  if (aqi < 840) return 'orange';
  return 'red';
}

function iconFor(aqi) {
  const color = colorByAQI(aqi);
  return L.divIcon({
    className: 'sensor-marker',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};border:2px solid #111;box-shadow:0 0 6px rgba(0,0,0,.4)
    "></div>`,
    iconSize: [14,14],
    iconAnchor: [7,7],
  });
}

async function fetchSensores() {
  const r = await fetch(API_SENSORES);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function upsertMarker(s) {
  if (s.lat == null || s.lng == null) return; // sin ubicación -> no se pinta
  const pos = [Number(s.lat), Number(s.lng)];
  const html = `
    <div style="min-width:220px">
      <strong>${s.nombre || s.sensor_id}</strong><br>
      ${s.ubicacion ? `<small>${s.ubicacion}</small><br>` : ''}
      <small>Última: ${s.last_ts ? fmtTime(s.last_ts) : '—'}</small><br>
      Temp: ${s.temperatura ?? '—'} °C<br>
      Hum: ${s.humedad ?? '—'} %<br>
      AQI: ${s.calidad_aire ?? '—'}
    </div>
  `;

  if (markers.has(s.sensor_id)) {
    const mk = markers.get(s.sensor_id);
    mk.setLatLng(pos);
    mk.setIcon(iconFor(s.calidad_aire));
    mk.setPopupContent(html);
  } else {
    const mk = L.marker(pos, { icon: iconFor(s.calidad_aire) }).addTo(map);
    mk.bindPopup(html);
    markers.set(s.sensor_id, mk);
  }
}

function dropStaleMarkers(validIds) {
  for (const [id, mk] of markers.entries()) {
    if (!validIds.has(id)) {
      map.removeLayer(mk);
      markers.delete(id);
    }
  }
}

// Rellenar tabla de ubicaciones
function renderTablaUbicaciones(sensores) {
  const tbody = document.querySelector('#cuerpo-tabla');
  if (!tbody) return;

  if (!Array.isArray(sensores) || sensores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Sin sensores registrados</td></tr>';
    return;
  }

  tbody.innerHTML = sensores.map(s => `
    <tr>
      <td>${s.nombre || s.sensor_id}</td>
      <td>${s.ubicacion || '—'}</td>
      <td>${s.lat != null ? Number(s.lat).toFixed(6) : '—'}</td>
      <td>${s.lng != null ? Number(s.lng).toFixed(6) : '—'}</td>
    </tr>
  `).join('');
}

// Rellenar selector para centrar en un sensor
function renderSelectorSensores(sensores) {
  const sel = document.getElementById('selectorSensor');
  if (!sel) return;

  const current = sel.value;
  sel.innerHTML = '<option value="">Seleccionar un sensor...</option>' +
    sensores.map(s => `
      <option value="${s.sensor_id}">
        ${s.nombre || s.sensor_id}
      </option>
    `).join('');

  // Mantener selección si sigue existiendo
  if (current && sensores.some(s => s.sensor_id === current)) {
    sel.value = current;
  }
}

async function cargarPromediosHoy() {
  const tbody = document.querySelector('#tabla-ambiental tbody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/sensores/promedios-hoy');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const sensores = await res.json();

    if (!Array.isArray(sensores) || sensores.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5">Sin datos para hoy</td></tr>';
      return;
    }

    tbody.innerHTML = sensores.map(s => `
      <tr>
        <td>${s.nombre || s.sensor_id}</td>
        <td>${s.temp_promedio_hoy != null ? s.temp_promedio_hoy.toFixed(1) : '--'}</td>
        <td>${s.humedad_promedio_hoy != null ? s.humedad_promedio_hoy.toFixed(1) : '--'}</td>
        <td>${s.calidad_promedio_hoy != null ? s.calidad_promedio_hoy.toFixed(0) : '--'}</td>
        <td>${s.lecturas_hoy}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error cargando promedios-hoy:', err);
    tbody.innerHTML = '<tr><td colspan="5">Error al cargar datos</td></tr>';
  }
}

async function refresh() {
  try {
    const sensores = await fetchSensores();
    const valid = new Set();

    sensores.forEach(s => {
      upsertMarker(s);
      valid.add(s.sensor_id);
    });
    dropStaleMarkers(valid);

    renderTablaUbicaciones(sensores);
    renderSelectorSensores(sensores);

    if (!refresh._fitted && sensores.some(s => s.lat != null && s.lng != null)) {
      const pts = sensores
        .filter(s => s.lat != null && s.lng != null)
        .map(s => [Number(s.lat), Number(s.lng)]);
      if (pts.length === 1) {
        map.setView(pts[0], 14);
      } else if (pts.length > 1) {
        map.fitBounds(pts, { padding: [30,30] });
      }
      refresh._fitted = true;
    }
  } catch (e) {
    console.error('Mapa: no se pudieron cargar sensores', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Iniciar mapa — centro en Mendoza, AR
  map = L.map('mapa', { zoomControl: true }).setView([-32.889458, -68.845839], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  cargarPromediosHoy();
  refresh();
  setInterval(refresh, 20000);

  // Cuando eligen un sensor del selector, centrar y abrir popup
  const sel = document.getElementById('selectorSensor');
  if (sel) {
    sel.addEventListener('change', () => {
      const id = sel.value;
      if (!id) return;
      const mk = markers.get(id);
      if (mk) {
        map.setView(mk.getLatLng(), 15);
        mk.openPopup();
      }
    });
  }
});
