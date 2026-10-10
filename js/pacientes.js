// ================================================================
// QUIROPODSCZ v3 — Módulo Pacientes (datos básicos, sin clínica)
// ================================================================
import { toast, openM, closeM, esc } from './app.js';
import { getPacientes, savePaciente } from './db.js';

let lista = [];
let editId = null;

export async function renderPacientes() {
  const q    = document.getElementById('pac-buscar')?.value || '';
  const wrap = document.getElementById('pac-wrap');
  if (!wrap) return;
  try {
    lista = await getPacientes(q);
    document.getElementById('pac-count').textContent =
      `${lista.length} paciente${lista.length !== 1 ? 's' : ''}`;
    if (!lista.length) {
      wrap.innerHTML = `<div class="empty">${q ? 'Sin resultados para "' + esc(q) + '"' : 'Sin pacientes. Presioná "+ Nuevo paciente".'}</div>`;
      return;
    }
    wrap.innerHTML = `<div class="scroll"><table class="tbl">
      <thead><tr><th>Paciente</th><th>Teléfono</th><th>CI</th><th>Zona</th><th>Dirección</th><th></th></tr></thead>
      <tbody>${lista.map(p => `<tr>
        <td class="fw6">${esc(p.nombre)}</td>
        <td>${esc(p.telefono) || '—'}</td>
        <td>${esc(p.ci) || '—'}</td>
        <td>${esc(p.zona) || '—'}</td>
        <td style="font-size:12px;max-width:200px">${esc(p.direccion) || '—'}</td>
        <td><button class="btn btn-gray btn-sm" onclick="window._editarPaciente('${p.id}')">Editar</button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

export function nuevoPaciente() {
  editId = null;
  ['pac-nombre', 'pac-tel', 'pac-ci', 'pac-dir', 'pac-notas'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('pac-zona').value = 'Zona 1';
  document.getElementById('modal-pac-title').textContent = 'Nuevo paciente';
  openM('modal-pac');
}

export function editarPaciente(id) {
  const p = lista.find(x => x.id === id);
  if (!p) return;
  editId = id;
  document.getElementById('pac-nombre').value = p.nombre || '';
  document.getElementById('pac-tel').value    = p.telefono || '';
  document.getElementById('pac-ci').value     = p.ci || '';
  document.getElementById('pac-zona').value   = p.zona || 'Zona 1';
  document.getElementById('pac-dir').value    = p.direccion || '';
  document.getElementById('pac-notas').value  = p.notas || '';
  document.getElementById('modal-pac-title').textContent = 'Editar paciente';
  openM('modal-pac');
}

export async function guardarPaciente() {
  const nombre = document.getElementById('pac-nombre').value.trim();
  if (!nombre) { toast('El nombre es obligatorio', 'warn'); return; }

  if (!editId && lista.some(x => (x.nombre || '').toLowerCase() === nombre.toLowerCase())) {
    if (!confirm('Ya existe un paciente con ese nombre. ¿Crear otro igual?')) return;
  }

  const p = {
    nombre,
    telefono:  document.getElementById('pac-tel').value.trim()  || null,
    ci:        document.getElementById('pac-ci').value.trim()   || null,
    zona:      document.getElementById('pac-zona').value,
    direccion: document.getElementById('pac-dir').value.trim()  || null,
    notas:     document.getElementById('pac-notas').value.trim() || null,
  };
  if (editId) p.id = editId;

  try {
    await savePaciente(p);
    closeM('modal-pac');
    toast(editId ? 'Paciente actualizado ✓' : 'Paciente creado ✓');
    await renderPacientes();
    window._refreshPacDatalist?.();
  } catch (e) {
    toast('Error al guardar: ' + e.message, 'err');
  }
}

// ── Exposición global para onclick en HTML ───────────────────
window._renderPacientes = renderPacientes;
window._nuevoPaciente   = nuevoPaciente;
window._editarPaciente  = editarPaciente;
window._guardarPaciente = guardarPaciente;
