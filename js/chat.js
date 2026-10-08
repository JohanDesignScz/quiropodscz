// ================================================================
// QUIROPODSCZ v3 — Módulo Asistente IA (Chat) + Gastos inteligentes
// ================================================================
import { syncCitaGCal } from './gcal.js';   // arriba
import { WORKER_URL } from './supabase.js';
import { APP, toast, MN } from './app.js';
import { saveCita, getCitas, getPacientesNombres, saveEgreso, curMes } from './db.js';

// ── Estado ────────────────────────────────────────────────────
let mensajes    = [];
let pendingCita  = null;
let pendingEgreso = null;
let isTyping    = false;

// ── Gastos frecuentes (tap rápido) ────────────────────────────
const GASTOS_RAPIDOS = [
  { icon:'⛽', label:'Gasolina',       categoria:'Gasolina',          monto:300 },
  { icon:'📢', label:'Publicidad FB',  categoria:'Publicidad',        monto:175 },
  { icon:'🧤', label:'Insumos clínic.',categoria:'Insumos clínicos',  monto:150 },
  { icon:'🚗', label:'Transporte',     categoria:'Otros',             monto:50  },
  { icon:'💊', label:'Insumos espec.', categoria:'Insumos especiales',monto:null },
  { icon:'🔧', label:'Equipamiento',   categoria:'Equipamiento',      monto:null },
];

// ── System prompt ─────────────────────────────────────────────
function buildSystemPrompt(ctx) {
  const hoy  = new Date().toLocaleDateString('es-BO',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const hora = new Date().toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'});
  return `Sos el asistente IA de QUIROPODSCZ, clínica de podología móvil del Pod. Erik Quiroz en Santa Cruz de la Sierra, Bolivia.

FECHA Y HORA: ${hoy}, ${hora}
MES ACTUAL: ${curMes()}

SERVICIOS Y PRECIOS:
Quiropedia Bs.85 · Pie diabético Bs.170 · Podogeriatría Bs.170 · Uñero 1 pie Bs.170 · Uñero 2 pies Bs.260 · Uñero+anestesia Bs.300 · Matricectomía desde Bs.700 · Hongos Bs.120 · Callosidades Bs.80 · Valoración Bs.80 · Reflexología Bs.85 · Podopediatría Bs.130
Transporte: Zona 1 Bs.30 · Zona 2 Bs.50

COSTOS FIJOS MENSUALES: Gasolina Bs.1.200 · Publicidad Bs.175 · Total Bs.1.375
COSTO VARIABLE/PACIENTE: Bs.30

PACIENTES REGISTRADOS: ${ctx.pacientes || 'Ninguno aún'}
CITAS DE HOY: ${ctx.citasHoy || 'Sin citas'}
EGRESOS DE ESTE MES: ${ctx.egresos || 'Sin egresos registrados'}

CAPACIDADES:
1. AGENDAR CITAS — extraé datos y emitís CITA_JSON
2. REGISTRAR GASTOS — extraé datos y emitís EGRESO_JSON  
3. CONSULTAR AGENDA — informás citas del día/semana
4. RESPONDER PREGUNTAS — precios, servicios, finanzas

━━ PARA CREAR UNA CITA ━━
Cuando tenés TODOS los datos (paciente, fecha, hora) confirmados, incluí al final:
<CITA_JSON>
{"paciente_nombre":"...","fecha":"YYYY-MM-DD","hora_inicio":"HH:MM","hora_fin":"HH:MM","servicio":"...","zona":"Zona 1","direccion":"...","estado":"Confirmada","notas":"..."}
</CITA_JSON>

━━ PARA REGISTRAR UN GASTO ━━
Cuando el usuario mencione un gasto (gasolina, publicidad, insumos, etc.) y confirme el monto, incluí al final:
<EGRESO_JSON>
{"categoria":"Gasolina","descripcion":"...","monto":300,"fecha":"YYYY-MM-DD","mes":"YYYY-MM"}
</EGRESO_JSON>

Categorías válidas: Gasolina · Publicidad · Insumos clínicos · Insumos especiales · Equipamiento · Otros

Si el usuario dice "cargá gasolina" sin monto, preguntá cuánto. Si dice "cargá gasolina de Bs.300", confirmá y emití el JSON.
Siempre mostrá los datos del gasto antes de emitir el JSON para que el usuario confirme.

REGLAS GENERALES:
- Nunca emitas dos JSONs en el mismo mensaje
- Si falta info esencial, preguntá antes de emitir JSON
- Interpretá lenguaje natural: "mañana", "el lunes", "gastamos en publicidad"
- Tono amigable, profesional, español rioplatense (vos/usás). Máximo 3 párrafos.`;
}

// ── Contexto dinámico ─────────────────────────────────────────
async function buildContext() {
  const hoy = new Date().toISOString().slice(0,10);
  const mes  = curMes();
  let pacientes = 'Ninguno', citasHoy = 'Sin citas', egresos = 'Sin egresos';
  try {
    const [pacs, citas, egs] = await Promise.all([
      getPacientesNombres(),
      getCitas(hoy),
      import('./db.js').then(m => m.getEgresos(mes)),
    ]);
    if (pacs.length)  pacientes = pacs.slice(0,20).map(p=>p.paciente_nombre).join(', ');
    if (citas.length) citasHoy  = citas.map(c=>`${c.hora_inicio?.slice(0,5)} ${c.paciente_nombre} (${c.servicio||'—'})`).join(' | ');
    if (egs.length)   egresos   = egs.map(e=>`${e.categoria} Bs.${e.monto}`).join(' · ');
  } catch(e){}
  return { pacientes, citasHoy, egresos };
}

// ── Parsear respuesta ─────────────────────────────────────────
function parseRespuesta(texto) {
  // Cita
  const mc = texto.match(/<CITA_JSON>([\s\S]*?)<\/CITA_JSON>/);
  if (mc) {
    try {
      const cita = JSON.parse(mc[1].trim());
      return { texto: texto.replace(/<CITA_JSON>[\s\S]*?<\/CITA_JSON>/,'').trim(), cita, egreso:null };
    } catch(e){}
  }
  // Egreso
  const me = texto.match(/<EGRESO_JSON>([\s\S]*?)<\/EGRESO_JSON>/);
  if (me) {
    try {
      const egreso = JSON.parse(me[1].trim());
      return { texto: texto.replace(/<EGRESO_JSON>[\s\S]*?<\/EGRESO_JSON>/,'').trim(), cita:null, egreso };
    } catch(e){}
  }
  return { texto, cita:null, egreso:null };
}

// ── Llamar Worker ─────────────────────────────────────────────
async function llamarIA(ctx) {
  const workerUrl = APP.config?.workerUrl || WORKER_URL;
  const system    = buildSystemPrompt(ctx);
  const historial = mensajes.map(m=>`${m.role==='user'?'Usuario':'Asistente'}: ${m.content}`).join('\n\n');
  const prompt    = `${system}\n\n---\nCONVERSACIÓN:\n${historial}\n\nAsistente:`;
  const resp = await fetch(workerUrl,{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ prompt })
  });
  if(!resp.ok) throw new Error(`Worker error ${resp.status}`);
  const data = await resp.json();
  return data.content?.[0]?.text || data.result || 'Sin respuesta.';
}

// ── Render principal ──────────────────────────────────────────
export function renderChat() {
  const wrap = document.getElementById('chat-messages');
  if (!wrap) return;

  if (!mensajes.length) { mostrarBienvenida(); return; }

  wrap.innerHTML = mensajes.map((m, i) => {
    if (m.role === 'user') {
      return `<div class="msg msg-user"><div class="msg-bubble msg-bubble-user">${escHtml(m.content)}</div></div>`;
    }
    const { texto, cita, egreso } = parseRespuesta(m.content);
    const isLast = i === mensajes.length - 1;
    let card = '';
    if (isLast && pendingCita)   card = buildCitaCard(pendingCita);
    if (isLast && pendingEgreso) card = buildEgresoCard(pendingEgreso);
    return `<div class="msg msg-ai">
      <div class="msg-avatar">🤖</div>
      <div class="msg-body">
        <div class="msg-bubble msg-bubble-ai">${formatTexto(texto)}</div>
        ${card}
      </div>
    </div>`;
  }).join('');

  if (isTyping) {
    wrap.innerHTML += `<div class="msg msg-ai">
      <div class="msg-avatar">🤖</div>
      <div class="msg-body"><div class="msg-bubble msg-bubble-ai typing-indicator"><span></span><span></span><span></span></div></div>
    </div>`;
  }
  wrap.scrollTop = wrap.scrollHeight;
}

// ── Cards de confirmación ─────────────────────────────────────
function buildCitaCard(c) {
  return `<div class="cita-confirm-card">
    <div class="cita-confirm-title">📅 Cita por confirmar</div>
    <div class="cita-confirm-row"><span>Paciente</span><strong>${c.paciente_nombre||'—'}</strong></div>
    <div class="cita-confirm-row"><span>Fecha</span><strong>${fechaLegible(c.fecha)}</strong></div>
    <div class="cita-confirm-row"><span>Hora</span><strong>${c.hora_inicio||'—'}${c.hora_fin?' → '+c.hora_fin:''}</strong></div>
    <div class="cita-confirm-row"><span>Servicio</span><strong>${c.servicio||'—'}</strong></div>
    <div class="cita-confirm-row"><span>Zona</span><strong>${c.zona||'Zona 1'}</strong></div>
    ${c.direccion?`<div class="cita-confirm-row"><span>Dirección</span><strong>${c.direccion}</strong></div>`:''}
    ${c.notas?`<div class="cita-confirm-row"><span>Notas</span><strong>${c.notas}</strong></div>`:''}
    <div class="cita-confirm-actions">
      <button class="btn-confirm-ok" onclick="window._confirmarCita()">✓ Confirmar y guardar</button>
      <button class="btn-confirm-no" onclick="window._rechazarCita()">✕ Cancelar</button>
    </div>
  </div>`;
}

function buildEgresoCard(e) {
  return `<div class="cita-confirm-card" style="border-color:var(--amber);background:linear-gradient(135deg,var(--amberBg),#fff)">
    <div class="cita-confirm-title" style="color:#854F0B">💸 Gasto por confirmar</div>
    <div class="cita-confirm-row"><span>Categoría</span><strong>${e.categoria||'—'}</strong></div>
    <div class="cita-confirm-row"><span>Descripción</span><strong>${e.descripcion||'—'}</strong></div>
    <div class="cita-confirm-row"><span>Monto</span><strong style="color:var(--red);font-size:16px">Bs. ${Number(e.monto||0).toLocaleString('es-BO')}</strong></div>
    <div class="cita-confirm-row"><span>Fecha</span><strong>${fechaLegible(e.fecha)}</strong></div>
    <div class="cita-confirm-row"><span>Mes</span><strong>${e.mes||curMes()}</strong></div>
    <div class="cita-confirm-actions">
      <button class="btn-confirm-ok" style="background:var(--amber)" onclick="window._confirmarEgreso()">✓ Guardar gasto</button>
      <button class="btn-confirm-no" onclick="window._rechazarEgreso()">✕ Cancelar</button>
    </div>
  </div>`;
}

// ── Enviar mensaje ────────────────────────────────────────────
export async function enviarMensaje() {
  const input = document.getElementById('chat-input');
  const texto = input?.value?.trim();
  if (!texto || isTyping) return;
  input.value = ''; input.style.height = 'auto';

  // Ocultar gastos rápidos al empezar a chatear
  const gr = document.getElementById('gastos-rapidos-panel');
  if (gr) gr.style.display = 'none';

  mensajes.push({ role:'user', content:texto });
  isTyping = true; pendingCita = null; pendingEgreso = null;
  renderChat();

  try {
    const ctx  = await buildContext();
    const resp = await llamarIA(ctx);
    const { cita, egreso } = parseRespuesta(resp);
    if (cita)   pendingCita   = cita;
    if (egreso) pendingEgreso = egreso;
    mensajes.push({ role:'assistant', content:resp });
  } catch(e) {
    mensajes.push({ role:'assistant', content:`Error al conectar con la IA: ${e.message}. Verificá la URL del Worker en ⚙ Configuración.` });
  }
  isTyping = false; renderChat();
}

// ── Confirmar / rechazar cita ─────────────────────────────────
window._confirmarCita = async function() {
  if (!pendingCita) return;
  try {
    const saved = await saveCita(pendingCita);
    const pac = pendingCita.paciente_nombre;
    pendingCita = null;
    mensajes.push({ role:'assistant', content:`✅ ¡Cita de **${pac}** guardada correctamente! Podés verla en la **Agenda**. ¿Necesitás algo más?` });
    toast('Cita guardada desde el Asistente IA ✓');
    syncCitaGCal(saved);
  } catch(e) { toast('Error al guardar la cita: '+e.message,'err'); }
  renderChat();
};

window._rechazarCita = function() {
  pendingCita = null;
  mensajes.push({ role:'assistant', content:`Entendido, la cita no fue guardada. ¿Querés modificar algo?` });
  renderChat();
};

// ── Confirmar / rechazar egreso ───────────────────────────────
window._confirmarEgreso = async function() {
  if (!pendingEgreso) return;
  try {
    const eg = {
      ...pendingEgreso,
      fecha: pendingEgreso.fecha || new Date().toISOString().slice(0,10),
      mes:   pendingEgreso.mes   || curMes(),
    };
    await saveEgreso(eg);
    const desc = eg.descripcion || eg.categoria;
    pendingEgreso = null;
    mensajes.push({ role:'assistant', content:`✅ Gasto de **${desc}** (Bs. ${eg.monto}) guardado en Egresos. ¿Necesitás registrar algo más?` });
    toast('Gasto guardado desde el Asistente IA ✓');
  } catch(e) { toast('Error al guardar el gasto: '+e.message,'err'); }
  renderChat();
};

window._rechazarEgreso = function() {
  pendingEgreso = null;
  mensajes.push({ role:'assistant', content:`Entendido, el gasto no fue guardado. ¿Necesitás ajustar el monto o la categoría?` });
  renderChat();
};

// ── Gastos rápidos (tap) ──────────────────────────────────────
export function renderGastosRapidos() {
  const panel = document.getElementById('gastos-rapidos-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="gr-title">⚡ Gastos frecuentes</div>
    <div class="gr-grid">
      ${GASTOS_RAPIDOS.map((g,i) => `
        <button class="gr-btn" onclick="window._tapGasto(${i})">
          <span class="gr-icon">${g.icon}</span>
          <span class="gr-label">${g.label}</span>
          ${g.monto ? `<span class="gr-monto">Bs.${g.monto}</span>` : '<span class="gr-monto" style="color:var(--g300)">Variable</span>'}
        </button>`).join('')}
    </div>`;
}

window._tapGasto = function(idx) {
  const g = GASTOS_RAPIDOS[idx];
  if (!g) return;
  const input = document.getElementById('chat-input');
  if (!input) return;
  if (g.monto) {
    input.value = `Registrá un gasto de ${g.label.toLowerCase()} de Bs.${g.monto} de hoy`;
  } else {
    input.value = `Registrá un gasto de ${g.label.toLowerCase()} de `;
    input.focus();
    // Posicionar cursor al final para que escriba el monto
    input.setSelectionRange(input.value.length, input.value.length);
    return;
  }
  input.focus();
};

// ── Bienvenida ────────────────────────────────────────────────
export function mostrarBienvenida() {
  const wrap = document.getElementById('chat-messages');
  if (!wrap) return;
  const hoy = new Date().toLocaleDateString('es-BO',{weekday:'long',day:'numeric',month:'long'});
  wrap.innerHTML = `
    <div class="chat-bienvenida">
      <div class="chat-bienvenida-icon">🤖</div>
      <div class="chat-bienvenida-title">Asistente QUIROPODSCZ</div>
      <div class="chat-bienvenida-sub">Hoy es ${hoy}. ¿En qué puedo ayudarte?</div>
      <div class="sugerencias">
        <button class="sug-btn" onclick="window._usarSugerencia('¿Qué citas tengo hoy?')">📅 Ver citas de hoy</button>
        <button class="sug-btn" onclick="window._usarSugerencia('Agendá a ')">➕ Nueva cita</button>
        <button class="sug-btn" onclick="window._usarSugerencia('Registrá un gasto de gasolina de Bs.')">⛽ Cargar gasto</button>
        <button class="sug-btn" onclick="window._usarSugerencia('¿Cuánto gasté este mes?')">📊 Ver gastos del mes</button>
        <button class="sug-btn" onclick="window._usarSugerencia('¿Cuánto cuesta el pie diabético?')">💰 Consultar precio</button>
        <button class="sug-btn" onclick="window._usarSugerencia('Buscá al paciente ')">🔍 Buscar paciente</button>
      </div>
    </div>`;
  renderGastosRapidos();
  const gr = document.getElementById('gastos-rapidos-panel');
  if (gr) gr.style.display = 'block';
}

// ── Limpiar chat ──────────────────────────────────────────────
export function limpiarChat() {
  if (!confirm('¿Borrar el historial del chat?')) return;
  mensajes = []; pendingCita = null; pendingEgreso = null;
  mostrarBienvenida();
}

// ── Sugerencia rápida ─────────────────────────────────────────
export function usarSugerencia(texto) {
  const input = document.getElementById('chat-input');
  if (input) { input.value = texto; input.focus(); input.setSelectionRange(texto.length,texto.length); }
  const gr = document.getElementById('gastos-rapidos-panel');
  if (gr) gr.style.display = 'none';
}

// ── Helpers ───────────────────────────────────────────────────
function fechaLegible(d) {
  if (!d) return '—';
  const [y,m,dd] = d.split('-').map(Number);
  const dias=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const date = new Date(y,m-1,dd);
  return `${dias[date.getDay()]} ${dd} de ${MN[m-1]} ${y}`;
}

function formatTexto(t) {
  return escHtml(t)
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.*?)\*/g,'<em>$1</em>')
    .replace(/\n/g,'<br>');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Exposición global ─────────────────────────────────────────
window._usarSugerencia = usarSugerencia;
window._enviarMensaje  = enviarMensaje;
window._limpiarChat    = limpiarChat;
