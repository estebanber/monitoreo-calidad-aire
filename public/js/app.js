// Configuración de la aplicación
const API_BASE = '/api';
const INTERVALO_ACTUALIZACION = 5000; // 5 segundos

// Variables globales
let intervaloDatos = null;

// Inicializar aplicación
document.addEventListener('DOMContentLoaded', function() {
    console.log('🌱 Monitor de Calidad de Aire iniciado');
    iniciarActualizacionAutomatica();
    cargarDatosIniciales();
});

// Cargar datos iniciales
async function cargarDatosIniciales() {
    await cargarDatosActuales();
    await cargarEstadisticas();
    await cargarHistorial();
}

// Iniciar actualización automática
function iniciarActualizacionAutomatica() {
    intervaloDatos = setInterval(async () => {
        await cargarDatosActuales();
        await cargarEstadisticas();
    }, INTERVALO_ACTUALIZACION);
    
    console.log(`🔄 Actualización automática cada ${INTERVALO_ACTUALIZACION/1000} segundos`);
}

// Cargar datos actuales del sensor
async function cargarDatosActuales() {
    try {
        const response = await fetch(`${API_BASE}/datos/actual`);
        const data = await response.json();
        
        if (data.temperatura !== undefined) {
            actualizarInterfazDatos(data);
        } else {
            mostrarSinDatos();
        }
    } catch (error) {
        console.error('Error al cargar datos actuales:', error);
        mostrarErrorConexion();
    }
}

// Actualizar interfaz con nuevos datos
function actualizarInterfazDatos(data) {
    // Actualizar valores
    document.getElementById('temperatura').textContent = data.temperatura.toFixed(1);
    document.getElementById('humedad').textContent = data.humedad.toFixed(1);
    document.getElementById('calidad-aire').textContent = data.calidad_aire;
    
    // Actualizar estado de calidad de aire
    const estadoAire = obtenerEstadoAire(data.calidad_aire);
    const elementoEstado = document.getElementById('estado-aire');
    elementoEstado.textContent = estadoAire.texto;
    elementoEstado.className = `estado ${estadoAire.clase}`;
    
    // Actualizar timestamp
    const fecha = new Date(data.timestamp);
    document.getElementById('ultima-actualizacion').textContent = 
        fecha.toLocaleString('es-ES');
    
    console.log(`📊 Datos actualizados: ${data.temperatura}°C, ${data.humedad}%, ${data.calidad_aire}`);
}

// Determinar estado de calidad de aire
function obtenerEstadoAire(valor) {
    if (valor < 50) return { texto: 'Excelente', clase: 'aire-excelente' };
    if (valor < 100) return { texto: 'Bueno', clase: 'aire-bueno' };
    if (valor < 200) return { texto: 'Moderado', clase: 'aire-moderado' };
    if (valor < 300) return { texto: 'Malo', clase: 'aire-malo' };
    return { texto: 'Muy Malo', clase: 'aire-muy-malo' };
}

// Mostrar cuando no hay datos
function mostrarSinDatos() {
    document.getElementById('temperatura').textContent = '--';
    document.getElementById('humedad').textContent = '--';
    document.getElementById('calidad-aire').textContent = '--';
    document.getElementById('estado-aire').textContent = 'Sin datos';
    document.getElementById('ultima-actualizacion').textContent = 'No disponible';
}

// Mostrar error de conexión
function mostrarErrorConexion() {
    document.getElementById('ultima-actualizacion').textContent = 'Error de conexión';
    document.getElementById('ultima-actualizacion').style.color = '#e74c3c';
}

// Cargar estadísticas
async function cargarEstadisticas() {
    try {
        const response = await fetch(`${API_BASE}/estadisticas`);
        const stats = await response.json();
        
        document.getElementById('total-lecturas').textContent = stats.total_lecturas || 0;
        document.getElementById('temp-promedio').textContent = 
            stats.temp_promedio ? stats.temp_promedio.toFixed(1) : '--';
        document.getElementById('humedad-promedio').textContent = 
            stats.humedad_promedio ? stats.humedad_promedio.toFixed(1) : '--';
            
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}

// Cargar historial
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

// Actualizar tabla de historial
function actualizarTablaHistorial(datos) {
    const tbody = document.querySelector('#tabla-historial tbody');
    
    if (datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="cargando">No hay datos disponibles</td></tr>';
        return;
    }
    
    tbody.innerHTML = datos.map(registro => `
        <tr>
            <td>${new Date(registro.timestamp).toLocaleString('es-ES')}</td>
            <td>${registro.temperatura.toFixed(1)}°C</td>
            <td>${registro.humedad.toFixed(1)}%</td>
            <td>
                <span class="${obtenerEstadoAire(registro.calidad_aire).clase}">
                    ${registro.calidad_aire}
                </span>
            </td>
            <td>${registro.dispositivo_id}</td>
        </tr>
    `).join('');
}

// Mostrar error en tabla
function mostrarErrorTabla() {
    const tbody = document.querySelector('#tabla-historial tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="cargando">Error al cargar datos</td></tr>';
}

// Simulador para pruebas
async function enviarDatosPrueba() {
    const temperatura = parseFloat(document.getElementById('sim-temp').value);
    const humedad = parseFloat(document.getElementById('sim-humedad').value);
    const calidadAire = parseInt(document.getElementById('sim-aire').value);
    
    if (isNaN(temperatura) || isNaN(humedad) || isNaN(calidadAire)) {
        alert('Por favor, completa todos los campos con valores válidos');
        return;
    }
    
    const datos = {
        temperatura: temperatura,
        humedad: humedad,
        calidad_aire: calidadAire,
        dispositivo_id: 'SIMULADOR'
    };
    
    try {
        const response = await fetch(`${API_BASE}/datos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(datos)
        });
        
        const resultado = await response.json();
        
        if (resultado.success) {
            alert('✅ Datos enviados correctamente');
            // Limpiar formulario
            document.getElementById('sim-temp').value = '';
            document.getElementById('sim-humedad').value = '';
            document.getElementById('sim-aire').value = '';
            
            // Actualizar datos inmediatamente
            setTimeout(() => {
                cargarDatosActuales();
                cargarHistorial();
            }, 500);
        } else {
            alert('❌ Error al enviar datos: ' + resultado.error);
        }
        
    } catch (error) {
        console.error('Error al enviar datos:', error);
        alert('❌ Error de conexión al enviar datos');
    }
}

// Event listeners
document.getElementById('limite-registros').addEventListener('change', cargarHistorial);

// Limpiar intervalo al cerrar página
window.addEventListener('beforeunload', () => {
    if (intervaloDatos) {
        clearInterval(intervaloDatos);
    }
});