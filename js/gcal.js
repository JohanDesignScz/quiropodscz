// ================================================================
// QUIROPODSCZ v3 — Google Calendar Integration (v2)
// Cambios vs v1:
//  - El token se guarda en localStorage (sobrevive recargas)
//  - Renovación automática cuando vence (1 h) antes de cada sync
//  - Reintento automático si Google responde 401
//  - Crear / actualizar / eliminar evento (sin duplicados)
//  - syncCitaGCal() central, usado por Agenda y por el Asistente IA
// ================================================================
import { toast } from './app.js';
import { setCitaGcalId } from './db.js';

const CLIENT_ID   = '412770764823-nu0tebv7fn29q059i57jrcab090mupo5.apps.googleusercontent.com';
const SCOPES      = 'https://www.googleapis.com/auth/calendar.events';
const DISCO_DOC   = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const CALENDAR_ID = 'primary';
const LS_TOKEN    = 'qp_gcal_token';
const LS_GRANTED  = 'qp_gcal_granted';

let tokenClient = null;
let accessToken = null;
let expiresAt   = 0;
let waiting     = [];

// ── Token ─────────────────────────────────────────────────────
function tokenValid() { return !!accessToken && Date.now() < expiresAt; }

function applyToken(token, expMs) {
  accessToken = token;
  expiresAt   = expMs;
  window.gapi.client.setToken({ access_token: token });
}

function persist() {
  try {
    localStorage.setItem(LS_TOKEN, JSON.stringify({ t: accessToken, e: expiresAt }));
    localStorage.setItem(LS_GRANTED, '1');
  } catch (e) {}
}

function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_TOKEN) || 'null');
    if (s && Date.now() < s.e) { applyToken(s.t, s.e); return true; }
  } catch (e) {}
  return false;
}

function clearToken() {
  accessToken = null; expiresAt = 0;
  try { localStorage.removeItem(LS_TOKEN); } catch (e) {}
}

function flush(ok) {
  const w = waiting; waiting = [];
  w.forEach(r => r(ok));
}

// "Conectado" = el usuario ya dio permiso alguna vez (el token se renueva solo)
export function isGCalAuthorized() {
  try { return !!localStorage.getItem(LS_GRANTED); } catch (e) { return false; }
}

// ── Cargar librerías Google ───────────────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

export async function loadGoogleLibs() {
  await Promise.all([
    loadScript('https://apis.google.com/js/api.js'),
    loadScript('https://accounts.google.com/gsi/client'),
  ]);
  await new Promise(res => window.gapi.load('client', res));
  await window.gapi.client.init({ discoveryDocs: [DISCO_DOC] });

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp) => {
      if (resp.error) { console.error('GCal auth error', resp); flush(false); return; }
      applyToken(resp.access_token, Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60000);
      persist();
      updateGCalUI(true);
      flush(true);
    },
    error_callback: (err) => { console.warn('GCal popup error', err); flush(false); },
  });

  restore();
  updateGCalUI(isGCalAuthorized());
}

// ── Autorizar (botón "Conectar") ──────────────────────────────
export function authorizeGCal() {
  if (!tokenClient) { toast('Google aún no cargó, intentá en unos segundos', 'warn'); return; }
  tokenClient.requestAccessToken({ prompt: isGCalAuthorized() ? '' : 'consent' });
}

// ── Garantiza un token vigente (renueva si venció) ────────────
export function ensureGCalToken() {
  if (tokenValid()) return Promise.resolve(true);
  if (!tokenClient || !isGCalAuthorized()) return Promise.resolve(false);
  return new Promise(res => {
    waiting.push(res);
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

// ── Desconectar ───────────────────────────────────────────────
export function revokeGCal() {
  if (accessToken) window.google.accounts.oauth2.revoke(accessToken, () => {});
  clearToken();
  try { localStorage.removeItem(LS_GRANTED); } catch (e) {}
  window.gapi?.client?.setToken('');
  updateGCalUI(false);
}

// ── Wrapper: token vigente + 1 reintento si 401 ───────────────
async function cal(fn) {
  if (!(await ensureGCalToken())) throw new Error('Google Calendar no autorizado');
  try {
    return await fn();
  } catch (e) {
    if (e?.status === 401) {
      clearToken();
      if (await ensureGCalToken()) return await fn();
    }
    throw e;
  }
}

// ── Helpers de hora ───────────────────────────────────────────
function normHora(h) {
  if (!h) return '08:00:00';
  const p = String(h).split(':');
  return `${p[0].padStart(2, '0')}:${(p[1] || '00').padStart(2, '0')}:00`;
}

function sumarHora(hora, minutos) {
  const [h, m] = String(hora).split(':').map(Number);
  const t = h * 60 + m + minutos;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function buildEvento(cita) {
  const ini = normHora(cita.hora_inicio);
  const fin = cita.hora_fin
    ? normHora(cita.hora_fin)
    : normHora(sumarHora(cita.hora_inicio || '08:00', 60));
  return {
    summary: `🦶 ${cita.paciente_nombre} — ${cita.servicio || 'Consulta podológica'}`,
    description: [
      `Servicio: ${cita.servicio || '—'}`,
      `Zona: ${cita.zona || '—'}`,
      `Dirección: ${cita.direccion || '—'}`,
      `Estado: ${cita.estado || 'Confirmada'}`,
      cita.notas ? `Notas: ${cita.notas}` : '',
      '',
      '📱 QUIROPODSCZ — Podología a domicilio',
      '+591 62458126 · @quiropodscz',
    ].filter(Boolean).join('\n'),
    start: { dateTime: `${cita.fecha}T${ini}`, timeZone: 'America/La_Paz' },
    end:   { dateTime: `${cita.fecha}T${fin}`, timeZone: 'America/La_Paz' },
    colorId: '2',
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 60 }, { method: 'popup', minutes: 15 }],
    },
  };
}

// ── CRUD de eventos ───────────────────────────────────────────
export async function crearEventoGCal(cita) {
  const resp = await cal(() => window.gapi.client.calendar.events.insert({
    calendarId: CALENDAR_ID, resource: buildEvento(cita),
  }));
  return resp.result;
}

export async function actualizarEventoGCal(eventId, cita) {
  const resp = await cal(() => window.gapi.client.calendar.events.patch({
    calendarId: CALENDAR_ID, eventId, resource: buildEvento(cita),
  }));
  return resp.result;
}

export async function eliminarEventoGCal(eventId) {
  if (!eventId || !isGCalAuthorized()) return;
  try {
    await cal(() => window.gapi.client.calendar.events.delete({ calendarId: CALENDAR_ID, eventId }));
  } catch (e) {
    if (e?.status !== 404 && e?.status !== 410) throw e; // ya no existe: ok
  }
}

export async function getEventosGCal(year, month) {
  if (!isGCalAuthorized()) return [];
  const resp = await cal(() => window.gapi.client.calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date(year, month - 1, 1).toISOString(),
    timeMax: new Date(year, month, 1).toISOString(),
    singleEvents: true, orderBy: 'startTime', maxResults: 100,
  }));
  return resp.result.items || [];
}

// ── Sync central: usar después de guardar una cita en Supabase ─
// `cita` debe ser la fila guardada (con id y, si existe, gcal_event_id)
export async function syncCitaGCal(cita) {
  if (!cita?.id || !isGCalAuthorized()) return;
  try {
    let evId = cita.gcal_event_id;
    if (evId) {
      try {
        await actualizarEventoGCal(evId, cita);
      } catch (e) {
        if (e?.status === 404 || e?.status === 410) evId = null; // lo borraron en Google: recrear
        else throw e;
      }
    }
    if (!evId) {
      const ev = await crearEventoGCal(cita);
      await setCitaGcalId(cita.id, ev.id);
    }
    toast('📅 Cita sincronizada con Google Calendar ✓');
  } catch (e) {
    console.warn('GCal sync error:', e);
    const msg = e?.result?.error?.message || e?.message || 'error desconocido';
    toast('Cita guardada, pero Google Calendar falló: ' + msg, 'warn');
  }
}

// ── UI del botón ──────────────────────────────────────────────
export function renderGCalButton(containerId) {
  updateGCalUI(isGCalAuthorized(), containerId);
}

export function updateGCalUI(authorized, containerId = 'gcal-btn-wrap') {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (authorized) {
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:var(--t600);font-weight:600">✓ Google Calendar conectado</span>
        <button class="btn btn-gray btn-sm" onclick="window._revokeGCal()">Desconectar</button>
      </div>`;
  } else {
    el.innerHTML = `
      <button class="btn-gcal" onclick="window._authorizeGCal()">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
        Conectar Google Calendar
      </button>`;
  }
}

// ── Exposición global ─────────────────────────────────────────
window._authorizeGCal = authorizeGCal;
window._revokeGCal    = revokeGCal;
