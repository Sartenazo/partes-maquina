// =====================================================================
//  Partes de Máquina · lógica de pantallas
// =====================================================================
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoy = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const horaAhora = () => new Date().toTimeString().slice(0, 5);
const fechaES = f => f ? f.split('-').reverse().join('/') : '';
const num = v => (v === '' || v == null || isNaN(+v)) ? '' : +v;
const fmt = n => (n === '' || n == null) ? '' : (+n).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

let sesion = null, cat = null, parte = null, gpsWatch = null, instalarEvt = null;

// ---------- utilidades de pantalla ----------
function toast(msg, ms = 2600) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('oculto');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('oculto'), ms);
}
function mostrar(vista, titulo, sub) {
  for (const v of ['vLogin', 'vInicio', 'vParte']) $(v).classList.toggle('oculto', v !== vista);
  $('tituloPantalla').textContent = titulo || 'Partes de Máquina';
  $('subtitulo').textContent = sub || '';
  $('btnAtras').classList.toggle('oculto', vista !== 'vParte');
  $('btnMenu').classList.toggle('oculto', vista !== 'vInicio');
  window.scrollTo(0, 0);
}
function abrirDlg(id) { $(id).classList.remove('oculto'); }
function cerrarDlg(id) { $(id).classList.add('oculto'); }
document.querySelectorAll('.dialogo').forEach(d => d.addEventListener('click', e => { if (e.target === d) cerrarDlg(d.id); }));
document.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', () => cerrarDlg(b.dataset.cerrar)));

function pintarRed() {
  const on = navigator.onLine;
  $('estadoRed').classList.toggle('sin', !on);
  $('estadoRed').title = on ? 'Con conexión' : 'Sin conexión: los partes se guardan en el móvil';
}

// ---------- arranque ----------
async function iniciar() {
  pintarRed();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => { if (e.data === 'partes-enviados') pintarInicio(); });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  sesion = await BD.leer('sesion');
  cat = await BD.leer('catalogos');
  if (!sesion || !cat) return irLogin();
  irInicio();
  enviar(true);
  if (navigator.onLine && !sesion.demo) Sync.descargarCatalogos().then(c => { if (c) cat = c; }).catch(() => {});
}

function irLogin() {
  mostrar('vLogin', 'Partes de Máquina');
  if (!Sync.configurado()) {
    $('formLogin').classList.add('oculto');
    $('notaDemo').textContent = 'La app aún no está conectada con la oficina. De momento puedes probarla con datos inventados.';
  }
}

$('formLogin').addEventListener('submit', async e => {
  e.preventDefault();
  const b = $('btnEntrar'); b.disabled = true; b.textContent = 'Entrando…';
  $('loginError').classList.add('oculto');
  try {
    sesion = await Sync.entrar($('loginEmail').value.trim(), $('loginClave').value);
    cat = await BD.leer('catalogos');
    $('loginClave').value = '';
    irInicio();
    toast('Hola, ' + sesion.nombre);
  } catch (err) {
    $('loginError').textContent = err instanceof TypeError ? 'Sin conexión. Para entrar la primera vez hace falta internet.' : err.message;
    $('loginError').classList.remove('oculto');
  } finally { b.disabled = false; b.textContent = 'Entrar'; }
});

$('btnDemo').addEventListener('click', async () => {
  sesion = { demo: true, nombre: 'Trabajador de prueba', email: 'demo' };
  cat = Object.assign({ fecha: new Date().toISOString() }, self.CATALOGO_DEMO);
  await BD.guardar('sesion', sesion);
  await BD.guardar('catalogos', cat);
  irInicio();
});

// ---------- inicio ----------
function irInicio() {
  pararGps(); pararReloj();
  parte = null;
  mostrar('vInicio', 'Partes de Máquina', sesion.nombre);
  $('avisoDemo').classList.toggle('oculto', !sesion.demo);
  pintarInicio();
  pintarAyudaIOS();
}

async function pintarInicio() {
  if ($('vInicio').classList.contains('oculto')) return;
  const todos = await BD.partes();
  const curso = todos.filter(p => p.estado === 'en_curso');
  const pend = todos.filter(p => p.estado === 'pendiente' || p.estado === 'error');
  const limite = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const env = todos.filter(p => p.estado === 'enviado' && p.fecha >= limite);
  $('secCurso').classList.toggle('oculto', !curso.length);
  $('listaCurso').innerHTML = curso.map(filaParte).join('');
  $('tPendientes').textContent = 'Pendientes de enviar' + (pend.length ? ' (' + pend.length + ')' : '');
  $('listaPendientes').innerHTML = pend.length ? pend.map(filaParte).join('') : '<li class="vacio">No hay partes pendientes 👍</li>';
  $('listaEnviados').innerHTML = env.length ? env.map(filaParte).join('') : '<li class="vacio">Todavía no hay partes enviados</li>';
  const u = await BD.leer('ultimoEnvio');
  let txt = '';
  if (curso.some(p => p.fecha < hoy())) txt = '⚠ Tienes un parte de otro día sin terminar. Ábrelo y pulsa "Terminar y enviar".';
  else if (pend.length && !navigator.onLine) txt = 'Sin conexión. Se enviarán solos cuando vuelva la cobertura.';
  else if (pend.some(p => p.estado === 'error')) txt = 'Algún parte no se ha podido enviar. Ábrelo para ver el motivo.';
  else if (u) txt = 'Último envío: ' + new Date(u.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  $('estadoEnvio').textContent = txt;
}

function filaParte(p) {
  const n = (p.lineas || []).length;
  const chip = p.estado === 'enviado' ? '<span class="chip enviado">Enviado</span>'
    : p.estado === 'error' ? '<span class="chip error">Error</span>'
    : p.estado === 'en_curso' ? '<span class="chip curso">En curso</span>' : '<span class="chip pendiente">Pendiente</span>';
  const ini = primeraHora(p);
  return `<li data-id="${esc(p.id)}"><div class="txt"><b>${esc(fechaES(p.fecha))} · ${esc(p.empresa || 'Sin empresa')}</b>
    <span>${esc(p.faena || '')}${p.clase ? ' · ' + esc(p.clase) : ''} · ${n} parcela${n === 1 ? '' : 's'}${p.estado === 'en_curso' && ini ? ' · desde ' + ini : ''}</span></div>${chip}</li>`;
}
['listaCurso', 'listaPendientes', 'listaEnviados'].forEach(id => $(id).addEventListener('click', async e => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  abrirParte(await BD.parte(li.dataset.id));
}));

$('btnNuevo').addEventListener('click', async () => {
  const curso = (await BD.partes()).filter(p => p.estado === 'en_curso');
  if (curso.length && !confirm(`Ya tienes un parte en curso (${curso[0].empresa || 'sin empresa'}). ¿Empezar otro parte distinto?`)) {
    return abrirParte(curso[0]);
  }
  const ult = (await BD.leer('ultimosValores')) || {};
  abrirParte({
    id: uuid(), estado: 'nuevo', fecha: hoy(), hora_inicio: '', hora_fin: '',
    id_empresa: null, empresa: '', clase: ult.clase || '', faena: '', maquina: '',
    kilos: '', observaciones: '', gps: null, lineas: [], activa: null, creado_movil: null
  });
});

// ---------- tiempos ----------
const hhmm = iso => iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
const r2 = n => Math.round(n * 100) / 100;
function horasLinea(l) {
  return (l.tramos || []).reduce((s, t) => s + ((t.fin ? new Date(t.fin) : new Date()) - new Date(t.inicio)) / 36e5, 0);
}
function duracion(h) {
  const m = Math.round(h * 60);
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
}
function textoTramos(l) { return (l.tramos || []).map(t => hhmm(t.inicio) + '–' + (t.fin ? hhmm(t.fin) : 'ahora')).join(', '); }
function primeraHora(p) {
  const ts = (p.lineas || []).flatMap(l => l.tramos || []).map(t => t.inicio).sort();
  return ts.length ? hhmm(ts[0]) : (p.hora_inicio || '');
}
function esKilos(u) { return /^kilo/i.test(u || ''); }
function esHoras(u) { return /^hora/i.test(u || ''); }
function recalcular() {
  for (const l of parte.lineas) if (esHoras(l.unidad) && l.cantidad_auto !== false) l.cantidad = r2(horasLinea(l));
  parte.kilos = r2(parte.lineas.reduce((s, l) => s + (esKilos(l.unidad) ? (+l.cantidad || 0) : 0), 0));
  $('kilosSuma').textContent = fmt(parte.kilos || 0) + ' kg';
}
let reloj = null;
function arrancarReloj() { pararReloj(); reloj = setInterval(() => { if (parte) { recalcular(); pintarActiva(); } }, 30000); }
function pararReloj() { if (reloj) { clearInterval(reloj); reloj = null; } }

// ---------- formulario de parte ----------
function soloLectura() { return parte && parte.estado === 'enviado'; }
function enCurso() { return parte && (parte.estado === 'en_curso' || parte.estado === 'nuevo'); }

function abrirParte(p) {
  parte = JSON.parse(JSON.stringify(p));
  for (const l of parte.lineas) if (!l.tramos) l.tramos = [];
  const nuevo = parte.estado === 'nuevo';
  const ro = soloLectura();
  mostrar('vParte', nuevo ? 'Nuevo parte' : ro ? 'Parte enviado' : parte.estado === 'en_curso' ? 'Parte en curso' : 'Parte terminado',
    nuevo ? 'Máquina' : fechaES(parte.fecha) + ' · ' + (parte.empresa || ''));
  $('pFecha').value = parte.fecha;
  $('pObs').value = parte.observaciones || '';
  $('buscarParcela').value = '';
  pintarSelector('pEmpresa', parte.empresa, 'Elegir empresa…');
  pintarSelector('pClase', parte.clase, 'Elegir máquina…');
  pintarSelector('pFaena', parte.faena, 'Elegir tipo de trabajo…');
  recalcular();
  pintarParcelas();
  pintarGps();
  $('parteError').textContent = parte.estado === 'error' ? 'No se pudo enviar: ' + (parte.error || '') : '';
  $('parteError').classList.toggle('oculto', parte.estado !== 'error');
  pintarAvisoCurso();

  $('formParte').querySelectorAll('input, select, textarea, button').forEach(el => { if (el.id !== 'gpsMapa') el.disabled = ro; });
  $('btnGuardar').classList.toggle('oculto', ro);
  $('btnTerminar').classList.toggle('oculto', ro);
  $('btnTerminar').textContent = enCurso() ? '✔ Terminar y enviar' : '⇪ Enviar';
  $('btnBorrarParte').classList.toggle('oculto', nuevo || ro);
  $('btnOtraParcela').classList.toggle('oculto', ro);
  $('ayudaParcelas').classList.toggle('oculto', ro || !enCurso());
  if (nuevo) tomarGps();
  if (enCurso()) arrancarReloj();
}
function pintarAvisoCurso() {
  const a = $('avisoCurso');
  if (parte.estado === 'en_curso' && parte.fecha < hoy()) {
    a.className = 'aviso viejo'; a.textContent = '⚠ Este parte es de otro día. Revisa las horas y pulsa "Terminar y enviar".';
  } else if (parte.estado === 'en_curso') {
    a.className = 'aviso curso'; a.textContent = 'PARTE EN CURSO · se guarda en el móvil y se envía al pulsar "Terminar y enviar"';
  } else { a.className = 'aviso oculto'; }
}

function pintarSelector(id, valor, vacio) {
  $(id).textContent = valor || vacio;
  $(id).classList.toggle('vacio', !valor);
}

// --- selector con buscador ---
let selActual = null;
document.querySelectorAll('.selector').forEach(b => b.addEventListener('click', () => abrirSelector(b.dataset.lista)));

function abrirSelector(lista) {
  selActual = lista;
  $('selTitulo').textContent = { empresas: 'Empresa / cliente', faenas: 'Tipo Trabajo', clases: 'Máquina' }[lista];
  $('selBuscar').value = '';
  pintarSel();
  abrirDlg('dlgSelector');
  if ((cat[lista] || []).length > 8) setTimeout(() => $('selBuscar').focus(), 50);
}
function pintarSel() {
  const q = normal($('selBuscar').value);
  const actual = { empresas: parte.empresa, faenas: parte.faena, clases: parte.clase }[selActual];
  const items = (cat[selActual] || []).filter(x => !q || normal(x.nombre + ' ' + (x.cif || '')).includes(q));
  $('selLista').innerHTML = items.length ? items.map(x =>
    `<li data-id="${x.id}" class="${x.nombre === actual ? 'marcado' : ''}"><div class="txt"><b>${esc(x.nombre)}</b>${x.localidad ? `<span>${esc(x.localidad)}</span>` : ''}</div></li>`
  ).join('') : '<li class="vacio">Nada coincide con la búsqueda</li>';
}
$('selBuscar').addEventListener('input', pintarSel);
$('selCerrar').addEventListener('click', () => cerrarDlg('dlgSelector'));
$('selLista').addEventListener('click', e => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const x = cat[selActual].find(i => String(i.id) === li.dataset.id);
  if (selActual === 'empresas') {
    if (parte.id_empresa !== x.id && parte.lineas.length &&
        !confirm('Has cambiado de empresa. Se quitarán las parcelas apuntadas. ¿Continuar?')) return;
    if (parte.id_empresa !== x.id) { parte.lineas = []; parte.activa = null; }
    parte.id_empresa = x.id; parte.empresa = x.nombre;
    pintarSelector('pEmpresa', x.nombre); pintarParcelas();
  } else if (selActual === 'faenas') {
    parte.faena = x.nombre; pintarSelector('pFaena', x.nombre);
  } else {
    parte.clase = x.nombre; pintarSelector('pClase', x.nombre);
  }
  cerrarDlg('dlgSelector');
  autoguardar();
});
const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// --- parcelas ---
const claveLinea = l => l.id_parcela == null ? 'm:' + l.id : String(l.id_parcela);
function parcelasEmpresa() { return cat.parcelas.filter(p => p.id_empresa === parte.id_empresa); }
function lineaActiva() { return parte.lineas.find(l => l.id === parte.activa) || null; }
function nombreParcela(p) {
  return p.poligono || p.parcela ? `Pol. ${p.poligono || '?'} · Parc. ${p.parcela || '?'}` : 'Parcela sin identificar';
}

function pintarActiva() {
  const l = lineaActiva();
  $('parcelaActiva').classList.toggle('oculto', !l || soloLectura());
  if (!l) return;
  const t = l.tramos[l.tramos.length - 1];
  $('activaNombre').textContent = '⏱ Trabajando en ' + nombreParcela(l) + (l.paraje ? ' · ' + l.paraje : '');
  $('activaTiempo').textContent = 'desde las ' + hhmm(t.inicio) + ' · ' + duracion(horasLinea(l)) + ' en esta parcela';
}

function pintarParcelas() {
  const ul = $('listaParcelas');
  pintarActiva();
  if (!parte.id_empresa) {
    ul.innerHTML = '<li class="nota">Elige primero la empresa.</li>';
    $('buscarParcela').classList.add('oculto'); $('resumenParcelas').textContent = ''; return;
  }
  const ro = soloLectura();
  const q = normal($('buscarParcela').value);
  const deCat = parcelasEmpresa();
  $('buscarParcela').classList.toggle('oculto', ro || deCat.length < 6);
  const apuntadas = new Map(parte.lineas.map(l => [claveLinea(l), l]));
  const filas = [];
  // primero las parcelas ya apuntadas (en el orden en que se trabajaron), luego el resto
  for (const l of parte.lineas) filas.push(htmlParcela(l, l));
  if (!ro) for (const p of deCat) {
    if (apuntadas.has(String(p.id_parcela))) continue;
    if (q && !normal(`${p.poligono} ${p.parcela} ${p.paraje} ${p.tipo_cultivo}`).includes(q)) continue;
    filas.push(htmlParcela(p, null));
  }
  ul.innerHTML = filas.join('') || '<li class="nota">Esta empresa no tiene parcelas en la lista. Usa el botón de abajo.</li>';
  resumenParcelas();
}
function htmlParcela(p, linea) {
  const ro = soloLectura();
  const clave = linea ? claveLinea(linea) : String(p.id_parcela);
  const manual = linea && linea.id_parcela == null;
  const activa = linea && linea.id === parte.activa;
  const info = `${esc(p.paraje || '')}${p.tipo_cultivo ? ' · ' + esc(p.tipo_cultivo) : ''}${p.superficie ? ' · ' + fmt(p.superficie) + ' ha' : ''}`;
  if (!linea) {
    return `<li data-clave="${esc(clave)}"><div class="cab"><span class="txt"><b>${esc(nombreParcela(p))}</b><span>${info}</span></span></div>
      <div class="acciones"><button type="button" class="empezar" data-accion="empezar">▶ Empezar aquí</button></div></li>`;
  }
  const unidades = cat.unidades.map(u => `<option ${linea.unidad === u.nombre ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('');
  const h = horasLinea(linea);
  return `<li data-clave="${esc(clave)}" class="marcada ${activa ? 'trabajando' : ''}">
    <div class="cab"><span class="txt"><b>${esc(nombreParcela(p))}</b><span>${info}</span>
      ${linea.tramos.length ? `<span class="tiempos">⏱ ${esc(textoTramos(linea))} · ${duracion(h)}${linea.lat != null ? ' · 📍' : ''}</span>` : ''}
      ${manual ? `<span class="manual">AÑADIDA A MANO${linea.lat != null ? ' · SE BUSCARÁ EN EL CATASTRO' : ' · SIN UBICACIÓN'}</span>` : ''}</span></div>
    <div class="cant">
      <input type="number" inputmode="decimal" step="any" min="0" placeholder="${esHoras(linea.unidad) ? 'Horas' : 'Cantidad'}" value="${esc(linea.cantidad)}" data-campo="cantidad" ${ro ? 'disabled' : ''}>
      <select data-campo="unidad" ${ro ? 'disabled' : ''}>${unidades}</select></div>
    ${ro ? '' : `<div class="acciones">
      ${activa ? '' : `<button type="button" class="secundario" data-accion="empezar">▶ ${linea.tramos.length ? 'Volver aquí' : 'Empezar aquí'}</button>`}
      <button type="button" class="quitar" data-accion="quitar" aria-label="Quitar parcela">✕</button></div>`}
  </li>`;
}
function resumenParcelas() {
  const n = parte.lineas.length;
  const h = parte.lineas.reduce((s, l) => s + horasLinea(l), 0);
  $('resumenParcelas').textContent = n ? `${n} parcela${n === 1 ? '' : 's'}${h ? ' · ' + duracion(h) : ''}` : '';
}
$('buscarParcela').addEventListener('input', pintarParcelas);

// Empezar a trabajar en una parcela: cierra la anterior, abre un tramo nuevo y guarda el GPS
async function empezarEn(clave) {
  if (!parte.id_empresa) return toast('Elige primero la empresa');
  const ahora = new Date().toISOString();
  const act = lineaActiva();
  if (act) { const t = act.tramos[act.tramos.length - 1]; if (t && !t.fin) t.fin = ahora; }
  let l = parte.lineas.find(x => claveLinea(x) === clave);
  if (!l) {
    const p = cat.parcelas.find(x => String(x.id_parcela) === clave);
    const ult = (await BD.leer('ultimosValores')) || {};
    const unidad = ult.unidad || 'Hectareas';
    l = { id: uuid(), id_parcela: p.id_parcela, poligono: p.poligono, parcela: p.parcela, paraje: p.paraje,
          tipo_cultivo: p.tipo_cultivo, superficie: p.superficie, sigpac: p.sigpac,
          cantidad: /^hect/i.test(unidad) ? num(p.superficie) : '', unidad, observaciones: '',
          lat: null, lon: null, precision: null, tramos: [] };
    parte.lineas.push(l);
  }
  l.tramos.push({ inicio: ahora, fin: null });
  parte.activa = l.id;
  if (parte.estado === 'nuevo') { parte.estado = 'en_curso'; parte.creado_movil = ahora; $('tituloPantalla').textContent = 'Parte en curso'; $('subtitulo').textContent = fechaES(parte.fecha) + ' · ' + parte.empresa; }
  recalcular(); pintarParcelas(); pintarAvisoCurso();
  $('btnBorrarParte').classList.remove('oculto');
  window.scrollTo({ top: $('parcelaActiva').offsetTop - 80, behavior: 'smooth' });
  toast('▶ Empezado en ' + nombreParcela(l) + ' a las ' + hhmm(ahora));
  ubicarLinea(l);
  autoguardar(true);
}
// GPS de la parcela: la primera vez que se empieza en ella
function ubicarLinea(l) {
  if (l.lat != null || !('geolocation' in navigator)) return;
  navigator.geolocation.getCurrentPosition(pos => {
    l.lat = pos.coords.latitude; l.lon = pos.coords.longitude; l.precision = pos.coords.accuracy;
    if (!parte.gps) parte.gps = { lat: l.lat, lon: l.lon, precision: l.precision, fecha: new Date(pos.timestamp).toISOString() };
    if (parte && parte.lineas.includes(l)) { pintarParcelas(); pintarGps(); autoguardar(true); }
  }, () => toast('No se pudo tomar la ubicación de la parcela'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
}
function parar() {
  const l = lineaActiva(); if (!l) return;
  const t = l.tramos[l.tramos.length - 1]; if (t && !t.fin) t.fin = new Date().toISOString();
  parte.activa = null;
  recalcular(); pintarParcelas();
  toast('⏸ Parado en ' + nombreParcela(l) + ' (' + duracion(horasLinea(l)) + ')');
  autoguardar(true);
}
$('btnParar').addEventListener('click', parar);

$('listaParcelas').addEventListener('click', e => {
  const b = e.target.closest('button[data-accion]'); if (!b) return;
  const clave = b.closest('li[data-clave]').dataset.clave;
  if (b.dataset.accion === 'empezar') return empezarEn(clave);
  if (b.dataset.accion === 'quitar') {
    const idx = parte.lineas.findIndex(l => claveLinea(l) === clave);
    if (idx < 0) return;
    const l = parte.lineas[idx];
    if (l.tramos.length && !confirm('¿Quitar ' + nombreParcela(l) + ' del parte? Se perderán sus horas.')) return;
    if (parte.activa === l.id) parte.activa = null;
    parte.lineas.splice(idx, 1);
    recalcular(); pintarParcelas(); autoguardar(true);
  }
});
$('listaParcelas').addEventListener('change', e => {
  const li = e.target.closest('li[data-clave]'); if (!li || !e.target.dataset.campo) return;
  const l = parte.lineas.find(x => claveLinea(x) === li.dataset.clave); if (!l) return;
  if (e.target.dataset.campo === 'unidad') {
    l.unidad = e.target.value;
    if (esHoras(l.unidad)) { l.cantidad_auto = true; }
    else if (/^hect/i.test(l.unidad) && (l.cantidad === '' || l.cantidad_auto) && l.superficie) { l.cantidad = num(l.superficie); l.cantidad_auto = false; }
    else if (l.cantidad_auto) { l.cantidad = ''; l.cantidad_auto = false; }
    BD.leer('ultimosValores').then(u => BD.guardar('ultimosValores', Object.assign(u || {}, { unidad: l.unidad })));
  } else {
    l.cantidad = num(e.target.value);
    if (esHoras(l.unidad)) l.cantidad_auto = false;      // horas corregidas a mano
  }
  recalcular(); pintarParcelas(); autoguardar();
});
$('listaParcelas').addEventListener('input', e => {
  if (e.target.dataset.campo !== 'cantidad') return;
  const l = parte.lineas.find(x => claveLinea(x) === e.target.closest('li').dataset.clave);
  if (l) { l.cantidad = num(e.target.value); if (esHoras(l.unidad)) l.cantidad_auto = false; recalcular(); }
});

$('btnOtraParcela').addEventListener('click', () => {
  if (!parte.id_empresa) return toast('Elige primero la empresa');
  $('formOtraParcela').reset(); abrirDlg('dlgParcela');
});
$('formOtraParcela').addEventListener('submit', async e => {
  e.preventDefault();
  const ult = (await BD.leer('ultimosValores')) || {};
  const l = {
    id: uuid(), id_parcela: null, poligono: $('opPoligono').value.trim(), parcela: $('opParcela').value.trim(),
    paraje: $('opParaje').value.trim(), tipo_cultivo: $('opCultivo').value.trim(), superficie: null, sigpac: '',
    cantidad: '', unidad: ult.unidad || 'Hectareas', observaciones: 'Parcela añadida a mano en el móvil',
    lat: null, lon: null, precision: null, tramos: []
  };
  parte.lineas.push(l);
  cerrarDlg('dlgParcela');
  empezarEn(claveLinea(l));
});
$('pObs').addEventListener('change', () => { parte.observaciones = $('pObs').value.trim(); autoguardar(); });
$('pFecha').addEventListener('change', () => { parte.fecha = $('pFecha').value; pintarAvisoCurso(); autoguardar(); });

// --- GPS del parte ---
function pintarGps(buscando) {
  const g = parte.gps;
  if (buscando && !g) $('gpsEstado').textContent = 'Buscando ubicación… (puede tardar unos segundos)';
  else if (!g) $('gpsEstado').textContent = 'Sin ubicación. Pulsa el botón para tomarla.';
  else $('gpsEstado').innerHTML = `${g.lat.toFixed(5)}, ${g.lon.toFixed(5)} · precisión ±${Math.round(g.precision)} m` +
    (buscando ? ' · mejorando…' : '') + `<br><small>${new Date(g.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</small>`;
  $('gpsMapa').classList.toggle('oculto', !g);
  if (g) $('gpsMapa').href = `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lon}`;
  $('btnGps').textContent = g ? '📍 Repetir ubicación' : '📍 Tomar ubicación';
}
function tomarGps(repitiendo) {
  if (!('geolocation' in navigator)) { $('gpsEstado').textContent = 'Este móvil no permite la ubicación.'; return; }
  pararGps();
  const inicio = Date.now();
  pintarGps(true);
  gpsWatch = navigator.geolocation.watchPosition(pos => {
    if (!parte) return pararGps();
    const c = pos.coords;
    if (!parte.gps || c.accuracy < parte.gps.precision || parte.gps._viejo) {
      parte.gps = { lat: c.latitude, lon: c.longitude, precision: c.accuracy, fecha: new Date(pos.timestamp).toISOString() };
    }
    const terminado = c.accuracy <= 15 || Date.now() - inicio > 30000;
    pintarGps(!terminado);
    if (terminado) {
      pararGps();
      if (repitiendo) toast('📍 Ubicación actualizada (±' + Math.round(parte.gps.precision) + ' m)');
      autoguardar();
    }
  }, err => {
    pararGps();
    $('gpsEstado').textContent = err.code === 1
      ? 'Permiso de ubicación denegado. Actívalo en los ajustes del navegador para esta app.'
      : 'No se pudo obtener la ubicación (' + (err.code === 3 ? 'tiempo agotado' : 'GPS no disponible') + '). Prueba otra vez al aire libre.';
  }, { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 });
  setTimeout(() => { if (gpsWatch !== null && Date.now() - inicio >= 30000) { pararGps(); pintarGps(); } }, 31000);
}
function pararGps() { if (gpsWatch !== null) { navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; } }
$('btnGps').addEventListener('click', () => { const rep = !!parte.gps; if (rep) parte.gps._viejo = true; tomarGps(rep); });

// --- guardar / terminar / borrar ---
let tAuto = null;
function autoguardar(yaMismo) {
  if (!parte || soloLectura() || parte.estado === 'nuevo') return;
  clearTimeout(tAuto);
  tAuto = setTimeout(async () => {
    if (!parte) return;
    const copia = JSON.parse(JSON.stringify(parte)); if (copia.gps) delete copia.gps._viejo;
    await BD.guardarParte(copia);
    if (copia.estado === 'en_curso' && navigator.onLine) Sync.guardarBorrador(copia).catch(() => {});
  }, yaMismo ? 0 : 800);
}
function leerFormulario() {
  parte.fecha = $('pFecha').value;
  parte.observaciones = $('pObs').value.trim();
  recalcular();
}
async function recordarValores() {
  const prev = (await BD.leer('ultimosValores')) || {};
  const ultU = parte.lineas.length ? parte.lineas[parte.lineas.length - 1].unidad : undefined;
  await BD.guardar('ultimosValores', { clase: parte.clase, unidad: ultU || prev.unidad });
}

$('btnGuardar').addEventListener('click', async () => {
  if (soloLectura()) return;
  leerFormulario();
  if (parte.estado === 'nuevo') {
    if (!parte.id_empresa && !parte.lineas.length) { irInicio(); return; }
    parte.estado = 'en_curso'; parte.creado_movil = new Date().toISOString();
  }
  if (parte.estado === 'error') parte.estado = 'pendiente';
  pararGps(); if (parte.gps) delete parte.gps._viejo;
  await BD.guardarParte(parte);
  if (parte.estado === 'en_curso' && navigator.onLine) Sync.guardarBorrador(parte).catch(() => {});
  await recordarValores();
  const enc = parte.estado === 'en_curso';
  irInicio();
  toast(enc ? 'Guardado. El parte sigue en curso.' : 'Cambios guardados.');
  if (!enc) enviar();
});

$('btnTerminar').addEventListener('click', async () => {
  if (soloLectura()) return;
  leerFormulario();
  const faltan = [];
  if (!parte.fecha) faltan.push('la fecha');
  if (!parte.id_empresa) faltan.push('la empresa');
  if (!parte.faena) faltan.push('el tipo de trabajo');
  if (faltan.length) { toast('Falta ' + faltan.join(', ')); return; }
  if (parte.fecha > hoy()) { toast('La fecha no puede ser posterior a hoy'); return; }
  if (!parte.lineas.length && !confirm('No has apuntado ninguna parcela. ¿Terminar igualmente?')) return;
  if (enCurso() && !confirm('¿Terminar el parte y enviarlo a la oficina? Después ya no se podrá añadir más parcelas.')) return;

  const ahora = new Date().toISOString();
  const act = lineaActiva();
  if (act) { const t = act.tramos[act.tramos.length - 1]; if (t && !t.fin) t.fin = ahora; }
  parte.activa = null;
  recalcular();
  if (parte.lineas.some(l => l.cantidad === '') && !confirm('Hay parcelas sin cantidad. ¿Enviar igualmente?')) return;
  if (enCurso()) {
    parte.hora_inicio = primeraHora(parte) || hhmm(parte.creado_movil || ahora);
    parte.hora_fin = hhmm(ahora);
  }
  pararGps(); pararReloj();
  if (parte.gps) delete parte.gps._viejo;
  for (const l of parte.lineas) if (l.lat == null && parte.gps && l.id_parcela == null) { l.lat = parte.gps.lat; l.lon = parte.gps.lon; }
  if (!parte.creado_movil) parte.creado_movil = ahora;
  parte.estado = 'pendiente'; delete parte.error;
  await BD.guardarParte(parte);
  await recordarValores();
  irInicio();
  toast(navigator.onLine ? 'Parte terminado. Enviando…' : 'Parte terminado. Se enviará al tener cobertura.');
  pedirEnvioSegundoPlano();
  enviar();
});

$('btnBorrarParte').addEventListener('click', async () => {
  if (!confirm('¿Borrar este parte? Aún no se ha enviado a la oficina y se perderá.')) return;
  const id = parte.id;
  await BD.borrarParte(id);
  if (navigator.onLine) Sync.borrarBorrador(id).catch(() => {});
  irInicio(); toast('Parte borrado');
});
$('btnAtras').addEventListener('click', async () => {
  if (parte && parte.estado === 'nuevo' && (parte.id_empresa || parte.lineas.length) &&
      !confirm('Este parte aún no está guardado. ¿Salir sin guardar?')) return;
  if (parte && !soloLectura() && parte.estado !== 'nuevo') { leerFormulario(); await BD.guardarParte(parte); }
  irInicio();
});

// ---------- envío ----------
async function enviar(silencioso) {
  if (!navigator.onLine) { pintarInicio(); return; }
  const r = await Sync.enviarPendientes();
  pintarInicio();
  if (silencioso) return;
  if (r.enviados) toast(r.enviados === 1 ? '✔ Parte enviado a la oficina' : `✔ ${r.enviados} partes enviados a la oficina`);
  else if (r.errores) toast('No se pudo enviar algún parte. Ábrelo para ver el motivo.', 4000);
}
async function pedirEnvioSegundoPlano() {
  try { const reg = await navigator.serviceWorker.ready; if (reg.sync) await reg.sync.register('enviar-partes'); } catch (e) {}
}
window.addEventListener('online', () => { pintarRed(); enviar(); });
window.addEventListener('offline', () => { pintarRed(); pintarInicio(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sesion) enviar(true); });
setInterval(() => { if (sesion && document.visibilityState === 'visible') enviar(true); }, 60000);

// ---------- menú ----------
$('btnMenu').addEventListener('click', async () => {
  $('menuUsuario').textContent = sesion.nombre + (sesion.email && !sesion.demo ? ' · ' + sesion.email : '');
  const c = await BD.leer('catalogos');
  $('menuCatalogos').textContent = 'Empresas y parcelas actualizadas el ' +
    new Date(c.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) +
    ` (${c.empresas.length} empresas, ${c.parcelas.length} parcelas).`;
  abrirDlg('dlgMenu');
});
$('btnActCatalogos').addEventListener('click', async () => {
  if (sesion.demo) { toast('En modo demostración los datos son fijos'); return; }
  if (!navigator.onLine) { toast('Necesitas conexión para actualizar'); return; }
  const b = $('btnActCatalogos'); b.disabled = true;
  try { cat = await Sync.descargarCatalogos(); cerrarDlg('dlgMenu'); toast('✔ Empresas y parcelas actualizadas'); }
  catch (e) { toast('No se pudo actualizar: ' + e.message, 4000); }
  finally { b.disabled = false; }
});
$('btnEnviarYa').addEventListener('click', () => { cerrarDlg('dlgMenu'); if (!navigator.onLine) toast('Sin conexión ahora mismo'); else enviar(); });
$('btnSalir').addEventListener('click', async () => {
  const pend = (await BD.partes()).filter(p => p.estado !== 'enviado').length;  // en curso + pendientes
  if (pend && !confirm(`Tienes ${pend} parte(s) sin enviar. Si cierras sesión SE PERDERÁN. ¿Cerrar sesión igualmente?`)) return;
  if (!pend && !confirm('¿Cerrar sesión?')) return;
  await BD.vaciarTodo();
  sesion = null; cat = null; cerrarDlg('dlgMenu'); irLogin();
});

// ---------- instalar como app ----------
const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
async function pintarAyudaIOS() {
  const vista = (await BD.leer('ayudaIOSvista')) === true;
  $('ayudaIOS').classList.toggle('oculto', !(esIOS && !instalada && !vista));
}
$('btnOcultarIOS').addEventListener('click', async () => { await BD.guardar('ayudaIOSvista', true); pintarAyudaIOS(); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalarEvt = e; $('btnInstalar').classList.remove('oculto'); });
$('btnInstalar').addEventListener('click', async () => {
  if (!instalarEvt) return;
  instalarEvt.prompt(); await instalarEvt.userChoice; instalarEvt = null; $('btnInstalar').classList.add('oculto');
});

iniciar();
