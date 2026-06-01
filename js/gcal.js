// ================================================================
// QUIROPODSCZ v3 — Google Calendar Integration
// ================================================================

const CLIENT_ID    = '412770764823-nu0tebv7fn29q059i57jrcab090mupo5.apps.googleusercontent.com';
const SCOPES       = 'https://www.googleapis.com/auth/calendar.events';
const DISCO_DOC    = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const CALENDAR_ID  = 'primary'; // Calendario principal del usuario

let gapiLoaded  = false;
let gisLoaded   = false;
let tokenClient = null;
let isAuthorized = false;

// ── Cargar librerías Google ───────────────────────────────────
export function loadGoogleLibs() {
  return new Promise((resolve) => {
    // GAPI
    const s1 = document.createElement('script');
    s1.src = 'https://apis.google.com/js/api.js';
    s1.onload = () => {
      window.gapi.load('client', async () => {
        await window.gapi.client.init({
          discoveryDocs: [DISCO_DOC],
        });
        gapiLoaded = true;
        if (gisLoaded) resolve();
      });
    };
    document.head.appendChild(s1);

    // GIS
    const s2 = document.createElement('script');
    s2.src = 'https://accounts.google.com/gsi/client';
    s2.onload = () => {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) { console.error('GCal auth error', resp); return; }
          isAuthorized = true;
          updateGCalUI(true);
          window._gcalAfterAuth?.();
        },
      });
      gisLoaded = true;
      if (gapiLoaded) resolve();
    };
    document.head.appendChild(s2);
  });
}

// ── Autorizar ─────────────────────────────────────────────────
export function authorizeGCal() {
  if (!tokenClient) { console.warn('GIS no cargado'); return; }
  if (window.gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({ prompt: 'consent' });
  } else {
    tokenClient.requestAccessToken({ prompt: '' });
  }
}

// ── Desconectar ───────────────────────────────────────────────
export function revokeGCal() {
  const token = window.gapi.client.getToken();
  if (!token) return;
  window.google.accounts.oauth2.revoke(token.access_token, () => {
    window.gapi.client.setToken('');
    isAuthorized = false;
    updateGCalUI(false);
  });
}

// ── Verificar si está autorizado ──────────────────────────────
export function isGCalAuthorized() { return isAuthorized; }

// ── Crear evento en Google Calendar ──────────────────────────
export async function crearEventoGCal(cita) {
  if (!isAuthorized) throw new Error('No autorizado en Google Calendar');

  // Normalizar hora — acepta HH:MM o HH:MM:SS
  const normHora = (h) => {
    if (!h) return '08:00:00';
    const partes = h.split(':');
    return `${partes[0].padStart(2,'0')}:${(partes[1]||'00').padStart(2,'0')}:00`;
  };

  const horaIni = normHora(cita.hora_inicio);
  const horaFin = cita.hora_fin
    ? normHora(cita.hora_fin)
    : normHora(sumarHora(cita.hora_inicio || '08:00', 60));

  const fechaInicio = `${cita.fecha}T${horaIni}`;
  const fechaFin    = `${cita.fecha}T${horaFin}`;

  console.log('GCal evento — inicio:', fechaInicio, '— fin:', fechaFin);

  const evento = {
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
    start: { dateTime: fechaInicio, timeZone: 'America/La_Paz' },
    end:   { dateTime: fechaFin,    timeZone: 'America/La_Paz' },
    colorId: '2', // Verde (compatible con el branding de QUIROPOD)
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup',  minutes: 60 },
        { method: 'popup',  minutes: 15 },
      ],
    },
  };

  const resp = await window.gapi.client.calendar.events.insert({
    calendarId: CALENDAR_ID,
    resource: evento,
  });

  return resp.result; // retorna el evento creado con su ID
}

// ── Actualizar evento en Google Calendar ──────────────────────
export async function actualizarEventoGCal(eventId, cita) {
  if (!isAuthorized) throw new Error('No autorizado');
  const fechaInicio = `${cita.fecha}T${cita.hora_inicio || '08:00'}:00`;
  const fechaFin    = cita.hora_fin
    ? `${cita.fecha}T${cita.hora_fin}:00`
    : `${cita.fecha}T${sumarHora(cita.hora_inicio || '08:00', 60)}:00`;

  const resp = await window.gapi.client.calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    resource: {
      summary: `🦶 ${cita.paciente_nombre} — ${cita.servicio || 'Consulta podológica'}`,
      start: { dateTime: fechaInicio, timeZone: 'America/La_Paz' },
      end:   { dateTime: fechaFin,    timeZone: 'America/La_Paz' },
    },
  });
  return resp.result;
}

// ── Eliminar evento de Google Calendar ────────────────────────
export async function eliminarEventoGCal(eventId) {
  if (!isAuthorized || !eventId) return;
  await window.gapi.client.calendar.events.delete({
    calendarId: CALENDAR_ID,
    eventId,
  });
}

// ── Obtener eventos del mes ───────────────────────────────────
export async function getEventosGCal(year, month) {
  if (!isAuthorized) return [];
  const from = new Date(year, month-1, 1).toISOString();
  const to   = new Date(year, month,   1).toISOString();
  const resp = await window.gapi.client.calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: from,
    timeMax: to,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });
  return resp.result.items || [];
}

// ── UI del botón Google Calendar ─────────────────────────────
export function renderGCalButton(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  updateGCalUI(isAuthorized, containerId);
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

// ── Helpers ───────────────────────────────────────────────────
function sumarHora(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const total  = h * 60 + m + minutos;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

// ── Exposición global ─────────────────────────────────────────
window._authorizeGCal = authorizeGCal;
window._revokeGCal    = revokeGCal;
