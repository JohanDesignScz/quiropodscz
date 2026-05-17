// ================================================================
// QUIROPODSCZ v3 — Módulo Asistente IA (Chat)
// ================================================================
import { WORKER_URL } from './supabase.js';
import { APP, toast, bs, fd, MN, SERVICIOS } from './app.js';
import { saveCita, getCitas, getHistorias, getConsultas, getPacientesNombres } from './db.js';

// ── Estado del chat ───────────────────────────────────────────
let mensajes = []; // historial { role, content }
let pendingCita = null; // cita extraída esperando confirmación
let isTyping = false;

// ── Sistema prompt para la IA ─────────────────────────────────
function buildSystemPrompt(context) {
  const hoy = new Date().toLocaleDateString('es-BO', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const hora = new Date().toLocaleTimeString('es-BO', { hour:'2-digit', minute:'2-digit' });
  return `Sos el asistente IA de QUIROPODSCZ, la clínica de podología móvil del Pod. Erik Quiroz en Santa Cruz de la Sierra, Bolivia.

FECHA Y HORA ACTUAL: ${hoy}, ${hora}

DATOS DEL NEGOCIO:
- Moneda: Bolivianos (Bs.)
- Servicios: Quiropedia Bs.85, Pie diabético Bs.170, Podogeriatría Bs.170, Uñero 1 pie Bs.170, Uñero 2 pies Bs.260, Uñero+anestesia Bs.300, Matricectomía desde Bs.700, Hongos Bs.120, Callosidades Bs.80, Valoración Bs.80, Reflexología Bs.85, Podopediatría Bs.130
- Zonas: Zona 1 (dentro 4to anillo) transporte Bs.30 — Zona 2 (fuera) transporte Bs.50
- Horario: Lunes a Sábado 8am–7pm
- WhatsApp: +591 62458126

PACIENTES REGISTRADOS EN EL SISTEMA:
${context.pacientes || 'Ninguno aún'}

CITAS DE HOY:
${context.citasHoy || 'Sin citas programadas para hoy'}

TUS CAPACIDADES:
1. AGENDAR CITAS: Cuando el usuario pida agendar una cita, extraé los datos y respondé con un JSON especial al final de tu mensaje.
2. CONSULTAR AGENDA: Podés informar sobre las citas del día o próximas.
3. CONSULTAR PACIENTES: Podés buscar información de pacientes registrados.
4. RESPONDER PREGUNTAS: Sobre precios, servicios, zonas, etc.

REGLAS PARA AGENDAR CITAS:
- Siempre confirmá los datos antes de guardar
- Si falta algún dato esencial (paciente, fecha, hora), preguntá
- Interpretá lenguaje natural: "mañana", "el lunes", "a las 10", etc.
- Formato fecha: YYYY-MM-DD, formato hora: HH:MM

CUANDO QUERÉS CREAR UNA CITA, al final de tu mensaje incluí este bloque EXACTO (sin texto después):
<CITA_JSON>
{"paciente_nombre":"...","fecha":"YYYY-MM-DD","hora_inicio":"HH:MM","hora_fin":"HH:MM","servicio":"...","zona":"Zona 1","direccion":"...","estado":"Confirmada","notas":"..."}
</CITA_JSON>

Solo incluí el JSON cuando ya tenés TODOS los datos necesarios confirmados. Si falta info, preguntá primero.

TONO: Amigable, profesional, conciso. Respondé en español rioplatense (vos, usás). Máximo 3 párrafos por respuesta.`;
}

// ── Contexto dinámico ─────────────────────────────────────────
async function buildContext() {
  const hoy = new Date().toISOString().slice(0, 10);
  let pacientes = 'No hay pacientes aún';
  let citasHoy  = 'Sin citas hoy';
  try {
    const pacs = await getPacientesNombres();
    if (pacs.length) pacientes = pacs.slice(0, 20).map(p => p.paciente_nombre).join(', ');
    const citas = await getCitas(hoy);
    if (citas.length) citasHoy = citas.map(c =>
      `${c.hora_inicio?.slice(0,5)} — ${c.paciente_nombre} (${c.servicio || 'sin servicio'}) ${c.zona || ''}`
    ).join('\n');
  } catch(e) {}
  return { pacientes, citasHoy };
}

// ── Parsear respuesta IA ──────────────────────────────────────
function parseRespuesta(texto) {
  const match = texto.match(/<CITA_JSON>([\s\S]*?)<\/CITA_JSON>/);
  if (!match) return { texto, cita: null };
  try {
    const cita = JSON.parse(match[1].trim());
    const textoLimpio = texto.replace(/<CITA_JSON>[\s\S]*?<\/CITA_JSON>/, '').trim();
    return { texto: textoLimpio, cita };
  } catch(e) {
    return { texto, cita: null };
  }
}

// ── Llamar al Worker ──────────────────────────────────────────
async function llamarIA(context) {
  const workerUrl = APP.config?.workerUrl || WORKER_URL;
  const systemPrompt = buildSystemPrompt(context);

  // Construir prompt completo compatible con el Worker existente
  const historial = mensajes.map(m =>
    `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`
  ).join('\n\n');

  const promptCompleto = `${systemPrompt}\n\n---\nCONVERSACIÓN:\n${historial}\n\nAsistente:`;

  const resp = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: promptCompleto })
  });
  if (!resp.ok) throw new Error(`Worker error ${resp.status}`);
  const data = await resp.json();
  return data.content?.[0]?.text || data.result || 'No pude procesar la respuesta.';
}

// ── Formatear fecha legible ───────────────────────────────────
function fechaLegible(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const date = new Date(y, m-1, d);
  return `${dias[date.getDay()]} ${d} de ${MN[m-1]} ${y}`;
}

// ── Render del chat ───────────────────────────────────────────
export function renderChat() {
  const wrap = document.getElementById('chat-messages');
  if (!wrap) return;
  wrap.innerHTML = mensajes.map((m, i) => {
    if (m.role === 'user') {
      return `<div class="msg msg-user"><div class="msg-bubble msg-bubble-user">${escHtml(m.content)}</div></div>`;
    }
    // Asistente
    const { texto, cita } = parseRespuesta(m.content);
    let citaCard = '';
    if (cita && i === mensajes.length - 1 && pendingCita) {
      citaCard = buildCitaCard(cita);
    }
    return `<div class="msg msg-ai">
      <div class="msg-avatar">🤖</div>
      <div class="msg-body">
        <div class="msg-bubble msg-bubble-ai">${formatTexto(texto)}</div>
        ${citaCard}
      </div>
    </div>`;
  }).join('');

  // Typing indicator
  if (isTyping) {
    wrap.innerHTML += `<div class="msg msg-ai">
      <div class="msg-avatar">🤖</div>
      <div class="msg-body"><div class="msg-bubble msg-bubble-ai typing-indicator"><span></span><span></span><span></span></div></div>
    </div>`;
  }
  wrap.scrollTop = wrap.scrollHeight;
}

function buildCitaCard(cita) {
  return `<div class="cita-confirm-card">
    <div class="cita-confirm-title">📅 Cita por confirmar</div>
    <div class="cita-confirm-row"><span>Paciente</span><strong>${cita.paciente_nombre || '—'}</strong></div>
    <div class="cita-confirm-row"><span>Fecha</span><strong>${fechaLegible(cita.fecha)}</strong></div>
    <div class="cita-confirm-row"><span>Hora</span><strong>${cita.hora_inicio || '—'}${cita.hora_fin ? ' → ' + cita.hora_fin : ''}</strong></div>
    <div class="cita-confirm-row"><span>Servicio</span><strong>${cita.servicio || '—'}</strong></div>
    <div class="cita-confirm-row"><span>Zona</span><strong>${cita.zona || 'Zona 1'}</strong></div>
    ${cita.direccion ? `<div class="cita-confirm-row"><span>Dirección</span><strong>${cita.direccion}</strong></div>` : ''}
    ${cita.notas ? `<div class="cita-confirm-row"><span>Notas</span><strong>${cita.notas}</strong></div>` : ''}
    <div class="cita-confirm-actions">
      <button class="btn-confirm-ok" onclick="window._confirmarCita()">✓ Confirmar y guardar</button>
      <button class="btn-confirm-no" onclick="window._rechazarCita()">✕ Cancelar</button>
    </div>
  </div>`;
}

function formatTexto(texto) {
  return escHtml(texto)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Enviar mensaje ────────────────────────────────────────────
export async function enviarMensaje() {
  const input = document.getElementById('chat-input');
  const texto = input?.value?.trim();
  if (!texto || isTyping) return;
  input.value = '';
  input.style.height = 'auto';

  mensajes.push({ role: 'user', content: texto });
  isTyping = true;
  renderChat();

  try {
    const context = await buildContext();
    const respuesta = await llamarIA(context);
    const { texto: textoLimpio, cita } = parseRespuesta(respuesta);

    mensajes.push({ role: 'assistant', content: respuesta });
    if (cita) pendingCita = cita;
    else pendingCita = null;
  } catch(e) {
    mensajes.push({ role: 'assistant', content: `Ocurrió un error al conectar con la IA: ${e.message}. Verificá la URL del Worker en Configuración ⚙` });
    pendingCita = null;
  }

  isTyping = false;
  renderChat();
}

// ── Confirmar / rechazar cita ─────────────────────────────────
window._confirmarCita = async function() {
  if (!pendingCita) return;
  try {
    await saveCita(pendingCita);
    pendingCita = null;
    mensajes.push({ role: 'assistant', content: `✅ ¡Cita guardada correctamente! Podés verla en la **Agenda**. ¿Necesitás hacer algo más?` });
    toast('Cita guardada desde el Asistente IA ✓');
    renderChat();
  } catch(e) {
    toast('Error al guardar la cita: ' + e.message, 'err');
  }
};

window._rechazarCita = function() {
  pendingCita = null;
  mensajes.push({ role: 'assistant', content: `Entendido, la cita no fue guardada. ¿Querés modificar algo o agendar otra?` });
  renderChat();
};

// ── Limpiar chat ──────────────────────────────────────────────
export function limpiarChat() {
  if (!confirm('¿Borrar el historial del chat?')) return;
  mensajes = [];
  pendingCita = null;
  renderChat();
  mostrarBienvenida();
}

// ── Sugerencias rápidas ───────────────────────────────────────
export function usarSugerencia(texto) {
  const input = document.getElementById('chat-input');
  if (input) { input.value = texto; input.focus(); }
}

// ── Mensaje de bienvenida ─────────────────────────────────────
export function mostrarBienvenida() {
  const wrap = document.getElementById('chat-messages');
  if (!wrap) return;
  const hoy = new Date().toLocaleDateString('es-BO', { weekday:'long', day:'numeric', month:'long' });
  wrap.innerHTML = `
    <div class="chat-bienvenida">
      <div class="chat-bienvenida-icon">🤖</div>
      <div class="chat-bienvenida-title">Asistente QUIROPODSCZ</div>
      <div class="chat-bienvenida-sub">Hoy es ${hoy}. ¿En qué puedo ayudarte?</div>
      <div class="sugerencias">
        <button class="sug-btn" onclick="window._usarSugerencia('¿Qué citas tengo hoy?')">📅 Ver citas de hoy</button>
        <button class="sug-btn" onclick="window._usarSugerencia('Agendá a ')">➕ Nueva cita</button>
        <button class="sug-btn" onclick="window._usarSugerencia('¿Cuánto cuesta el tratamiento de pie diabético?')">💰 Consultar precio</button>
        <button class="sug-btn" onclick="window._usarSugerencia('Buscá al paciente ')">🔍 Buscar paciente</button>
        <button class="sug-btn" onclick="window._usarSugerencia('Cancelá la cita de ')">❌ Cancelar cita</button>
        <button class="sug-btn" onclick="window._usarSugerencia('¿Cuál es el servicio más rentable?')">📊 Consulta financiera</button>
      </div>
    </div>`;
}

// ── Exposición global ─────────────────────────────────────────
window._usarSugerencia = usarSugerencia;
window._enviarMensaje  = enviarMensaje;
window._limpiarChat    = limpiarChat;
