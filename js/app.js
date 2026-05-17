// ================================================================
// QUIROPODSCZ v3 — Estado global y utilidades
// ================================================================
import { supabase } from './supabase.js';
import { getConfig } from './db.js';

// ── Estado global ─────────────────────────────────────────────────
export const APP = {
  session: null,
  perfil: null,
  config: {},
  currentPage: 'dashboard',
};

// ── Constantes de negocio ────────────────────────────────────────
export const COSTO_FIJO = 1375;
export const COSTO_VAR_PAC = 30;
export const SUELDO_OBJ = 4000;
export const META_BRASIL = 5177;
export const META_USA = 7600;

export const MN = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export const SERVICIOS = [
  { label: 'Quiropedia / Pedicure clínico', monto: 85 },
  { label: 'Pie diabético', monto: 170 },
  { label: 'Podogeriatría', monto: 170 },
  { label: 'Onicocriptosis (uñero) 1 pie', monto: 170 },
  { label: 'Onicocriptosis (uñero) 2 pies', monto: 260 },
  { label: 'Uñero + anestesia local', monto: 300 },
  { label: 'Matricectomía 1 lat.', monto: 700 },
  { label: 'Matricectomía 1 pie bilateral', monto: 870 },
  { label: 'Ortonixia (cuota)', monto: null },
  { label: 'Hongos en uñas (onicomicosis)', monto: 120 },
  { label: 'Callosidades / helomas', monto: 80 },
  { label: 'Valoración podológica', monto: 80 },
  { label: 'Curación podal', monto: 70 },
  { label: 'Órtesis 1 dedo', monto: 130 },
  { label: 'Reflexología podal', monto: 85 },
  { label: 'Podopediatría', monto: 130 },
  { label: 'Fisuras plantares', monto: 80 },
  { label: 'Membresía Cuidado Esencial', monto: 85 },
  { label: 'Membresía Cuidado Plus', monto: 165 },
  { label: 'Membresía Cuidado Total', monto: 300 },
  { label: 'Membresía Pie Diabético', monto: 580 },
  { label: 'Pack Bienestar del Abuelo', monto: 220 },
  { label: 'Pack Pie Diabético Seguro', monto: 380 },
  { label: 'Otro', monto: null },
];

// ── Formatters ───────────────────────────────────────────────────
export function bs(n) {
  return `Bs. ${Math.round(Number(n) || 0).toLocaleString('es-BO')}`;
}

export function fd(s) {
  if (!s) return '—';
  const [y, m, d] = String(s).split('-');
  return `${d}/${m}/${y}`;
}

export function curM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

export function monthOpts() {
  const n = new Date(); const out = [];
  for (let i = -3; i <= 5; i++) {
    const d = new Date(n.getFullYear(), n.getMonth() + i, 1);
    out.push({
      val: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      lbl: `${MN[d.getMonth()]} ${d.getFullYear()}`,
      cur: i === 0
    });
  }
  return out;
}

export function fillMonthSelects(...ids) {
  const opts = monthOpts();
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value || opts.find(o => o.cur)?.val;
    el.innerHTML = opts.map(o =>
      `<option value="${o.val}"${o.val === cur ? ' selected' : ''}>${o.lbl}</option>`
    ).join('');
  });
}

export function selM(id) {
  return document.getElementById(id)?.value || curM();
}

// ── Toast notificaciones ─────────────────────────────────────────
export function toast(msg, type = 'ok') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

// ── Modales ───────────────────────────────────────────────────────
export function openM(id) { document.getElementById(id)?.classList.add('open'); }
export function closeM(id) { document.getElementById(id)?.classList.remove('open'); }

// ── Spinner ───────────────────────────────────────────────────────
export function showSpinner(show) {
  const el = document.getElementById('global-spinner');
  if (el) el.style.display = show ? 'flex' : 'none';
}

// ── Inicializar config ────────────────────────────────────────────
export async function loadConfig() {
  try { APP.config = await getConfig(); } catch(e) { APP.config = {}; }
}

// ── Autocomplete de pacientes ─────────────────────────────────────
export function fillPacienteDatalist(listId, pacientes) {
  const dl = document.getElementById(listId);
  if (!dl) return;
  dl.innerHTML = pacientes.map(p => `<option value="${p.paciente_nombre}">`).join('');
}

// ── Buscar historia clínica por nombre ───────────────────────────
export async function autoFillPaciente(nombre, camposMap) {
  // camposMap: { ci: 'id-input', telefono: 'id-input', ... }
  if (!nombre) return;
  try {
    const { data } = await import('./supabase.js').then(m =>
      m.supabase.from('historias')
        .select('*')
        .ilike('paciente_nombre', nombre)
        .order('created_at', { ascending: false })
        .limit(1)
    );
    if (data && data.length) {
      const h = data[0];
      Object.entries(camposMap).forEach(([campo, elId]) => {
        const el = document.getElementById(elId);
        if (el && h[campo]) el.value = h[campo];
      });
    }
  } catch(e) { /* silencioso */ }
}

// ── Realtime suscripción ──────────────────────────────────────────
export function subscribeTable(table, callback) {
  return supabase
    .channel(`public:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, callback)
    .subscribe();
}
