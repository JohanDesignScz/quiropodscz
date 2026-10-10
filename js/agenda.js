// ================================================================
// QUIROPODSCZ v3 — Módulo Agenda (Calendario + vista por horas)
// ================================================================
import { openM, closeM, toast, bs, fd, APP, SERVICIOS, esc } from './app.js';
import { getCitasMes, getCitas, saveCita, deleteCita } from './db.js';
import { syncCitaGCal, eliminarEventoGCal } from './gcal.js';

const MN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DN = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

// Rango de horas visible en la vista del día (cámbialo a gusto)
const H_INI = 7;    // 07:00
const H_FIN = 21;   // hasta las 21:00
const DURACION_DEFECTO = 60; // minutos, si la cita no tiene hora de fin

let calYear, calMonth, selectedDate, citas = [], editandoCitaId = null;

// ── Helpers de hora ───────────────────────────────────────────────
function toMin(h) {
  const [a, b] = String(h || '0:0').split(':').map(Number);
  return a * 60 + (b || 0);
}
function finMin(c) {
  return c.hora_fin ? toMin(c.hora_fin) : toMin(c.hora_inicio) + DURACION_DEFECTO;
}
function hh(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

// Busca una cita activa del día que se cruce con el horario pedido
async function buscarCruce(fecha, horaIni, horaFin, ignorarId) {
  const delDia = await getCitas(fecha);
  const ini = toMin(horaIni);
  const fin = horaFin ? toMin(horaFin) : ini + DURACION_DEFECTO;
  return delDia.find(c =>
    c.id !== ignorarId && c.estado !== 'Cancelada' &&
    toMin(c.hora_inicio) < fin && ini < finMin(c)
  );
}

export async function renderAgenda() {
  const now = new Date();
  if (!calYear) { calYear = now.getFullYear(); calMonth = now.getMonth() + 1; }
  await loadCitas();
  renderCalendar();
  renderDayPanel(selectedDate || now.toISOString().slice(0, 10));
}

async function loadCitas() {
  try { citas = await getCitasMes(calYear, calMonth); } catch(e) { citas = []; }
}

function renderCalendar() {
  const hdr = document.getElementById('cal-month-hdr');
  if (hdr) hdr.textContent = `${MN[calMonth-1]} ${calYear}`;

  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  const first = new Date(calYear, calMonth-1, 1).getDay();
  const days  = new Date(calYear, calMonth, 0).getDate();
  const prevDays = new Date(calYear, calMonth-1, 0).getDate();
  const today = new Date().toISOString().slice(0,10);

  let html = DN.map(d => `<div class="cal-day-hdr">${d}</div>`).join('');

  for (let i = first - 1; i >= 0; i--) {
    const d = prevDays - i;
    html += `<div class="cal-cell other-month"><div class="cal-num">${d}</div></div>`;
  }

  for (let d = 1; d <= days; d++) {
    const dateStr = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayCitas = citas.filter(c => c.fecha === dateStr);
    const isToday = dateStr === today;
    const isSel   = dateStr === selectedDate;
    const evHtml  = dayCitas.slice(0,3).map(c =>
      `<div class="cal-event ${esc((c.estado||'').toLowerCase())}" title="${esc(c.paciente_nombre)}">${c.hora_inicio?.slice(0,5)} ${esc(c.paciente_nombre)}</div>`
    ).join('');
    const more = dayCitas.length > 3 ? `<div style="font-size:9px;color:var(--g500)">+${dayCitas.length-3} más</div>` : '';
    html += `<div class="cal-cell${isToday?' today':''}${isSel?' selected':''}" onclick="window._agendaSelectDay('${dateStr}')">
      <div class="cal-num${isToday?' today-num':''}">${d}</div>
      ${evHtml}${more}
    </div>`;
  }

  const total = first + days;
  const rem   = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= rem; d++) {
    html += `<div class="cal-cell other-month"><div class="cal-num">${d}</div></div>`;
  }
  grid.innerHTML = html;
}

// ── Vista del día por horas ───────────────────────────────────────
function cardCita(c) {
  const rango = `${c.hora_inicio?.slice(0,5) || ''}${c.hora_fin ? ' – ' + c.hora_fin.slice(0,5) : ''}`;
  const del = APP.rol === 'admin'
    ? `<button class="btn btn-danger btn-sm" onclick="window._deleteCita('${c.id}')">✕</button>` : '';
  return `<div class="slot-card">
    <div class="slot-body">
      <div class="agenda-pac">${esc(c.paciente_nombre)}
        <span style="font-weight:400;color:var(--g500);font-size:11px">${rango}</span></div>
      <div class="agenda-svc">${esc(c.servicio) || '—'} · ${esc(c.zona) || '—'}</div>
      ${c.notas ? `<div style="font-size:11px;color:var(--g500);margin-top:2px">${esc(c.notas)}</div>` : ''}
      <span class="badge ${estadoBadge(c.estado)}" style="margin-top:4px">${esc(c.estado) || '—'}</span>
    </div>
    <div class="agenda-actions">
      <button class="btn btn-gray btn-sm" onclick="window._editCita('${c.id}')">✎</button>${del}
    </div>
  </div>`;
}

async function renderDayPanel(dateStr) {
  selectedDate = dateStr;
  const panel = document.getElementById('agenda-day-panel');
  const dayTitle = document.getElementById('agenda-day-title');
  if (!panel) return;

  const [y, m, d] = dateStr.split('-').map(Number);
  dayTitle.textContent = `${d} de ${MN[m-1]} ${y}`;

  let dayCitas;
  try { dayCitas = await getCitas(dateStr); } catch(e) { dayCitas = []; }

  const activas    = dayCitas.filter(c => c.estado !== 'Cancelada');
  const canceladas = dayCitas.filter(c => c.estado === 'Cancelada');

  let html = '<div class="slot-list">';
  for (let h = H_INI; h < H_FIN; h++) {
    const ini = h * 60, fin = ini + 60;
    const empiezan = activas.filter(c => { const s = toMin(c.hora_inicio); return s >= ini && s < fin; });
    const ocupado  = activas.some(c => toMin(c.hora_inicio) < fin && finMin(c) > ini);
    let contenido;
    if (empiezan.length) {
      contenido = empiezan.map(cardCita).join('');
    } else if (ocupado) {
      contenido = `<div class="slot-busy">Ocupado (cita en curso)</div>`;
    } else {
      contenido = `<button class="slot-free" onclick="window._nuevaCita('${dateStr}','${hh(ini)}')">+ Libre · agendar a las ${hh(ini)}</button>`;
    }
    html += `<div class="slot-row"><div class="slot-hora">${hh(ini)}</div><div class="slot-content">${contenido}</div></div>`;
  }
  html += '</div>';

  const fuera = activas.filter(c => toMin(c.hora_inicio) < H_INI * 60 || toMin(c.hora_inicio) >= H_FIN * 60);
  if (fuera.length) {
    html += `<div class="card-title" style="margin-top:14px">Fuera del horario visible</div>` + fuera.map(cardCita).join('');
  }
  if (canceladas.length) {
    html += `<div class="card-title" style="margin-top:14px">Canceladas</div>` +
      canceladas.map(c => `<div class="slot-busy">${c.hora_inicio?.slice(0,5) || ''} · ${esc(c.paciente_nombre)}</div>`).join('');
  }
  html += `<div style="margin-top:12px"><button class="btn btn-p btn-sm" onclick="window._nuevaCita('${dateStr}')">+ Agregar cita</button></div>`;
  panel.innerHTML = html;
}

function estadoBadge(e) {
  return e === 'Confirmada' ? 'b-green' : e === 'Pendiente' ? 'b-amber' : e === 'Cancelada' ? 'b-gray' : 'b-teal';
}

// ── Navegación mes ────────────────────────────────────────────────
export function calPrev() {
  calMonth--;
  if (calMonth < 1) { calMonth = 12; calYear--; }
  loadCitas().then(() => renderCalendar());
}

export function calNext() {
  calMonth++;
  if (calMonth > 12) { calMonth = 1; calYear++; }
  loadCitas().then(() => renderCalendar());
}

// ── Nueva / editar cita ───────────────────────────────────────────
export function nuevaCita(fecha, hora) {
  editandoCitaId = null;
  const f = document.getElementById('cita-fecha');
  if (f) f.value = fecha || new Date().toISOString().slice(0,10);
  ['cita-hora-inicio','cita-hora-fin','cita-paciente','cita-zona','cita-dir','cita-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = el.tagName === 'SELECT' ? (id === 'cita-zona' ? 'Zona 1' : 'Confirmada') : '';
  });
  // Si viene de un espacio libre de la vista por horas, precargar inicio y fin (+1 h)
  if (hora) {
    document.getElementById('cita-hora-inicio').value = hora;
    document.getElementById('cita-hora-fin').value = hh(toMin(hora) + DURACION_DEFECTO);
  }
  const s = document.getElementById('cita-servicio');
  if (s) s.value = '';
  const st = document.getElementById('cita-estado');
  if (st) st.value = 'Confirmada';
  document.getElementById('modal-cita-title').textContent = 'Nueva cita';
  openM('modal-cita');
}

export async function editCita(id) {
  try {
    const { data, error } = await import('./supabase.js').then(m =>
      m.supabase.from('citas').select('*').eq('id', id).single()
    );
    if (error || !data) return;
    editandoCitaId = id;
    document.getElementById('cita-fecha').value = data.fecha || '';
    document.getElementById('cita-hora-inicio').value = data.hora_inicio || '';
    document.getElementById('cita-hora-fin').value = data.hora_fin || '';
    document.getElementById('cita-paciente').value = data.paciente_nombre || '';
    document.getElementById('cita-servicio').value = data.servicio || '';
    document.getElementById('cita-zona').value = data.zona || 'Zona 1';
    document.getElementById('cita-dir').value = data.direccion || '';
    document.getElementById('cita-estado').value = data.estado || 'Confirmada';
    document.getElementById('cita-notas').value = data.notas || '';
    document.getElementById('modal-cita-title').textContent = 'Editar cita';
    openM('modal-cita');
  } catch(e) { toast('Error al cargar cita', 'err'); }
}

export async function guardaCita() {
  const paciente = document.getElementById('cita-paciente').value.trim();
  const fecha    = document.getElementById('cita-fecha').value;
  const hora     = document.getElementById('cita-hora-inicio').value;
  const horaFin  = document.getElementById('cita-hora-fin').value || null;
  const estado   = document.getElementById('cita-estado').value;
  if (!paciente || !fecha || !hora) { toast('Paciente, fecha y hora de inicio son obligatorios', 'warn'); return; }
  if (horaFin && toMin(horaFin) <= toMin(hora)) { toast('La hora de fin debe ser posterior a la de inicio', 'warn'); return; }

  // Aviso inmediato si el horario ya está ocupado (la base de datos también lo bloquea)
  if (estado !== 'Cancelada') {
    try {
      const cruce = await buscarCruce(fecha, hora, horaFin, editandoCitaId);
      if (cruce) {
        toast(`Horario ocupado: ${cruce.hora_inicio.slice(0,5)} ${cruce.paciente_nombre}`, 'warn');
        return;
      }
    } catch(e) { /* si falla la consulta, el servidor igual protege */ }
  }

  const cita = {
    paciente_nombre: paciente,
    fecha,
    hora_inicio: hora,
    hora_fin:    horaFin,
    servicio:    document.getElementById('cita-servicio').value || null,
    zona:        document.getElementById('cita-zona').value,
    direccion:   document.getElementById('cita-dir').value || null,
    estado,
    notas:       document.getElementById('cita-notas').value || null,
  };
  if (editandoCitaId) cita.id = editandoCitaId;
  try {
    const saved = await saveCita(cita);
    closeM('modal-cita');
    toast(editandoCitaId ? 'Cita actualizada' : 'Cita guardada');
    await loadCitas();
    renderCalendar();
    renderDayPanel(fecha);
    syncCitaGCal(saved);
  } catch(e) {
    if (String(e.message).includes('CRUCE_HORARIO')) {
      toast('Ese horario acaba de ser ocupado por otra cita. Elegí otro horario.', 'warn');
    } else {
      toast('Error al guardar: ' + e.message, 'err');
    }
  }
}

export async function borrarCita(id) {
  if (!confirm('¿Eliminar esta cita?')) return;
  const c = citas.find(x => x.id === id);
  try {
    await deleteCita(id);
    eliminarEventoGCal(c?.gcal_event_id).catch(console.warn);
    toast('Cita eliminada');
    await loadCitas();
    renderCalendar();
    if (selectedDate) renderDayPanel(selectedDate);
  } catch(e) { toast('Error al eliminar', 'err'); }
}

// ── Exposición global para onclick en HTML ───────────────────────
window._agendaSelectDay = (d) => { selectedDate = d; renderCalendar(); renderDayPanel(d); };
window._nuevaCita       = (d, h) => nuevaCita(d, h);
window._editCita        = (id) => editCita(id);
window._deleteCita      = (id) => borrarCita(id);
