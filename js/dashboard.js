// ================================================================
// QUIROPODSCZ v3 — Dashboard
// ================================================================
import { bs, fd, selM, MN, COSTO_FIJO, COSTO_VAR_PAC, SUELDO_OBJ } from './app.js';
import { getAllConsultas, getEgresos, getCuotas } from './db.js';

let chS, chSv, chEv;

export async function renderDashboard() {
  const mes = selM('dash-month');
  const [yr, mn] = mes.split('-').map(Number);
  const [allCons, egs, cuotas] = await Promise.all([
    getAllConsultas(),
    getEgresos(mes),
    getCuotas()
  ]);
  const cons = allCons.filter(c => c.mes === mes);
  const ingT = cons.reduce((a, c) => a + Number(c.monto), 0);
  const egT  = egs.reduce((a, e) => a + Number(e.monto), 0);
  const ins  = cons.length * COSTO_VAR_PAC;
  const mg   = ingT - egT - ins;
  const neto = mg - SUELDO_OBJ;
  const ticket = cons.length ? Math.round(ingT / cons.length) : 0;
  let pendT = 0, pendN = 0;
  cuotas.forEach(cq => {
    const p = (cq.pagos || []).filter(x => x === 'Pendiente').length * cq.valor_cuota;
    if (p > 0) { pendT += p; pendN++; }
  });

  document.getElementById('dash-sub').textContent =
    `${MN[mn-1]} ${yr} · ${cons.length} consultas`;
  document.getElementById('k-ing').textContent = bs(ingT);
  document.getElementById('k-pac').textContent = `${cons.length} consulta${cons.length !== 1 ? 's' : ''}`;
  const tel = document.getElementById('k-ticket');
  tel.textContent = bs(ticket);
  tel.style.color = ticket >= 170 ? 'var(--t700)' : ticket >= 130 ? 'var(--amber)' : 'var(--red)';
  document.getElementById('k-eg').textContent = bs(egT + ins);
  document.getElementById('k-mg').textContent = bs(mg);
  document.getElementById('k-mgpct').textContent = ingT ? `${Math.round(mg/ingT*100)}% del ingreso` : '—';
  const nel = document.getElementById('k-neto');
  nel.textContent = bs(neto);
  nel.style.color = neto >= 0 ? 'var(--t700)' : 'var(--red)';
  document.getElementById('k-cuotas').textContent = bs(pendT);
  document.getElementById('k-cuotas-n').textContent = `${pendN} tratamiento${pendN !== 1 ? 's' : ''} activo${pendN !== 1 ? 's' : ''}`;

  // Semáforo
  const sb = document.getElementById('sem-banner');
  const sd = document.getElementById('sem-dot');
  const st = document.getElementById('sem-txt');
  sb.className = 'semaforo';
  if (neto >= 1000) {
    sb.classList.add('sem-verde'); sd.style.background = 'var(--t600)';
    st.textContent = `Mes positivo — resultado neto ${bs(neto)} ✓`;
  } else if (neto >= -2000) {
    sb.classList.add('sem-amarillo'); sd.style.background = 'var(--amber)';
    st.textContent = `Mes ajustado — resultado ${bs(neto)} · Subir ticket a Bs. 170+`;
  } else {
    sb.classList.add('sem-rojo'); sd.style.background = 'var(--red)';
    st.textContent = `Déficit ${bs(Math.abs(neto))} — Acción: más consultas + AirBnb Monoamb.2 urgente`;
  }

  // Gráfico semanas
  const sw = [0,0,0,0];
  cons.forEach(c => {
    const d = parseInt(c.fecha?.split('-')[2] || 1);
    sw[Math.min(Math.floor((d-1)/7), 3)] += Number(c.monto);
  });
  const Chart = window.Chart;
  if (!Chart) return;
  if (chS) chS.destroy();
  chS = new Chart(document.getElementById('chSem'), {
    type: 'bar',
    data: { labels:['Sem 1','Sem 2','Sem 3','Sem 4'], datasets:[{ data:sw, backgroundColor:'rgba(29,158,117,.75)', borderColor:'#1D9E75', borderWidth:1.5, borderRadius:6 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,.04)'},ticks:{font:{size:10}}},x:{grid:{display:false},ticks:{font:{size:10}}}} }
  });

  // Gráfico servicios
  const sm = {};
  cons.forEach(c => { sm[c.servicio] = (sm[c.servicio]||0)+1; });
  const sk = Object.keys(sm), sv = Object.values(sm);
  if (chSv) chSv.destroy();
  if (sk.length) chSv = new Chart(document.getElementById('chSvc'), {
    type: 'doughnut',
    data: { labels:sk, datasets:[{ data:sv, backgroundColor:['#1D9E75','#5DCAA5','#9FE1CB','#0F6E56','#085041','#C8EDE0','#D85A30'], borderWidth:2, borderColor:'#fff' }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10,padding:6}}} }
  });

  // Gráfico evolución
  const ml = [];
  for (let i = -4; i <= 0; i++) {
    const d = new Date(yr, mn-1+i, 1);
    ml.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const eL = ml.map(m => MN[parseInt(m.split('-')[1])-1].slice(0,3));
  const eI = ml.map(m => allCons.filter(c => c.mes === m).reduce((a,c) => a+Number(c.monto),0));
  const eE = ml.map(async m => {
    const eg = await getEgresos(m);
    return eg.reduce((a,e) => a+Number(e.monto),0);
  });
  const eEv = await Promise.all(eE);
  if (chEv) chEv.destroy();
  chEv = new Chart(document.getElementById('chEvol'), {
    type: 'line',
    data: { labels:eL, datasets:[
      { label:'Ingresos', data:eI, borderColor:'#1D9E75', backgroundColor:'rgba(29,158,117,.1)', fill:true, tension:.4, pointBackgroundColor:'#1D9E75', pointRadius:4 },
      { label:'Egresos', data:eEv, borderColor:'#D85A30', backgroundColor:'rgba(216,90,48,.07)', fill:true, tension:.4, pointBackgroundColor:'#D85A30', pointRadius:4, borderDash:[4,3] }
    ]},
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom',labels:{font:{size:10},boxWidth:10}}}, scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,.04)'},ticks:{font:{size:10}}},x:{grid:{display:false},ticks:{font:{size:10}}}} }
  });

  // Punto de equilibrio
  const mpp = ticket - COSTO_VAR_PAC;
  const pe  = mpp > 0 ? Math.ceil(COSTO_FIJO/mpp) : '∞';
  const pes = mpp > 0 ? Math.ceil((COSTO_FIJO+SUELDO_OBJ)/mpp) : '∞';
  document.getElementById('eq-content').innerHTML = `
    <div class="eq-row"><span class="c-muted">Costos fijos/mes</span><span class="fw6">Bs. 1.375</span></div>
    <div class="eq-row"><span class="c-muted">Costo variable/pac.</span><span class="fw6">Bs. 30</span></div>
    <div class="eq-row"><span class="c-muted">Margen/pac. (ticket ${bs(ticket)})</span><span class="fw6">${bs(mpp)}</span></div>
    <div class="eq-row"><span class="c-muted">Solo cubrir costos</span><span class="fw6">${pe} pac/mes</span></div>
    <div class="eq-row" style="background:var(--t50);margin:0 -4px;padding:7px 4px;border-radius:6px"><span class="c-muted">Costos + sueldo Bs.4k</span><span class="fw6 c-teal">${pes} pac/mes</span></div>
    <div class="eq-row" style="border-bottom:none"><span class="c-muted">Este mes</span><span class="fw6">${cons.length} pac · ${Math.round(cons.length/4)} pac/sem</span></div>`;

  document.getElementById('pas-content').innerHTML = `
    <div class="eq-row"><span class="c-muted">Alquiler Cochabamba</span><span class="fw6 c-teal">Bs. 2.500 ✓</span></div>
    <div class="eq-row"><span class="c-muted">AirBnb Monoamb. 2</span><span class="fw6" style="color:var(--amber)">Bs. 3.500–5.000 ⚡</span></div>
    <div class="eq-row"><span class="c-muted">Alquiler Monoamb. 1</span><span class="fw6" style="color:var(--amber)">Bs. 2.500–2.800 ⚡</span></div>
    <div class="eq-row" style="background:var(--t50);margin:0 -4px;padding:7px 4px;border-radius:6px;border-bottom:none"><span class="c-muted">Total potencial</span><span class="fw6 c-teal">Bs. 8.500–10.300</span></div>`;
}
