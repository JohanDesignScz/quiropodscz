// ================================================================
// QUIROPODSCZ v3 — Módulo Agenda (Calendario Visual)
// ================================================================
import { openM, closeM, toast, bs, fd, APP, SERVICIOS } from './app.js';
import { getCitasMes, getCitas, saveCita, deleteCita } from './db.js';

const MN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DN = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

let calYear, calMonth, selectedDate, citas = [], editandoCitaId = null;

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

  // Días del mes anterior
  for (let i = first - 1; i >= 0; i--) {
    const d = prevDays - i;
    html += `<div class="cal-cell other-month"><div class="cal-num">${d}</div></div>`;
  }

  // Días del mes
  for (let d = 1; d <= days; d++) {
    const dateStr = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayCitas = citas.filter(c => c.fecha === dateStr);
    const isToday = dateStr === today;
    const isSel   = dateStr === selectedDate;
    const evHtml  = dayCitas.slice(0,3).map(c =>
      `<div class="cal-event ${(c.estado||'').toLowerCase()}" title="${c.paciente_nombre}">${c.hora_inicio?.slice(0,5)} ${c.paciente_nombre}</div>`
    ).join('');
    const more = dayCitas.length > 3 ? `<div style="font-size:9px;color:var(--g500)">+${dayCitas.length-3} más</div>` : '';
    html += `<div class="cal-cell${isToday?' today':''}${isSel?' selected':''}" onclick="window._agendaSelectDay('${dateStr}')">
      <div class="cal-num${isToday?' today-num':''}">${d}</div>
      ${evHtml}${more}
    </div>`;
  }

  // Completar con días del siguiente mes
  const total = first + days;
  const rem   = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= rem; d++) {
    html += `<div class="cal-cell other-month"><div class="cal-num">${d}</div></div>`;
  }
  grid.innerHTML = html;
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

  if (!dayCitas.length) {
    panel.innerHTML = `<div class="empty">Sin citas para este día.<br><button class="btn btn-p btn-sm" style="margin-top:10px" onclick="window._nuevaCita('${dateStr}')">+ Agregar cita</button></div>`;
    return;
  }

  panel.innerHTML = `<ul class="agenda-list">
    ${dayCitas.map(c => `
      <li class="agenda-item">
        <div class="agenda-hora">${c.hora_inicio?.slice(0,5)||'—'}${c.hora_fin?'<br>'+c.hora_fin.slice(0,5):''}</div>
        <div class="agenda-body">
          <div class="agenda-pac">${c.paciente_nombre}</div>
          <div class="agenda-svc">${c.servicio||'—'} · ${c.zona||'—'}</div>
          ${c.notas ? `<div style="font-size:11px;color:var(--g500);margin-top:2px">${c.notas}</div>` : ''}
          <span class="badge ${estadoBadge(c.estado)}" style="margin-top:4px">${c.estado||'—'}</span>
        </div>
        <div class="agenda-actions">
          <button class="btn btn-gray btn-sm" onclick="window._editCita('${c.id}')">✎</button>
          <button class="btn btn-danger btn-sm" onclick="window._deleteCita('${c.id}')">✕</button>
        </div>
      </li>`).join('')}
  </ul>
  <div style="margin-top:12px"><button class="btn btn-p btn-sm" onclick="window._nuevaCita('${dateStr}')">+ Agregar cita</button></div>`;
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
export function nuevaCita(fecha) {
  editandoCitaId = null;
  const f = document.getElementById('cita-fecha');
  if (f) f.value = fecha || new Date().toISOString().slice(0,10);
  ['cita-hora-inicio','cita-hora-fin','cita-paciente','cita-zona','cita-dir','cita-notas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = el.tagName === 'SELECT' ? (id === 'cita-zona' ? 'Zona 1' : 'Confirmada') : '';
  });
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
  if (!paciente || !fecha || !hora) { toast('Paciente, fecha y hora de inicio son obligatorios', 'warn'); return; }
  const cita = {
    paciente_nombre: paciente,
    fecha,
    hora_inicio: hora,
    hora_fin:    document.getElementById('cita-hora-fin').value || null,
    servicio:    document.getElementById('cita-servicio').value || null,
    zona:        document.getElementById('cita-zona').value,
    direccion:   document.getElementById('cita-dir').value || null,
    estado:      document.getElementById('cita-estado').value,
    notas:       document.getElementById('cita-notas').value || null,
  };
  if (editandoCitaId) cita.id = editandoCitaId;
  try {
    await saveCita(cita);
    closeM('modal-cita');
    toast(editandoCitaId ? 'Cita actualizada' : 'Cita guardada');
    await loadCitas();
    renderCalendar();
    renderDayPanel(fecha);
  } catch(e) { toast('Error al guardar: ' + e.message, 'err'); }
}

export async function borrarCita(id) {
  if (!confirm('¿Eliminar esta cita?')) return;
  try {
    await deleteCita(id);
    toast('Cita eliminada');
    await loadCitas();
    renderCalendar();
    if (selectedDate) renderDayPanel(selectedDate);
  } catch(e) { toast('Error al eliminar', 'err'); }
}

// ── Exposición global para onclick en HTML ───────────────────────
window._agendaSelectDay = (d) => { selectedDate = d; renderCalendar(); renderDayPanel(d); };
window._nuevaCita       = (d) => nuevaCita(d);
window._editCita        = (id) => editCita(id);
window._deleteCita      = (id) => borrarCita(id);
