// Inicializar mapa
const mapa = L.map('mapa').setView([-34.6037, -58.3816], 12); // Buenos Aires como centro inicial

// Cargar tiles de OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(mapa);

// Elementos del DOM
const selector = document.getElementById('selectorSensor');

// 🔹 Simulación: lista de sensores con coordenadas (después podés traerlos del backend)
const sensores = [
  { id: "ESP001", lat: -34.601, lon: -58.381 },
  { id: "ESP002", lat: -34.607, lon: -58.385 },
  { id: "ESP003", lat: -34.611, lon: -58.377 }
];

// Cargar sensores al selector
sensores.forEach(s => {
  const option = document.createElement("option");
  option.value = s.id;
  option.textContent = s.id;
  selector.appendChild(option);
});

// Manejar selección
selector.addEventListener("change", () => {
  const id = selector.value;
  if (!id) return;

  const sensor = sensores.find(s => s.id === id);
  if (sensor) {
    mapa.setView([sensor.lat, sensor.lon], 15);
    L.marker([sensor.lat, sensor.lon])
      .addTo(mapa)
      .bindPopup(`<b>Sensor:</b> ${sensor.id}<br><b>Lat:</b> ${sensor.lat}<br><b>Lon:</b> ${sensor.lon}`)
      .openPopup();
  }
});
