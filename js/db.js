// ================================================================
// QUIROPODSCZ v3 — Módulo de Base de Datos (CRUD)
// ================================================================
import { supabase } from './supabase.js';

// ── Helpers ──────────────────────────────────────────────────────
export function curMes() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

// ── CONSULTAS ────────────────────────────────────────────────────
export async function getConsultas(mes) {
  const { data, error } = await supabase
    .from('consultas')
    .select('*')
    .like('mes', mes ? mes + '%' : '%')
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getAllConsultas() {
  const { data, error } = await supabase
    .from('consultas').select('*').order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveConsulta(c) {
  if (c.id) {
    const { error } = await supabase.from('consultas').update(c).eq('id', c.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('consultas').insert(c);
    if (error) throw error;
  }
}

export async function deleteConsulta(id) {
  const { error } = await supabase.from('consultas').delete().eq('id', id);
  if (error) throw error;
}

// ── CUOTAS ───────────────────────────────────────────────────────
export async function getCuotas() {
  const { data, error } = await supabase.from('cuotas').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveCuota(c) {
  if (c.id) {
    const { error } = await supabase.from('cuotas').update(c).eq('id', c.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('cuotas').insert(c);
    if (error) throw error;
  }
}

export async function deleteCuota(id) {
  const { error } = await supabase.from('cuotas').delete().eq('id', id);
  if (error) throw error;
}

// ── EGRESOS ──────────────────────────────────────────────────────
export async function getEgresos(mes) {
  let q = supabase.from('egresos').select('*').order('fecha', { ascending: false });
  if (mes) q = q.eq('mes', mes);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function saveEgreso(e) {
  if (e.id) {
    const { error } = await supabase.from('egresos').update(e).eq('id', e.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('egresos').insert(e);
    if (error) throw error;
  }
}

export async function deleteEgreso(id) {
  const { error } = await supabase.from('egresos').delete().eq('id', id);
  if (error) throw error;
}

// ── FONDOS ───────────────────────────────────────────────────────
export async function getFondos() {
  const { data, error } = await supabase.from('fondos').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveFondo(f) {
  const { error } = await supabase.from('fondos').insert(f);
  if (error) throw error;
}

export async function deleteFondo(id) {
  const { error } = await supabase.from('fondos').delete().eq('id', id);
  if (error) throw error;
}

// ── HISTORIAS ────────────────────────────────────────────────────
export async function getHistorias(q) {
  let query = supabase.from('historias').select('*').order('created_at', { ascending: false });
  if (q) query = query.ilike('paciente_nombre', `%${q}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function getHistoria(id) {
  const { data, error } = await supabase.from('historias').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function saveHistoria(h) {
  if (h.id) {
    h.updated_at = new Date().toISOString();
    const { error } = await supabase.from('historias').update(h).eq('id', h.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('historias').insert(h);
    if (error) throw error;
  }
}

export async function deleteHistoria(id) {
  const { error } = await supabase.from('historias').delete().eq('id', id);
  if (error) throw error;
}

// ── RECIBOS ──────────────────────────────────────────────────────
export async function getRecibos(mes) {
  let q = supabase.from('recibos').select('*').order('created_at', { ascending: false });
  if (mes) q = q.eq('mes', mes);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getAllRecibos() {
  const { data, error } = await supabase.from('recibos').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveRecibo(r) {
  const { error } = await supabase.from('recibos').insert(r);
  if (error) throw error;
}

export async function updateRecibo(id, changes) {
  const { error } = await supabase.from('recibos').update(changes).eq('id', id);
  if (error) throw error;
}

export async function deleteRecibo(id) {
  const { error } = await supabase.from('recibos').delete().eq('id', id);
  if (error) throw error;
}

// ── CITAS ────────────────────────────────────────────────────────
export async function getCitas(fecha) {
  let q = supabase.from('citas').select('*').order('hora_inicio');
  if (fecha) q = q.eq('fecha', fecha);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function getCitasMes(year, month) {
  const from = `${year}-${String(month).padStart(2,'0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2,'0')}-${lastDay}`;
  const { data, error } = await supabase
    .from('citas').select('*').gte('fecha', from).lte('fecha', to).order('fecha').order('hora_inicio');
  if (error) throw error;
  return data || [];
}

export async function saveCita(c) {
  if (c.id) {
    const { error } = await supabase.from('citas').update(c).eq('id', c.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('citas').insert(c);
    if (error) throw error;
  }
}

export async function deleteCita(id) {
  const { error } = await supabase.from('citas').delete().eq('id', id);
  if (error) throw error;
}

// ── CONFIGURACIÓN ────────────────────────────────────────────────
export async function getConfig() {
  const { data, error } = await supabase.from('configuracion').select('*');
  if (error) return {};
  const cfg = {};
  (data || []).forEach(row => { cfg[row.clave] = row.valor; });
  return cfg;
}

export async function setConfig(clave, valor) {
  const { error } = await supabase.from('configuracion')
    .upsert({ clave, valor, updated_at: new Date().toISOString() }, { onConflict: 'clave' });
  if (error) throw error;
}

export async function setConfigBatch(pairs) {
  const rows = Object.entries(pairs).map(([clave, valor]) => ({
    clave, valor, updated_at: new Date().toISOString()
  }));
  const { error } = await supabase.from('configuracion').upsert(rows, { onConflict: 'clave' });
  if (error) throw error;
}

// ── PACIENTES (vista desde historias + consultas) ─────────────────
export async function getPacientesNombres() {
  const [h, c] = await Promise.all([
    supabase.from('historias').select('paciente_nombre, ci, telefono, direccion, ficha').order('paciente_nombre'),
    supabase.from('consultas').select('paciente_nombre').order('paciente_nombre')
  ]);
  const nombresSet = new Set();
  const pacientes = [];
  (h.data || []).forEach(p => {
    if (!nombresSet.has(p.paciente_nombre)) {
      nombresSet.add(p.paciente_nombre);
      pacientes.push(p);
    }
  });
  (c.data || []).forEach(p => {
    if (!nombresSet.has(p.paciente_nombre)) {
      nombresSet.add(p.paciente_nombre);
      pacientes.push({ paciente_nombre: p.paciente_nombre });
    }
  });
  return pacientes;
}

// ── AUTH ─────────────────────────────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data?.session;
}

export async function getPerfil(userId) {
  const { data } = await supabase.from('perfiles').select('*').eq('id', userId).single();
  return data;
}
