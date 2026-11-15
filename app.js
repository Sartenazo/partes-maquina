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
  pararGps();
  parte = null;
  mostrar('vInicio', 'Partes de Máquina', sesion.nombre);
  $('avisoDemo').classList.toggle('oculto', !sesion.demo);
  pintarInicio();
}

async function pintarInicio() {
  if ($('vInicio').classList.contains('oculto')) return;
  const todos = await BD.partes();
  const pend = todos.filter(p => p.estado !== 'enviado');
  const limite = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const env = todos.filter(p => p.estado === 'enviado' && p.fecha >= limite);
  $('tPendientes').textContent = 'Pendientes de enviar' + (pend.length ? ' (' + pend.length + ')' : '');
  $('listaPendientes').innerHTML = pend.length ? pend.map(filaParte).join('') : '<li class="vacio">No hay partes pendientes 👍</li>';
  $('listaEnviados').innerHTML = env.length ? env.map(filaParte).join('') : '<li class="vacio">Todavía no hay partes enviados</li>';
  const u = await BD.leer('ultimoEnvio');
  let txt = '';
  if (pend.length && !navigator.onLine) txt = 'Sin conexión. Se enviarán solos cuando vuelva la cobertura.';
  else if (pend.some(p => p.estado === 'error')) txt = 'Algún parte no se ha podido enviar. Ábrelo para ver el motivo.';
  else if (u) txt = 'Último envío: ' + new Date(u.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  $('estadoEnvio').textContent = txt;
}

function filaParte(p) {
  const n = (p.lineas || []).length;
  const chip = p.estado === 'enviado' ? '<span class="chip enviado">Enviado</span>'
    : p.estado === 'error' ? '<span class="chip error">Error</span>' : '<span class="chip pendiente">Pendiente</span>';
  return `<li data-id="${esc(p.id)}"><div class="txt"><b>${esc(fechaES(p.fecha))} · ${esc(p.empresa)}</b>
    <span>${esc(p.faena || '')}${p.maquina ? ' · ' + esc(p.maquina) : ''} · ${n} parcela${n === 1 ? '' : 's'}${p.gps ? ' · 📍' : ''}</span></div>${chip}</li>`;
}
['listaPendientes', 'listaEnviados'].forEach(id => $(id).addEventListener('click', async e => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  abrirParte(await BD.parte(li.dataset.id));
}));

$('btnNuevo').addEventListener('click', async () => {
  const ult = (await BD.leer('ultimosValores')) || {};
  abrirParte({
    id: uuid(), estado: 'nuevo', fecha: hoy(), hora_inicio: '', hora_fin: '',
    id_empresa: null, empresa: '', clase: ult.clase || '', faena: '', maquina: ult.maquina || '',
    kilos: '', observaciones: '', gps: null, lineas: [], creado_movil: null
  });
});

// ---------- formulario de parte ----------
function soloLectura() { return parte && parte.estado === 'enviado'; }

function abrirParte(p) {
  parte = JSON.parse(JSON.stringify(p));
  const nuevo = parte.estado === 'nuevo';
  mostrar('vParte', nuevo ? 'Nuevo parte' : soloLectura() ? 'Parte enviado' : 'Editar parte',
    nuevo ? 'Máquina' : fechaES(parte.fecha) + ' · ' + parte.empresa);
  $('pFecha').value = parte.fecha;
  $('pHoraIni').value = parte.hora_inicio || '';
  $('pHoraFin').value = parte.hora_fin || '';
  $('pClase').innerHTML = '<option value="">—</option>' + cat.clases.map(c => `<option>${esc(c.nombre)}</option>`).join('');
  $('pClase').value = parte.clase || '';
  $('pKilos').value = parte.kilos;
  $('pObs').value = parte.observaciones || '';
  $('buscarParcela').value = '';
  pintarSelector('pEmpresa', parte.empresa, 'Elegir empresa…');
  pintarSelector('pFaena', parte.faena, 'Elegir faena…');
  pintarSelector('pMaquina', parte.maquina, 'Elegir máquina…');
  pintarParcelas();
  pintarGps();
  $('parteError').textContent = parte.estado === 'error' ? 'No se pudo enviar: ' + (parte.error || '') : '';
  $('parteError').classList.toggle('oculto', parte.estado !== 'error');

  const ro = soloLectura();
  $('formParte').querySelectorAll('input, select, textarea, button').forEach(el => { if (el.id !== 'gpsMapa') el.disabled = ro; });
  $('btnGuardar').classList.toggle('oculto', ro);
  $('btnBorrarParte').classList.toggle('oculto', nuevo || ro);
  $('btnBorrarParte').disabled = false;
  $('btnOtraParcela').classList.toggle('oculto', ro);
  if (nuevo) tomarGps();
}

function pintarSelector(id, valor, vacio) {
  $(id).textContent = valor || vacio;
  $(id).classList.toggle('vacio', !valor);
}

document.querySelectorAll('[data-ahora]').forEach(b => b.addEventListener('click', () => { $(b.dataset.ahora).value = horaAhora(); }));

// --- selector con buscador ---
let selActual = null;
document.querySelectorAll('.selector').forEach(b => b.addEventListener('click', () => abrirSelector(b.dataset.lista)));

function abrirSelector(lista) {
  selActual = lista;
  $('selTitulo').textContent = { empresas: 'Empresa / cliente', faenas: 'Faena', maquinas: 'Máquina' }[lista];
  $('selBuscar').value = '';
  pintarSel();
  abrirDlg('dlgSelector');
  if (cat[lista].length > 8) setTimeout(() => $('selBuscar').focus(), 50);
}
function pintarSel() {
  const q = normal($('selBuscar').value);
  const actual = { empresas: parte.empresa, faenas: parte.faena, maquinas: parte.maquina }[selActual];
  const items = cat[selActual].filter(x => !q || normal(x.nombre + ' ' + (x.cif || '')).includes(q));
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
        !confirm('Has cambiado de empresa. Se quitarán las parcelas marcadas. ¿Continuar?')) return;
    if (parte.id_empresa !== x.id) parte.lineas = [];
    parte.id_empresa = x.id; parte.empresa = x.nombre;
    pintarSelector('pEmpresa', x.nombre); pintarParcelas();
  } else if (selActual === 'faenas') {
    parte.faena = x.nombre; pintarSelector('pFaena', x.nombre);
  } else {
    parte.maquina = x.nombre; pintarSelector('pMaquina', x.nombre);
  }
  cerrarDlg('dlgSelector');
});
const normal = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// --- parcelas ---
function parcelasEmpresa() {
  return cat.parcelas.filter(p => p.id_empresa === parte.id_empresa);
}
function pintarParcelas() {
  const ul = $('listaParcelas');
  if (!parte.id_empresa) {
    ul.innerHTML = '<li class="nota">Elige primero la empresa.</li>';
    $('buscarParcela').classList.add('oculto'); $('resumenParcelas').textContent = ''; return;
  }
  const ro = soloLectura();
  const q = normal($('buscarParcela').value);
  const deCat = parcelasEmpresa();
  $('buscarParcela').classList.toggle('oculto', ro || deCat.length < 6);
  const marcadas = new Map(parte.lineas.map(l => [l.id_parcela == null ? 'm:' + l.id : String(l.id_parcela), l]));
  let filas = [];
  if (!ro) {
    for (const p of deCat) {
      const texto = `${p.poligono} ${p.parcela} ${p.paraje} ${p.tipo_cultivo}`;
      if (q && !normal(texto).includes(q) && !marcadas.has(String(p.id_parcela))) continue;
      filas.push(htmlParcela(p, marcadas.get(String(p.id_parcela)), false));
    }
  }
  for (const l of parte.lineas) if (ro || l.id_parcela == null) filas.push(htmlParcela(l, l, l.id_parcela == null));
  ul.innerHTML = filas.join('') || '<li class="nota">Esta empresa no tiene parcelas en la lista. Usa el botón de abajo.</li>';
  resumenParcelas();
}
function htmlParcela(p, linea, manual) {
  const ro = soloLectura();
  const clave = manual ? 'm:' + linea.id : String(p.id_parcela);
  const unidades = cat.unidades.map(u => `<option ${linea && linea.unidad === u.nombre ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('');
  return `<li data-clave="${esc(clave)}" class="${linea ? 'marcada' : ''}">
    <label class="cab"><input type="checkbox" ${linea ? 'checked' : ''} ${ro ? 'disabled' : ''}>
      <span class="txt"><b>Pol. ${esc(p.poligono)} · Parc. ${esc(p.parcela)}</b>
      <span>${esc(p.paraje || '')}${p.tipo_cultivo ? ' · ' + esc(p.tipo_cultivo) : ''}${p.superficie ? ' · ' + fmt(p.superficie) + ' ha' : ''}</span>
      ${manual ? '<span class="manual">AÑADIDA A MANO</span>' : ''}</span></label>
    ${linea ? `<div class="cant">
      <input type="number" inputmode="decimal" step="any" min="0" placeholder="Cantidad" value="${esc(linea.cantidad)}" data-campo="cantidad" ${ro ? 'disabled' : ''}>
      <select data-campo="unidad" ${ro ? 'disabled' : ''}>${unidades}</select></div>` : ''}
  </li>`;
}
function resumenParcelas() {
  const n = parte.lineas.length;
  const ha = parte.lineas.reduce((s, l) => s + (l.unidad === 'Hectareas' ? (+l.cantidad || 0) : 0), 0);
  $('resumenParcelas').textContent = n ? `${n} marcada${n === 1 ? '' : 's'}${ha ? ' · ' + fmt(ha) + ' ha' : ''}` : '';
}
$('buscarParcela').addEventListener('input', pintarParcelas);
$('listaParcelas').addEventListener('change', async e => {
  const li = e.target.closest('li[data-clave]'); if (!li) return;
  const clave = li.dataset.clave;
  const idx = parte.lineas.findIndex(l => (l.id_parcela == null ? 'm:' + l.id : String(l.id_parcela)) === clave);
  if (e.target.type === 'checkbox') {
    if (e.target.checked) {
      const p = cat.parcelas.find(x => String(x.id_parcela) === clave);
      const ult = (await BD.leer('ultimosValores')) || {};
      const unidad = ult.unidad || 'Hectareas';
      parte.lineas.push({
        id: uuid(), id_parcela: p.id_parcela, poligono: p.poligono, parcela: p.parcela, paraje: p.paraje,
        tipo_cultivo: p.tipo_cultivo, superficie: p.superficie, sigpac: p.sigpac,
        cantidad: unidad === 'Hectareas' ? num(p.superficie) : '', unidad, observaciones: ''
      });
    } else if (idx >= 0) parte.lineas.splice(idx, 1);
    pintarParcelas();
  } else if (idx >= 0) {
    const campo = e.target.dataset.campo;
    parte.lineas[idx][campo] = campo === 'cantidad' ? num(e.target.value) : e.target.value;
    if (campo === 'unidad' && e.target.value === 'Hectareas' && parte.lineas[idx].cantidad === '' && parte.lineas[idx].superficie)
      parte.lineas[idx].cantidad = num(parte.lineas[idx].superficie), pintarParcelas();
    resumenParcelas();
  }
});
$('listaParcelas').addEventListener('input', e => {
  if (e.target.dataset.campo !== 'cantidad') return;
  const clave = e.target.closest('li').dataset.clave;
  const l = parte.lineas.find(l => (l.id_parcela == null ? 'm:' + l.id : String(l.id_parcela)) === clave);
  if (l) { l.cantidad = num(e.target.value); resumenParcelas(); }
});

$('btnOtraParcela').addEventListener('click', () => {
  if (!parte.id_empresa) return toast('Elige primero la empresa');
  $('formOtraParcela').reset(); abrirDlg('dlgParcela');
});
$('formOtraParcela').addEventListener('submit', async e => {
  e.preventDefault();
  const ult = (await BD.leer('ultimosValores')) || {};
  parte.lineas.push({
    id: uuid(), id_parcela: null, poligono: $('opPoligono').value.trim(), parcela: $('opParcela').value.trim(),
    paraje: $('opParaje').value.trim(), tipo_cultivo: $('opCultivo').value.trim(), superficie: null, sigpac: '',
    cantidad: '', unidad: ult.unidad || 'Hectareas', observaciones: 'Parcela añadida a mano en el móvil'
  });
  cerrarDlg('dlgParcela'); pintarParcelas();
});

// --- GPS ---
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

// --- guardar / borrar ---
$('formParte').addEventListener('submit', async e => {
  e.preventDefault();
  if (soloLectura()) return;
  parte.fecha = $('pFecha').value;
  parte.hora_inicio = $('pHoraIni').value;
  parte.hora_fin = $('pHoraFin').value;
  parte.clase = $('pClase').value;
  parte.kilos = num($('pKilos').value);
  parte.observaciones = $('pObs').value.trim();

  const faltan = [];
  if (!parte.fecha) faltan.push('la fecha');
  if (!parte.id_empresa) faltan.push('la empresa');
  if (!parte.faena) faltan.push('la faena');
  if (faltan.length) { toast('Falta ' + faltan.join(', ')); return; }
  if (parte.fecha > hoy()) { toast('La fecha no puede ser posterior a hoy'); return; }
  if (parte.hora_inicio && parte.hora_fin && parte.hora_fin < parte.hora_inicio &&
      !confirm('La hora de fin es anterior a la de inicio. ¿Guardar igualmente?')) return;
  if (!parte.lineas.length && !confirm('No has marcado ninguna parcela. ¿Guardar igualmente?')) return;
  if (parte.lineas.some(l => l.cantidad === '') && !confirm('Hay parcelas sin cantidad. ¿Guardar igualmente?')) return;

  pararGps();
  if (parte.gps) delete parte.gps._viejo;
  if (!parte.creado_movil) parte.creado_movil = new Date().toISOString();
  parte.estado = 'pendiente'; delete parte.error;
  await BD.guardarParte(parte);
  const ultU = parte.lineas.length ? parte.lineas[parte.lineas.length - 1].unidad : undefined;
  const prev = (await BD.leer('ultimosValores')) || {};
  await BD.guardar('ultimosValores', { clase: parte.clase, maquina: parte.maquina, unidad: ultU || prev.unidad });

  irInicio();
  toast(navigator.onLine ? 'Parte guardado. Enviando…' : 'Parte guardado en el móvil. Se enviará al tener cobertura.');
  pedirEnvioSegundoPlano();
  enviar();
});

$('btnBorrarParte').addEventListener('click', async () => {
  if (!confirm('¿Borrar este parte? Aún no se ha enviado a la oficina.')) return;
  await BD.borrarParte(parte.id);
  irInicio(); toast('Parte borrado');
});
$('btnAtras').addEventListener('click', () => {
  if (!soloLectura() && parte && parte.estado === 'nuevo' && (parte.id_empresa || parte.lineas.length) &&
      !confirm('Hay datos sin guardar. ¿Salir sin guardar?')) return;
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
  const pend = (await BD.partes()).filter(p => p.estado !== 'enviado').length;
  if (pend && !confirm(`Tienes ${pend} parte(s) sin enviar. Si cierras sesión SE PERDERÁN. ¿Cerrar sesión igualmente?`)) return;
  if (!pend && !confirm('¿Cerrar sesión?')) return;
  await BD.vaciarTodo();
  sesion = null; cat = null; cerrarDlg('dlgMenu'); irLogin();
});

// ---------- instalar como app ----------
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalarEvt = e; $('btnInstalar').classList.remove('oculto'); });
$('btnInstalar').addEventListener('click', async () => {
  if (!instalarEvt) return;
  instalarEvt.prompt(); await instalarEvt.userChoice; instalarEvt = null; $('btnInstalar').classList.add('oculto');
});

iniciar();
