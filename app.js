// =====================================================================
//  Partes de trabajo (Máquina, Vendimiadora, Cosechadora...) · lógica de pantallas
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

let sesion = null, cat = null, parte = null, horas = null, gpsWatch = null, instalarEvt = null;

// ---------- tipos de parte ----------
// unidad: unidad por defecto de cada parcela (null = la última usada) · kilos: texto del total
const TIPOS = {
  maquina:      { nombre: 'Trabajos con máquinas', corto: 'Máquina', icono: '🚜', maquina: true, unidad: null, kilos: 'Kilos transportados' },
  vendimiadora: { nombre: 'Vendimiadora', corto: 'Vendimiadora', icono: '🍇', unidad: 'Kilos', kilos: 'Kilos vendimiados' },
  cosechadora:  { nombre: 'Cosechadora', corto: 'Cosechadora', icono: '🌾', cereal: true, unidad: 'Kilos', kilos: 'Kilos cosechados' },
  tratamiento:  { nombre: 'Tratamientos', corto: 'Tratamiento', icono: '🧪', tratamiento: true, unidad: 'Hectareas', kilos: '' },
  terceros:     { nombre: 'Trabajos a terceros', corto: 'Terceros', icono: '🤝', terceros: true, unidad: null, kilos: '' }
};
const PROXIMOS = [];
const tipoDe = p => TIPOS[(p && p.tipo) || 'maquina'] || TIPOS.maquina;

// ---------- reloj sencillo: dos desplegables (hora y minutos) en vez del reloj de agujas ----------
function relojSencillo(inp, conVacio) {
  const P = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const D = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'disabled');
  inp.type = 'text'; inp.required = false; inp.classList.add('oculto');
  const caja = document.createElement('div'); caja.className = 'reloj';
  const sh = document.createElement('select'), sm = document.createElement('select');
  sh.setAttribute('aria-label', 'Hora'); sm.setAttribute('aria-label', 'Minutos');
  const op = (s, v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o); };
  op(sh, '', '--'); for (let h = 0; h < 24; h++) op(sh, String(h).padStart(2, '0'), String(h).padStart(2, '0'));
  op(sm, '', '--'); for (let m = 0; m < 60; m += 5) op(sm, String(m).padStart(2, '0'), String(m).padStart(2, '0'));
  const dosp = document.createElement('span'); dosp.textContent = ':';
  caja.append(sh, dosp, sm); inp.after(caja);
  const pintar = v => {
    const [h, m] = (v || '').split(':');
    if (m && ![...sm.options].some(o => o.value === m)) {          // minuto que no es múltiplo de 5 (p. ej. "Entro ahora")
      op(sm, m, m); [...sm.options].slice(1).sort((a, b) => a.value - b.value).forEach(o => sm.appendChild(o));
    }
    sh.value = h || ''; sm.value = h ? (m || '00') : '';
  };
  const cambio = () => {
    if (sh.value && !sm.value) sm.value = '00';
    if (!sh.value) sm.value = '';
    P.set.call(inp, sh.value ? sh.value + ':' + sm.value : '');
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  };
  sh.addEventListener('change', cambio); sm.addEventListener('change', cambio);
  Object.defineProperty(inp, 'value', { get() { return P.get.call(inp); }, set(v) { P.set.call(inp, v); pintar(v); } });
  Object.defineProperty(inp, 'disabled', { get() { return D.get.call(inp); }, set(v) { D.set.call(inp, v); sh.disabled = sm.disabled = !!v; } });
  if (!conVacio) sh.options[0].hidden = true;
  pintar(P.get.call(inp));
}
relojSencillo($('hHoras'), true);
relojSencillo($('terHora'), false);

// ---------- utilidades de pantalla ----------
function toast(msg, ms = 2600) {
  const t = $('toast'); t.textContent = msg; t.classList.remove('oculto');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('oculto'), ms);
}
function mostrar(vista, titulo, sub) {
  for (const v of ['vLogin', 'vInicio', 'vParte', 'vHoras']) $(v).classList.toggle('oculto', v !== vista);
  $('tituloPantalla').textContent = titulo || 'Partes de trabajo';
  $('subtitulo').textContent = sub || '';
  $('btnAtras').classList.toggle('oculto', vista !== 'vParte' && vista !== 'vHoras');
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
  mostrar('vLogin', 'Partes de trabajo');
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
  pararGps(); pararReloj(); pararVigilancia();
  parte = null; horas = null;
  mostrar('vInicio', 'Partes de trabajo', sesion.nombre);
  pintarTipos();
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
  if (p.tipo === 'horas') return filaHoras(p);
  const n = (p.lineas || []).length;
  const chip = p.estado === 'enviado' ? '<span class="chip enviado">Enviado</span>'
    : p.estado === 'error' ? '<span class="chip error">Error</span>'
    : p.estado === 'en_curso' ? '<span class="chip curso">En curso</span>' : '<span class="chip pendiente">Pendiente</span>';
  const ini = primeraHora(p);
  const t = tipoDe(p);
  const det = t.maquina ? (p.faena || '') + (p.clase ? ' · ' + p.clase : '') : t.cereal ? (p.cereal || '')
    : t.terceros ? (p.faena || '') + (p.clase ? ' · ' + p.clase : '')
    : t.tratamiento ? (p.faena || '') + ((p.productos || []).length ? ' · ' + p.productos.length + ' producto' + (p.productos.length === 1 ? '' : 's') : '') : '';
  return `<li data-id="${esc(p.id)}"><div class="txt"><b>${t.icono} ${esc(fechaES(p.fecha))} · ${esc(p.empresa || 'Sin empresa')}</b>
    <span>${esc(t.corto)}${det ? ' · ' + esc(det) : ''} · ${n} parcela${n === 1 ? '' : 's'}${p.estado === 'en_curso' && ini ? ' · desde ' + ini : ''}</span></div>${chip}</li>`;
}
['listaCurso', 'listaPendientes', 'listaEnviados'].forEach(id => $(id).addEventListener('click', async e => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const p = await BD.parte(li.dataset.id);
  if (p && p.tipo === 'horas') abrirHoras(p); else abrirParte(p);
}));

function pintarTipos() {
  $('tiposParte').innerHTML = Object.entries(TIPOS).map(([k, t]) =>
    `<button type="button" class="tipo" data-tipo="${k}"><span>${t.icono}</span>${esc(t.nombre)}</button>`).join('') +
    `<button type="button" class="tipo" data-tipo="horas"><span>⏱</span>Mis horas</button>` +
    PROXIMOS.map(([i, n]) => `<button type="button" class="tipo pronto" disabled><span>${i}</span>${esc(n)}<small>Próximamente</small></button>`).join('');
}
$('tiposParte').addEventListener('click', e => { const b = e.target.closest('button[data-tipo]'); if (!b) return; if (b.dataset.tipo === 'horas') nuevasHoras(); else nuevoParte(b.dataset.tipo); });
async function nuevoParte(tipo) {
  const t = TIPOS[tipo];
  const curso = (await BD.partes()).filter(p => p.estado === 'en_curso' && ((p.tipo || 'maquina') === tipo));
  if (curso.length && !confirm(`Ya tienes un parte de ${t.corto} en curso (${curso[0].empresa || 'sin empresa'}). ¿Empezar otro distinto?`)) {
    return abrirParte(curso[0]);
  }
  const ult = (await BD.leer('ultimosValores')) || {};
  abrirParte({
    id: uuid(), tipo, estado: 'nuevo', fecha: hoy(), hora_inicio: '', hora_fin: '',
    id_empresa: null, empresa: '', clase: t.maquina || t.terceros ? (ult.clase || '') : '', faena: '', maquina: t.tratamiento ? (ult.equipo || '') : '',
    cereal: t.cereal ? (ult.cereal || '') : '', riego: t.cereal ? (ult.riego || '') : '',
    productos: [], problema: '',
    kilos: '', observaciones: '', gps: null, lineas: [], activa: null, creado_movil: null
  });
}

// ---------- tiempos ----------
const hhmm = iso => iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
const r2 = n => Math.round(n * 100) / 100;
function horasReloj(l) {
  return (l.tramos || []).reduce((s, t) => s + ((t.fin ? new Date(t.fin) : new Date()) - new Date(t.inicio)) / 36e5, 0);
}
function horasLinea(l) { return l.horas_mano != null && l.horas_mano !== '' ? +l.horas_mano : horasReloj(l); }
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
  // Kilos transportados: se escriben a mano. En Vendimiadora y Cosechadora, si se dejan en blanco,
  // valen la suma de las parcelas apuntadas en Kilos.
  const suma = r2(parte.lineas.reduce((s, l) => s + (esKilos(l.unidad) ? (+l.cantidad || 0) : 0), 0));
  const v = $('pKilos').value, kt = v === '' ? '' : r2(Math.max(0, +v || 0));
  const sumaLin = r2(parte.lineas.reduce((s, l) => s + (+l.kilos || 0), 0));
  parte.kilos_mano = kt;
  parte.kilos = kt === '' && tipoDe(parte).maquina && sumaLin ? sumaLin : kt;   // Máquina: en blanco = suma de los kilos de las parcelas
  parte.kilos_parcelas = suma;      // Vendimiadora/Cosechadora: lo vendimiado/cosechado (suma de parcelas), solo para ver
  $('pKilos').placeholder = tipoDe(parte).maquina && sumaLin ? fmt(sumaLin) + ' (suma de las parcelas)' : '0';
  $('kilosSuma').textContent = fmt(parte.kilos_parcelas || 0) + ' kg';
  if (tipoDe(parte).tratamiento && !document.activeElement.closest?.('#listaProductos')) pintarProductos();
}
let reloj = null;
function arrancarReloj() { pararReloj(); reloj = setInterval(() => { if (parte) { recalcular(); pintarActiva(); } }, 30000); }
function pararReloj() { if (reloj) { clearInterval(reloj); reloj = null; } }

// ---------- formulario de parte ----------
function soloLectura() { return parte && parte.estado === 'enviado'; }
function enCurso() { return parte && (parte.estado === 'en_curso' || parte.estado === 'nuevo'); }

function abrirParte(p) {
  parte = JSON.parse(JSON.stringify(p));
  if (!parte.tipo) parte.tipo = 'maquina';
  for (const l of parte.lineas) if (!l.tramos) l.tramos = [];
  const t = tipoDe(parte);
  $('bloqueMaquina').classList.toggle('oculto', !t.maquina);
  $('bloqueCereal').classList.toggle('oculto', !t.cereal);
  $('bloqueTrat').classList.toggle('oculto', !t.tratamiento);
  $('bloqueTerceros').classList.toggle('oculto', !t.terceros);
  $('tarjetaProductos').classList.toggle('oculto', !t.tratamiento);
  $('bloqueKilos').classList.toggle('oculto', !!t.tratamiento || !!t.terceros);
  if (!parte.productos) parte.productos = [];
  $('pProblema').value = parte.problema || '';
  $('kilosTxt').textContent = t.kilos;
  // Vendimiadora/Cosechadora: arriba los kilos vendimiados/cosechados (suma de parcelas) y debajo los transportados (a mano)
  $('kilosAuto').classList.toggle('oculto', !!t.maquina); $('kilosNota').classList.toggle('oculto', !!t.maquina);
  $('kilosManual').classList.remove('oculto');
  $('kilosManualTxt').textContent = 'Kilos transportados';
  const kt = parte.kilos_mano !== undefined ? parte.kilos_mano : (parte.kilos_transportados != null && parte.kilos_transportados !== '' && !t.maquina ? parte.kilos_transportados : parte.kilos);
  $('pKilos').value = kt !== '' && kt != null && +kt > 0 ? kt : '';
  const nuevo = parte.estado === 'nuevo';
  const ro = soloLectura();
  mostrar('vParte', nuevo ? 'Nuevo parte' : ro ? 'Parte enviado' : parte.estado === 'en_curso' ? 'Parte en curso' : 'Parte terminado',
    t.icono + ' ' + t.corto + (nuevo ? '' : ' · ' + fechaES(parte.fecha) + ' · ' + (parte.empresa || '')));
  $('pFecha').value = parte.fecha;
  $('pObs').value = parte.observaciones || '';
  pintarSelector('pEmpresa', parte.empresa, 'Elegir empresa…');
  pintarSelector('pClase', parte.clase, 'Elegir máquina…');
  pintarSelector('pClaseT', parte.clase, 'Elegir máquina…');
  pintarSelector('pFaena', parte.faena, 'Elegir tipo de trabajo…');
  pintarSelector('pCereal', parte.cereal, 'Elegir cereal…');
  pintarSelector('pTarea', parte.faena, 'Elegir tipo de tarea…');
  pintarSelector('pTipoTrabajo', parte.faena, 'Elegir tipo de trabajo…');
  pintarSelector('pEquipo', parte.maquina, 'Elegir equipo…');
  pintarProductos();
  pintarRiego();
  recalcular();
  pintarParcelas();
  pintarGps();
  $('parteError').textContent = parte.estado === 'error' ? 'No se pudo enviar: ' + (parte.error || '') : '';
  $('parteError').classList.toggle('oculto', parte.estado !== 'error');
  pintarAvisoCurso();

  $('formParte').querySelectorAll('input, select, textarea, button').forEach(el => { if (el.id !== 'gpsMapa' && !el.hasAttribute('data-volver')) el.disabled = ro; });
  $('btnGuardar').classList.toggle('oculto', ro);
  $('btnTerminar').classList.toggle('oculto', ro);
  $('btnTerminar').textContent = enCurso() ? '✔ Terminar y enviar' : '⇪ Enviar';
  $('btnBorrarParte').classList.toggle('oculto', nuevo || ro);
  $('ayudaParcelas').classList.toggle('oculto', ro || !enCurso());
  if (nuevo) tomarGps();
  if (enCurso()) { arrancarReloj(); if (lineaActiva()) vigilar(); }
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
  $('selTitulo').textContent = { empresas: 'Empresa / cliente', faenas: 'Tipo Trabajo', clases: 'Máquina', cereales: 'Cereal', tareas: 'Tipo de tarea', tipotrabajo: 'Tipo Trabajo',
    equipos: 'Equipo', productos: 'Producto', fichas: 'Ver ficha oficial del producto', irParcela: '🧭 Ir a la parcela (Google Maps)', parcelas: 'Parcela de ' + (parte.empresa || '') }[lista];
  $('selBuscar').value = '';
  pintarSel();
  abrirDlg('dlgSelector');
  if ((lista === 'parcelas' || lista === 'irParcela' ? parcelasEmpresa() : listaCat(lista)).length > 8) setTimeout(() => $('selBuscar').focus(), 50);
}
function pintarSel() {
  const q = normal($('selBuscar').value);
  if (selActual === 'parcelas') {
    const apunt = new Set(parte.lineas.map(claveLinea));
    const items = parcelasEmpresa().filter(p => !q || normal(`${p.poligono} ${p.parcela} ${p.paraje} ${p.tipo_cultivo} pol ${p.poligono} parc ${p.parcela}`).includes(q));
    $('selLista').innerHTML = items.map(p =>
      `<li data-id="${p.id_parcela}" class="${apunt.has(String(p.id_parcela)) ? 'marcado' : ''}"><div class="txt"><b>${esc(nombreParcela(p))}</b>
        <span>${esc(p.paraje || '')}${p.tipo_cultivo ? ' · ' + esc(p.tipo_cultivo) : ''}${p.superficie ? ' · ' + fmt(p.superficie) + ' ha' : ''}${apunt.has(String(p.id_parcela)) ? ' · ya apuntada' : ''}</span></div></li>`
    ).join('') + (items.length ? '' : '<li class="vacio">Ninguna parcela coincide con la búsqueda</li>') +
      `<li data-id="__otra" class="otra"><div class="txt"><b>📍 No está en la lista</b><span>Se busca con el GPS dónde estás (Catastro)</span></div></li>`;
    return;
  }
  if (selActual === 'irParcela') {
    // primero las del parte (la activa marcada), después el resto de parcelas de la empresa
    const enParte = new Set(parte.lineas.map(l => String(l.id_parcela)));
    const lin = parte.lineas.filter(l => tieneMapa(l)).map(l => ({ id: 'L:' + l.id, b: nombreParcela(l), s: [l.paraje, 'en este parte'].filter(Boolean).join(' · '), act: l.id === parte.activa }));
    const otras = parcelasEmpresa().filter(p => !enParte.has(String(p.id_parcela)) && p.sigpac)
      .map(p => ({ id: 'P:' + p.id_parcela, b: nombreParcela(p), s: [p.paraje, p.tipo_cultivo, p.superficie ? fmt(p.superficie) + ' ha' : ''].filter(Boolean).join(' · ') }));
    const items = lin.concat(otras).filter(x => !q || normal(x.b + ' ' + x.s + ' ' + x.b.replace(/\D+/g, ' ')).includes(q));
    $('selLista').innerHTML = items.length ? items.map(x =>
      `<li data-id="${x.id}" class="${x.act ? 'marcado' : ''}"><div class="txt"><b>${esc(x.b)}</b><span>${esc(x.s)}</span></div></li>`).join('')
      : '<li class="vacio">' + (lin.length + otras.length ? 'Ninguna parcela coincide con la búsqueda' : 'No hay parcelas con ubicación para esta empresa') + '</li>';
    return;
  }
  const actual = { empresas: parte.empresa, faenas: parte.faena, clases: parte.clase, cereales: parte.cereal, tareas: parte.faena, tipotrabajo: parte.faena, equipos: parte.maquina }[selActual];
  const yaProd = new Set((parte.productos || []).map(x => String(x.id_producto)));
  const items = listaCat(selActual).filter(x => !q || normal(x.nombre + ' ' + (x.cif || '') + ' ' + (x.registro || '')).includes(q));
  const sub = x => selActual === 'productos'
    ? [x.registro ? 'Reg. ' + x.registro : '', x.dosis ? 'Dosis ' + fmt(x.dosis) + '/ha' : '', yaProd.has(String(x.id)) ? 'ya añadido' : ''].filter(Boolean).join(' · ')
    : selActual === 'fichas' ? (x.registro ? '📄 Reg. ' + x.registro : 'Sin nº de registro (no hay ficha oficial)')
    : (x.localidad || '');
  const sinNada = (selActual === 'clases' || selActual === 'equipos') && !q
    ? `<li data-id="__ninguna" class="${actual ? '' : 'marcado'}"><div class="txt"><b>— Sin ${selActual === 'clases' ? 'máquina' : 'equipo'} —</b><span>Dejar en blanco</span></div></li>` : '';
  $('selLista').innerHTML = sinNada + (items.length ? items.map(x =>
    `<li data-id="${x.id}" class="${x.nombre === actual || (selActual === 'productos' && yaProd.has(String(x.id))) ? 'marcado' : ''}"><div class="txt"><b>${esc(x.nombre)}</b>${sub(x) ? `<span>${esc(sub(x))}</span>` : ''}</div></li>`
  ).join('') : '<li class="vacio">' + (listaCat(selActual).length ? 'Nada coincide con la búsqueda' : 'La lista está vacía: pide en la oficina que pulsen "Enviar listas al móvil"') + '</li>');
}
$('selBuscar').addEventListener('input', pintarSel);
$('selCerrar').addEventListener('click', () => cerrarDlg('dlgSelector'));
$('selLista').addEventListener('click', e => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  if (selActual === 'irParcela') {
    cerrarDlg('dlgSelector');
    const [t, id] = [li.dataset.id.slice(0, 1), li.dataset.id.slice(2)];
    const destino = t === 'L' ? parte.lineas.find(l => l.id === id) : cat.parcelas.find(p => String(p.id_parcela) === id);
    return destino && abrirMapa(destino, true, true);
  }
  if (selActual === 'parcelas') {
    cerrarDlg('dlgSelector');
    if (li.dataset.id === '__otra') return parcelaPorGps();
    return empezarEn(li.dataset.id);
  }
  if (li.dataset.id === '__ninguna') {
    if (selActual === 'clases') { parte.clase = ''; pintarSelector('pClase', '', 'Elegir máquina…'); pintarSelector('pClaseT', '', 'Elegir máquina…'); }
    else { parte.maquina = ''; pintarSelector('pEquipo', '', 'Elegir equipo…'); }
    cerrarDlg('dlgSelector'); autoguardar(); return;
  }
  const x = listaCat(selActual).find(i => String(i.id) === li.dataset.id);
  if (selActual === 'fichas') { cerrarDlg('dlgSelector'); return abrirFicha(x.registro, x.nombre, x.ficha); }
  if (selActual === 'productos') {
    if (parte.productos.some(pr => String(pr.id_producto) === String(x.id))) { cerrarDlg('dlgSelector'); return toast('Ese producto ya está en el parte'); }
    parte.productos.push({ id_producto: x.id, producto: x.nombre, registro: x.registro || '', dosis_ha: x.dosis ? +x.dosis : '' });
    cerrarDlg('dlgSelector'); pintarProductos(); autoguardar();
    setTimeout(() => { const inp = $('listaProductos').querySelector('li:last-child input'); if (inp && !inp.value) inp.focus(); }, 80);
    return;
  }
  if (selActual === 'empresas') {
    if (parte.id_empresa !== x.id && parte.lineas.length &&
        !confirm('Has cambiado de empresa. Se quitarán las parcelas apuntadas. ¿Continuar?')) return;
    if (parte.id_empresa !== x.id) { parte.lineas = []; parte.activa = null; }
    parte.id_empresa = x.id; parte.empresa = x.nombre;
    pintarSelector('pEmpresa', x.nombre); pintarParcelas();
  } else if (selActual === 'faenas') {
    parte.faena = x.nombre; pintarSelector('pFaena', x.nombre);
  } else if (selActual === 'tipotrabajo') {
    parte.faena = x.nombre; pintarSelector('pTipoTrabajo', x.nombre);
  } else if (selActual === 'tareas') {
    parte.faena = x.nombre; pintarSelector('pTarea', x.nombre);
  } else if (selActual === 'equipos') {
    parte.maquina = x.nombre; pintarSelector('pEquipo', x.nombre);
  } else if (selActual === 'cereales') {
    parte.cereal = x.nombre; pintarSelector('pCereal', x.nombre);
    for (const l of parte.lineas) l.tipo_cereal = x.nombre;
  } else {
    parte.clase = x.nombre; pintarSelector('pClase', x.nombre); pintarSelector('pClaseT', x.nombre);
  }
  cerrarDlg('dlgSelector');
  autoguardar();
});
// listas del selector (equipos = tabla Maquinaria)
// Máquina (clases) y Equipo salen de la tabla Maquinaria (FrmMaquinariaTratamientos)
function listaCat(lista) { return ((cat || {})[{ equipos: 'maquinas', clases: 'maquinas', fichas: 'productos' }[lista] || lista]) || []; }

// --- ficha oficial (Registro de Productos Fitosanitarios del Ministerio) ---
const URL_REGFI = 'https://servicio.mapa.gob.es/regfiweb/Productos/Index';
const URL_FICHA = 'https://servicio.mapa.gob.es/regfiweb/Productos/ExportFichaProductoPdfGet?idProducto=';
function fichaDe(idProducto, registro) {
  const prods = listaCat('productos');
  const x = prods.find(p => String(p.id) === String(idProducto)) || prods.find(p => registro && String(p.registro || '').trim() === String(registro).trim());
  return x && x.ficha ? x.ficha : null;
}
function abrirFicha(registro, nombre, ficha) {
  registro = String(registro || '').trim();
  if (ficha) {
    const pdf = URL_FICHA + encodeURIComponent(ficha);
    $('fichaTitulo').textContent = nombre || ('Reg. ' + registro);
    $('fichaPdf').href = pdf;
    $('fichaCargando').classList.remove('oculto');
    $('fichaMarco').onload = () => $('fichaCargando').classList.add('oculto');
    $('fichaMarco').src = 'https://docs.google.com/viewer?embedded=true&url=' + encodeURIComponent(pdf);
    return abrirDlg('dlgFicha');
  }
  if (!registro) return toast((nombre ? nombre + ': ' : '') + 'sin nº de registro, no hay ficha oficial', 3500);
  try { navigator.clipboard && navigator.clipboard.writeText(registro).catch(() => {}); } catch (e) {}
  window.open(URL_REGFI, '_blank', 'noopener');
  toast('Nº de registro ' + registro + ' copiado: pégalo en el buscador del Ministerio', 5000);
}

// --- productos del tratamiento (los mismos para todas las parcelas del parte) ---
function haParte() { return parte.lineas.reduce((s, l) => s + (/^hect/i.test(l.unidad || '') ? (+l.cantidad || 0) : (+l.superficie || 0)), 0); }
function pintarProductos() {
  if (!tipoDe(parte).tratamiento) return;
  const ro = soloLectura(), ha = haParte();
  $('listaProductos').innerHTML = parte.productos.map((p, i) => `<li data-i="${i}">
    <div class="txt"><b>${esc(p.producto)}</b><span>${p.registro ? 'Reg. ' + esc(p.registro) : 'Sin nº de registro'}</span></div>
    <div class="fila3">
      <label class="dosis"><span>Dosis/ha</span><input type="number" inputmode="decimal" step="any" min="0" placeholder="0" value="${esc(p.dosis_ha)}" data-campo="dosis" ${ro ? 'disabled' : ''}></label>
      <div class="litros"><span>Litros/Kg</span><b>${p.dosis_ha ? fmt(Math.round(p.dosis_ha * 100) / 100) : '—'}</b><small>1 ha</small></div>
      <div class="litros"><span>Litros/Kg</span><b>${p.dosis_ha && ha ? fmt(Math.round(p.dosis_ha * ha * 100) / 100) : '—'}</b><small>${ha ? fmt(Math.round(ha * 100) / 100) + ' ha' : 'sin ha'}</small></div>
    </div>
    ${p.registro ? '<button type="button" class="ficha" data-accion="fichaProd" aria-label="Ver ficha oficial">📄 Ficha</button>' : ''}
    ${ro ? '' : '<button type="button" class="quitar" data-accion="quitarProd" aria-label="Quitar producto">✕</button>'}</li>`).join('') ||
    `<li class="vacio">${ro ? 'Sin productos.' : 'Añade los productos que llevas en la cuba (puedes hacerlo en el almacén, antes de salir).'}</li>`;
  $('btnAddProducto').classList.toggle('oculto', ro);
}
$('btnAddProducto').addEventListener('click', () => abrirSelector('productos'));
$('fichaCerrar').addEventListener('click', () => { cerrarDlg('dlgFicha'); $('fichaMarco').src = 'about:blank'; });
$('listaProductos').addEventListener('change', e => {
  if (e.target.dataset.campo !== 'dosis') return;
  const p = parte.productos[+e.target.closest('li').dataset.i]; if (!p) return;
  p.dosis_ha = e.target.value === '' ? '' : Math.max(0, +e.target.value || 0);
  pintarProductos(); autoguardar();
});
$('listaProductos').addEventListener('click', e => {
  const f = e.target.closest('[data-accion="fichaProd"]');
  if (f) { const pf = parte.productos[+f.closest('li').dataset.i]; return abrirFicha(pf.registro, pf.producto, fichaDe(pf.id_producto, pf.registro)); }
  const b = e.target.closest('[data-accion="quitarProd"]'); if (!b) return;
  const i = +b.closest('li').dataset.i;
  if (!confirm('¿Quitar ' + parte.productos[i].producto + ' del parte?')) return;
  parte.productos.splice(i, 1); pintarProductos(); autoguardar();
});
$('pProblema').addEventListener('change', () => { parte.problema = $('pProblema').value.trim(); autoguardar(); });

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
  const bi = $('activaBusca'); let txt = '';
  if (l.id_parcela == null) {
    if (l._busca === 'gps' || (l.lat == null && l._busca !== 'sinGps')) txt = '📍 Buscando dónde estás con el GPS…';
    else if (l._busca === 'sinGps') txt = '⚠ No se pudo tomar el GPS. Sal a cielo abierto y pulsa "Volver aquí"; si no, se buscará en la oficina.';
    else if (l._busca === 'catastro') txt = '🔎 Buscando la parcela en el Catastro…';
    else if (l.catastro) txt = '✔ Catastro: ' + [l.poligono ? 'Pol. ' + l.poligono + ' · Parc. ' + l.parcela : '', l.paraje, l.catastro.municipio,
                                l.superficie ? fmt(l.superficie) + ' ha' : '', l.tipo_cultivo].filter(Boolean).join(' · ');
    else if (!navigator.onLine) txt = '📶 Sin cobertura: se buscará en el Catastro al volver la conexión.';
    else txt = '⚠ No se encontró en el Catastro con este GPS. En la oficina se revisará con la ubicación guardada.';
  }
  bi.textContent = txt; bi.classList.toggle('oculto', !txt);
}

const CAJA_ACTIVA = document.getElementById('parcelaActiva');
function pintarParcelas() {
  const ul = $('listaParcelas');
  ul.before(CAJA_ACTIVA);                      // sacarla antes de rehacer la lista
  const ro = soloLectura();
  pintarActiva();
  $('btnElegirParcela').classList.toggle('oculto', ro);
  $('btnElegirParcela').textContent = parte.lineas.length ? '▶ Empezar en otra parcela' : '▶ Elegir parcela y empezar';
  if (!parte.id_empresa) {
    ul.innerHTML = ro ? '' : '<li class="nota">Elige primero la empresa.</li>';
    $('resumenParcelas').textContent = ''; return;
  }
  ul.innerHTML = parte.lineas.map(l => htmlParcela(l, l)).join('') ||
    (ro ? '<li class="nota">Sin parcelas.</li>' : '');
  // el recuadro "Trabajando en…" va justo debajo de la parcela en la que se trabaja
  const act = ul.querySelector('li.trabajando');
  if (act) { const h = document.createElement('li'); h.className = 'hueco-activa'; h.appendChild(CAJA_ACTIVA); act.after(h); }
  resumenParcelas();
}
function htmlParcela(p, linea) {
  const ro = soloLectura();
  const clave = linea ? claveLinea(linea) : String(p.id_parcela);
  const manual = linea && linea.id_parcela == null;
  const activa = linea && linea.id === parte.activa;
  const info = `${esc(p.paraje || '')}${p.tipo_cultivo ? ' · ' + esc(p.tipo_cultivo) : ''}${p.superficie ? ' · ' + fmt(p.superficie) + ' ha' : ''}`;
  const unidades = cat.unidades.map(u => `<option ${linea.unidad === u.nombre ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('');
  const h = horasLinea(linea);
  return `<li data-clave="${esc(clave)}" class="marcada ${activa ? 'trabajando' : ''}">
    <div class="cab"><span class="txt"><b>${esc(nombreParcela(p))}</b><span>${info}</span>
      ${linea.tramos.length ? `<span class="tiempos">⏱ ${esc(textoTramos(linea))} · ${duracion(horasReloj(linea))}${linea.lat != null ? ' · 📍' : ''}</span>` : ''}
      ${linea.horas_mano != null && linea.horas_mano !== '' ? `<span class="aviso-mano">✎ Horas puestas a mano: ${fmt(linea.horas_mano)} h</span>` : ''}
      ${manual ? `<span class="manual">AÑADIDA A MANO · ${linea.catastro ? '📍 DATOS DEL CATASTRO' + (linea.catastro.municipio ? ' (' + esc(linea.catastro.municipio) + ')' : '') : linea.lat != null ? 'SE BUSCARÁ EN EL CATASTRO' : 'SIN UBICACIÓN'}</span>` : ''}
      ${linea.aviso_catastro ? `<span class="aviso-mano">⚠ ${esc(linea.aviso_catastro)}</span>` : ''}</span></div>
    <div class="cant">
      <input type="number" inputmode="decimal" step="any" min="0" placeholder="${esHoras(linea.unidad) ? 'Horas' : 'Cantidad'}" value="${esc(linea.cantidad)}" data-campo="cantidad" ${ro ? 'disabled' : ''}>
      <select data-campo="unidad" ${ro ? 'disabled' : ''}>${unidades}</select></div>
    ${tipoDe(parte).maquina ? `<label class="kilos-linea">Kilos de esta parcela<input type="number" inputmode="decimal" step="any" min="0" placeholder="0" value="${esc(linea.kilos == null ? '' : linea.kilos)}" data-campo="kilos" ${ro ? 'disabled' : ''}></label>` : ''}
    ${tieneMapa(linea) ? `<div class="mapas">
      <button type="button" data-accion="mapaCat">🗺 Mapa Catastro</button>
      <button type="button" data-accion="mapaGoogle">📍 Google Maps</button>
      ${linea.id_parcela != null ? `<button type="button" data-accion="entrada">📌 ${entradaDe(linea.id_parcela) ? 'Cambiar entrada' : 'Guardar entrada'}</button>` : ''}</div>` : ''}
    ${ro ? '' : `<div class="acciones">
      ${activa ? '' : `<button type="button" class="secundario" data-accion="empezar">▶ ${linea.tramos.length ? 'Volver aquí' : 'Empezar aquí'}</button>`}
      <button type="button" class="lapiz" data-accion="horas">✎ Horas</button>
      <button type="button" class="quitar" data-accion="quitar" aria-label="Quitar parcela">✕</button></div>
    ${linea._editHoras ? `<div class="horas-mano"><input type="number" inputmode="decimal" step="0.25" min="0" placeholder="Horas reales (ej. 2,5)" value="${esc(linea.horas_mano == null ? '' : linea.horas_mano)}" data-campo="horas_mano">
      <button type="button" class="mini" data-accion="horasok">Guardar</button></div>` : ''}`}
  </li>`;
}
function resumenParcelas() {
  const n = parte.lineas.length;
  const h = parte.lineas.reduce((s, l) => s + horasLinea(l), 0);
  $('resumenParcelas').textContent = n ? `${n} parcela${n === 1 ? '' : 's'}${h ? ' · ' + duracion(h) : ''}` : '';
}
$('btnElegirParcela').addEventListener('click', () => {
  if (!parte.id_empresa) return toast('Elige primero la empresa');
  abrirSelector('parcelas');
});

// Empezar a trabajar en una parcela: cierra la anterior, abre un tramo nuevo y guarda el GPS
async function empezarEn(clave, yaPreguntado) {
  if (!parte.id_empresa) return toast('Elige primero la empresa');
  const act = lineaActiva();
  if (act && claveLinea(act) === clave) return toast('Ya estás trabajando en esta parcela');
  if (act && !yaPreguntado) return abrirTerminar({ luego: clave });   // primero terminar la anterior, con su hora
  const ahora = new Date().toISOString();
  if (act) { const t = act.tramos[act.tramos.length - 1]; if (t && !t.fin) t.fin = ahora; }
  let l = parte.lineas.find(x => claveLinea(x) === clave);
  if (!l) {
    const p = cat.parcelas.find(x => String(x.id_parcela) === clave);
    const ult = (await BD.leer('ultimosValores')) || {};
    const unidad = tipoDe(parte).unidad || ult.unidad || 'Hectareas';
    l = { id: uuid(), id_parcela: p.id_parcela, poligono: p.poligono, parcela: p.parcela, paraje: p.paraje,
          tipo_cultivo: p.tipo_cultivo, superficie: p.superficie, sigpac: p.sigpac,
          cantidad: /^hect/i.test(unidad) ? num(p.superficie) : '', unidad, observaciones: '',
          lat: null, lon: null, precision: null, tramos: [], tipo_cereal: parte.cereal || '', cereal: parte.riego || '' };
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
  vigilar();
  autoguardar(true);
}
// GPS de la parcela: la primera vez que se empieza en ella
function ubicarLinea(l) {
  if (l.lat != null || !('geolocation' in navigator)) return;
  if (l.id_parcela == null) { l._busca = 'gps'; pintarActiva(); }
  navigator.geolocation.getCurrentPosition(pos => {
    l.lat = pos.coords.latitude; l.lon = pos.coords.longitude; l.precision = pos.coords.accuracy;
    if (l.id_parcela == null) l._busca = navigator.onLine ? 'catastro' : '';
    if (!parte.gps) parte.gps = { lat: l.lat, lon: l.lon, precision: l.precision, fecha: new Date(pos.timestamp).toISOString() };
    if (parte && parte.lineas.includes(l)) {
      pintarParcelas(); pintarGps(); autoguardar(true);
      if (l.id_parcela == null) completarConCatastro(l, true); else comprobarCatastro(l);
    }
  }, () => { if (l.id_parcela == null) { l._busca = 'sinGps'; if (parte && parte.lineas.includes(l)) pintarActiva(); }
             toast('No se pudo tomar la ubicación de la parcela'); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
}
function parar() { abrirTerminar({}); }

// ---------- terminar en una parcela (con la hora real) ----------
let terOpc = null;
function abrirTerminar(opc) {
  const l = lineaActiva(); if (!l) { if (opc.luego) return empezarEn(opc.luego, true); return; }
  terOpc = Object.assign({ linea: l }, opc);
  const t = l.tramos[l.tramos.length - 1];
  $('terTitulo').textContent = '✔ Terminar en ' + nombreParcela(l);
  $('terTexto').innerHTML = (opc.texto ? opc.texto + '<br>' : '') +
    'Entraste a las <b>' + hhmm(t.inicio) + '</b>.' + (opc.luego ? ' Después empezarás en la parcela nueva.' : '');
  $('terHora').value = opc.hora ? hhmm(opc.hora) : hhmm(new Date().toISOString());
  $('terError').classList.add('oculto');
  $('terSigo').classList.toggle('oculto', !!opc.luego);
  abrirDlg('dlgTerminar');
}
$('terCerrar').addEventListener('click', () => { cerrarDlg('dlgTerminar'); terOpc = null; });
$('terSigo').addEventListener('click', () => {
  if (terOpc && terOpc.gps) terOpc.linea._silencio = Date.now() + 15 * 60000;   // no volver a avisar en 15 min
  cerrarDlg('dlgTerminar'); terOpc = null;
});
$('formTerminar').addEventListener('submit', e => {
  e.preventDefault();
  if (!terOpc) return cerrarDlg('dlgTerminar');
  const l = terOpc.linea, t = l.tramos[l.tramos.length - 1];
  const [hh, mm] = $('terHora').value.split(':').map(Number);
  const fin = new Date(t.inicio); fin.setHours(hh, mm, 0, 0);
  const err = msg => { $('terError').textContent = msg; $('terError').classList.remove('oculto'); };
  if (isNaN(fin)) return err('Pon la hora.');
  if (fin < new Date(t.inicio) && fin > new Date(new Date(t.inicio).getTime() - 60000)) fin.setTime(new Date(t.inicio).getTime()); // mismo minuto
  if (fin < new Date(t.inicio)) return err('No puede ser antes de la hora de entrada (' + hhmm(t.inicio) + ').');
  if (fin > new Date(Date.now() + 60000)) return err('No puede ser una hora que aún no ha llegado.');
  t.fin = fin.toISOString();
  parte.activa = null; l._fuera = 0; l._salida = null;
  pararVigilancia();
  cerrarDlg('dlgTerminar');
  const o = terOpc; terOpc = null;
  recalcular(); pintarParcelas();
  toast('✔ Terminado en ' + nombreParcela(l) + ' a las ' + hhmm(t.fin) + ' (' + duracion(horasLinea(l)) + ')');
  autoguardar(true);
  if (o.luego) empezarEn(o.luego, true);
  if (o.despues) o.despues();
});

// ---------- aviso si se sale de la parcela (GPS) ----------
const UMBRAL_M = 300;            // distancia al punto de entrada a partir de la cual se avisa
let vigila = null, audioCtx = null;
function distancia(a1, o1, a2, o2) {
  const R = 6371000, r = x => x * Math.PI / 180;
  const da = r(a2 - a1), dO = r(o2 - o1);
  const h = Math.sin(da / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(dO / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function vigilar() {
  pararVigilancia();
  if (!('geolocation' in navigator) || !lineaActiva()) return;
  vigila = navigator.geolocation.watchPosition(pos => {
    const l = parte && lineaActiva(); if (!l || l.lat == null) return;
    const c = pos.coords; if (c.accuracy > 60) return;
    const d = distancia(l.lat, l.lon, c.latitude, c.longitude);
    if (d > UMBRAL_M) {
      l._fuera = (l._fuera || 0) + 1;
      if (!l._salida) l._salida = new Date(pos.timestamp).toISOString();
      const silencio = l._silencio && Date.now() < l._silencio;
      if (l._fuera >= 2 && !silencio && $('dlgTerminar').classList.contains('oculto')) {
        avisar();
        const ini = l.tramos[l.tramos.length - 1].inicio;
        abrirTerminar({ gps: true, hora: (new Date(l._salida) > new Date(ini) ? l._salida : new Date().toISOString()),
          texto: '📍 <b>Parece que has salido de esta parcela</b> (estás a ' + Math.round(d) + ' m). Si ya terminaste, comprueba la hora.' });
      }
    } else if (d < UMBRAL_M * 0.6) { l._fuera = 0; l._salida = null; }
  }, () => {}, { enableHighAccuracy: true, maximumAge: 20000, timeout: 60000 });
}
function pararVigilancia() { if (vigila !== null) { navigator.geolocation.clearWatch(vigila); vigila = null; } }
function prepararSonido() {
  try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {}
}
document.addEventListener('click', prepararSonido, { passive: true });
function avisar() {
  try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {}
  try {
    prepararSonido(); if (!audioCtx) return;
    [0, 0.35, 0.7].forEach(tm => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.type = 'square'; g.gain.value = 0.25;
      o.connect(g); g.connect(audioCtx.destination);
      o.start(audioCtx.currentTime + tm); o.stop(audioCtx.currentTime + tm + 0.22);
    });
  } catch (e) {}
}
$('btnParar').addEventListener('click', parar);

$('listaParcelas').addEventListener('click', e => {
  const b = e.target.closest('button[data-accion]'); if (!b) return;
  const clave = b.closest('li[data-clave]').dataset.clave;
  if (b.dataset.accion === 'mapaCat' || b.dataset.accion === 'mapaGoogle') {
    const l = parte.lineas.find(x => claveLinea(x) === clave); if (l) abrirMapa(l, b.dataset.accion === 'mapaGoogle');
    return;
  }
  if (b.dataset.accion === 'entrada') {
    const l = parte.lineas.find(x => claveLinea(x) === clave); if (l) guardarEntradaAqui(l);
    return;
  }
  if (b.dataset.accion === 'empezar') return empezarEn(clave);
  if (b.dataset.accion === 'horas' || b.dataset.accion === 'horasok') {
    const l = parte.lineas.find(x => claveLinea(x) === clave); if (!l) return;
    if (b.dataset.accion === 'horasok') {
      const v = b.closest('li').querySelector('[data-campo=horas_mano]').value;
      l.horas_mano = v === '' ? null : num(v.replace(',', '.'));
      l._editHoras = false;
      toast(l.horas_mano == null ? 'Horas: se usan las del reloj' : '✎ Horas a mano guardadas: ' + fmt(l.horas_mano) + ' h');
      recalcular(); autoguardar(true);
    } else l._editHoras = !l._editHoras;
    return pintarParcelas();
  }
  if (b.dataset.accion === 'quitar') {
    const idx = parte.lineas.findIndex(l => claveLinea(l) === clave);
    if (idx < 0) return;
    const l = parte.lineas[idx];
    if (l.tramos.length && !confirm('¿Quitar ' + nombreParcela(l) + ' del parte? Se perderán sus horas.')) return;
    if (parte.activa === l.id) { parte.activa = null; pararVigilancia(); }
    parte.lineas.splice(idx, 1);
    recalcular(); pintarParcelas(); autoguardar(true);
  }
});
$('listaParcelas').addEventListener('change', e => {
  const li = e.target.closest('li[data-clave]'); if (!li || !e.target.dataset.campo || e.target.dataset.campo === 'horas_mano') return;
  const l = parte.lineas.find(x => claveLinea(x) === li.dataset.clave); if (!l) return;
  if (e.target.dataset.campo === 'unidad') {
    l.unidad = e.target.value;
    if (esHoras(l.unidad)) { l.cantidad_auto = true; }
    else if (/^hect/i.test(l.unidad) && (l.cantidad === '' || l.cantidad_auto) && l.superficie) { l.cantidad = num(l.superficie); l.cantidad_auto = false; }
    else if (l.cantidad_auto) { l.cantidad = ''; l.cantidad_auto = false; }
    if (tipoDe(parte).maquina || tipoDe(parte).terceros) BD.leer('ultimosValores').then(u => BD.guardar('ultimosValores', Object.assign(u || {}, { unidad: l.unidad })));
  } else if (e.target.dataset.campo === 'kilos') {
    l.kilos = e.target.value === '' ? '' : Math.max(0, num(e.target.value));
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

// Parcela que no está en la lista: se empieza ya y se identifica con el GPS + Catastro
async function parcelaPorGps() {
  const ult = (await BD.leer('ultimosValores')) || {};
  const l = {
    id: uuid(), id_parcela: null, poligono: '', parcela: '', paraje: '', tipo_cultivo: '', superficie: null, sigpac: '',
    cantidad: '', unidad: tipoDe(parte).unidad || ult.unidad || 'Hectareas', observaciones: 'Parcela añadida a mano en el móvil',
    lat: null, lon: null, precision: null, tramos: [], tipo_cereal: parte.cereal || '', cereal: parte.riego || '', _busca: 'gps'
  };
  parte.lineas.push(l);
  empezarEn(claveLinea(l));
}
$('formOtraParcela').addEventListener('submit', async e => {
  e.preventDefault();
  const ult = (await BD.leer('ultimosValores')) || {};
  const l = {
    id: uuid(), id_parcela: null, poligono: $('opPoligono').value.trim(), parcela: $('opParcela').value.trim(),
    paraje: $('opParaje').value.trim(), tipo_cultivo: $('opCultivo').value.trim(), superficie: null, sigpac: '',
    cantidad: '', unidad: tipoDe(parte).unidad || ult.unidad || 'Hectareas', observaciones: 'Parcela añadida a mano en el móvil',
    lat: null, lon: null, precision: null, tramos: [], tipo_cereal: parte.cereal || '', cereal: parte.riego || ''
  };
  parte.lineas.push(l);
  cerrarDlg('dlgParcela');
  empezarEn(claveLinea(l));
});
$('pObs').addEventListener('change', () => { parte.observaciones = $('pObs').value.trim(); autoguardar(); });
$('pKilos').addEventListener('change', () => { recalcular(); autoguardar(); });
$('pFecha').addEventListener('change', () => { parte.fecha = $('pFecha').value; pintarAvisoCurso(); autoguardar(); });


// ---------- Catastro (Sede Electrónica del Catastro, servicio público) ----------
const OVC = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/';
async function pedirXML(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) return null;
        return new DOMParser().parseFromString(await r.text(), 'text/xml'); }
  catch (e) { return null; } finally { clearTimeout(t); }
}
const tx = (doc, tag) => { const e = doc && doc.getElementsByTagName(tag)[0]; return e ? e.textContent.trim() : ''; };
const capital = s => (s || '').toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()).replace(/ (De|La|Las|Los|Del|Y|El)(?= )/g, m => m.toLowerCase());
// Coordenadas -> polígono, parcela, paraje, municipio, cultivo y superficie (ha)
async function consultarCatastro(lat, lon) {
  if (!navigator.onLine || lat == null) return null;
  const d1 = await pedirXML(`${OVC}OVCCoordenadas.asmx/Consulta_RCCOOR?SRS=EPSG:4326&Coordenada_X=${lon}&Coordenada_Y=${lat}`);
  const rc = tx(d1, 'pc1') + tx(d1, 'pc2'); if (!rc) return null;
  const r = { rc, ldt: tx(d1, 'ldt'), poligono: '', parcela: '', paraje: '', municipio: '', cultivo: '', superficie: null, cp: '', cm: '' };
  if (/^\d{5}[A-Z]/.test(rc)) { r.poligono = String(+rc.slice(6, 9)); r.parcela = String(+rc.slice(9, 14)); }
  const d2 = await pedirXML(`${OVC}OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=${rc}`);
  if (d2) {
    r.paraje = tx(d2, 'npa'); r.municipio = capital(tx(d2, 'nm')); r.cp = tx(d2, 'cp'); r.cm = tx(d2, 'cm');
    if (!r.poligono) { r.poligono = tx(d2, 'cpo'); r.parcela = tx(d2, 'cpa'); }
    const sub = [...d2.getElementsByTagName('dspr')];
    const m2 = sub.reduce((s, e) => s + (+tx(e, 'ssp') || 0), 0);
    if (m2) r.superficie = Math.round(m2 / 100) / 100;             // m² -> ha (2 decimales)
    r.cultivo = [...new Set(sub.map(e => capital(tx(e, 'dcc'))).filter(Boolean))].join(', ');
  }
  return r;
}
// Parcela añadida a mano: rellenar con el Catastro y, si ya existe en la lista de la empresa, enlazarla
async function completarConCatastro(l, avisar) {
  if (l.id_parcela != null || l.catastro || l.lat == null) return;
  const c = await consultarCatastro(l.lat, l.lon);
  l._busca = '';
  if (!c) { if (parte && parte.lineas.includes(l)) pintarActiva(); return; }
  if (!parte) return;
  l.catastro = { rc: c.rc, municipio: c.municipio, cp: c.cp, cm: c.cm, ldt: c.ldt };
  if (c.poligono) { l.poligono = c.poligono; l.parcela = c.parcela; }
  if (!l.paraje) l.paraje = c.paraje;
  if (!l.tipo_cultivo) l.tipo_cultivo = c.cultivo;
  if (c.superficie) { l.superficie = c.superficie; if (/^hect/i.test(l.unidad) && l.cantidad === '') l.cantidad = c.superficie; }
  if (c.cp && c.poligono) l.sigpac = `${+c.cp}-${+c.cm}-${c.poligono}-${c.parcela}`;
  // ¿Esa parcela ya está en la lista de la empresa?
  const enLista = parcelasEmpresa().find(p => +p.poligono === +l.poligono && +p.parcela === +l.parcela);
  if (enLista && !parte.lineas.some(x => x.id_parcela === enLista.id_parcela)) {
    Object.assign(l, { id_parcela: enLista.id_parcela, paraje: enLista.paraje, tipo_cultivo: enLista.tipo_cultivo,
      superficie: enLista.superficie, sigpac: enLista.sigpac, observaciones: '', catastro: null });
    if (avisar) toast('📍 Catastro: es ' + nombreParcela(l) + ', que ya está en la lista de la empresa');
  } else if (avisar) {
    toast('📍 Catastro: ' + nombreParcela(l) + (l.paraje ? ' · ' + l.paraje : '') + (l.superficie ? ' · ' + fmt(l.superficie) + ' ha' : ''), 4500);
  }
  if (parte && parte.lineas.includes(l)) { recalcular(); pintarParcelas(); autoguardar(true); }
}
// Parcela de la lista: comprobar que el GPS cae en ella
async function comprobarCatastro(l) {
  if (l.id_parcela == null || l.lat == null || l.aviso_catastro !== undefined) return;
  const c = await consultarCatastro(l.lat, l.lon); if (!c || !parte) return;
  if (!c.poligono) l.aviso_catastro = '';
  else if (+c.poligono === +l.poligono && +c.parcela === +l.parcela) l.aviso_catastro = '';
  else {
    l.aviso_catastro = `El GPS dice Pol. ${c.poligono} · Parc. ${c.parcela}${c.paraje ? ' (' + c.paraje + ')' : ''}`;
    toast('⚠ Ojo: según el Catastro estás en Pol. ' + c.poligono + ' · Parc. ' + c.parcela + ', no en la parcela elegida', 6000);
    avisar();
  }
  if (parte && parte.lineas.includes(l)) { pintarParcelas(); autoguardar(true); }
}
async function catastroPendiente() {
  if (!parte || !navigator.onLine) return;
  for (const l of parte.lineas) {
    if (l.id_parcela == null) await completarConCatastro(l, false); else await comprobarCatastro(l);
  }
}

// --- GPS del parte ---
function pintarGps(buscando) {
  const g = parte.gps;
  if (buscando && !g) $('gpsEstado').textContent = 'Buscando ubicación… (puede tardar unos segundos)';
  else if (!g) $('gpsEstado').textContent = 'Sin ubicación. Pulsa el botón para tomarla.';
  else $('gpsEstado').innerHTML = `${g.lat.toFixed(5)}, ${g.lon.toFixed(5)} · precisión ±${Math.round(g.precision)} m` +
    (buscando ? ' · mejorando…' : '') + `<br><small>${new Date(g.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</small>`;
  $('gpsMapa').classList.toggle('oculto', !g);
  if (g) $('gpsMapa').href = `https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lon}`;
  $('btnGps').textContent = '📍 Tomar ubicación';
  $('btnGps').classList.toggle('oculto', !!g);          // con ubicación ya tomada: Ir a la parcela + Ver en el mapa
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
$('btnIrParcela').addEventListener('click', () => {
  if (!parte.id_empresa && !parte.lineas.length) return toast('Elige primero la empresa');
  abrirSelector('irParcela');
});

// --- guardar / terminar / borrar ---
let tAuto = null;
function autoguardar(yaMismo) {
  if (!parte || soloLectura() || parte.estado === 'nuevo') return;
  clearTimeout(tAuto);
  tAuto = setTimeout(async () => {
    if (!parte) return;
    const copia = JSON.parse(JSON.stringify(parte, (k, v) => (k === '_editHoras' || k === '_busca' ? undefined : v))); if (copia.gps) delete copia.gps._viejo;
    const enBD = await BD.parte(copia.id);
    if (enBD && enBD.estado !== 'en_curso' && enBD.estado !== 'nuevo' && copia.estado === 'en_curso') return;   // ya terminado: no pisarlo
    await BD.guardarParte(copia);
    if (copia.estado === 'en_curso' && navigator.onLine) Sync.guardarBorrador(copia).catch(() => {});
  }, yaMismo ? 0 : 800);
}
function leerFormulario() {
  parte.fecha = $('pFecha').value;
  parte.observaciones = $('pObs').value.trim();
  if (tipoDe(parte).tratamiento) parte.problema = $('pProblema').value.trim();
  recalcular();
}
async function recordarValores() {
  const prev = (await BD.leer('ultimosValores')) || {};
  const ultU = parte.lineas.length ? parte.lineas[parte.lineas.length - 1].unidad : undefined;
  const t = tipoDe(parte);
  await BD.guardar('ultimosValores', Object.assign(prev, t.maquina ? { clase: parte.clase, unidad: ultU || prev.unidad } : t.terceros ? { clase: parte.clase, unidad: ultU || prev.unidad } : {},
    t.cereal && parte.cereal ? { cereal: parte.cereal, riego: parte.riego || '' } : {},
    t.tratamiento && parte.maquina ? { equipo: parte.maquina } : {}));
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
  if ((tipoDe(parte).maquina || tipoDe(parte).terceros) && !parte.faena) faltan.push('el tipo de trabajo');
  if (tipoDe(parte).cereal && !parte.cereal) faltan.push('el cereal');
  if (tipoDe(parte).cereal && !parte.riego) faltan.push('si es secano o riego');
  if (tipoDe(parte).tratamiento && !parte.faena) faltan.push('el tipo de tarea');
  if (tipoDe(parte).tratamiento && !parte.productos.length) faltan.push('algún producto');
  if (faltan.length) { toast('Falta ' + faltan.join(', ')); return; }
  if (parte.fecha > hoy()) { toast('La fecha no puede ser posterior a hoy'); return; }
  if (!parte.lineas.length && !confirm('No has apuntado ninguna parcela. ¿Terminar igualmente?')) return;
  if (enCurso() && !lineaActiva() && !confirm('¿Terminar el parte y enviarlo a la oficina? Después ya no se podrá añadir más parcelas.')) return;

  if (lineaActiva()) return abrirTerminar({ despues: () => $('btnTerminar').click() });   // hora de fin de la última parcela
  if (navigator.onLine && parte.lineas.some(l => l.id_parcela == null && !l.catastro && l.lat != null)) {
    toast('📍 Consultando el Catastro…');
    await Promise.race([catastroPendiente(), new Promise(r => setTimeout(r, 10000))]);
  }
  const ahora = new Date().toISOString();
  clearTimeout(tAuto);
  parte.activa = null;
  recalcular();
  if (parte.lineas.some(l => l.cantidad === '') && !confirm('Hay parcelas sin cantidad. ¿Enviar igualmente?')) return;
  if (tipoDe(parte).tratamiento && parte.productos.some(p => p.dosis_ha === '' || p.dosis_ha == null) &&
      !confirm('Hay productos sin dosis por hectárea. ¿Enviar igualmente?')) return;
  if (enCurso()) {
    parte.hora_inicio = primeraHora(parte) || hhmm(parte.creado_movil || ahora);
    parte.hora_fin = hhmm(ahora);
  }
  pararGps(); pararReloj();
  if (parte.gps) delete parte.gps._viejo;
  for (const l of parte.lineas) if (l.lat == null && parte.gps && l.id_parcela == null) { l.lat = parte.gps.lat; l.lon = parte.gps.lon; }
  if (!parte.creado_movil) parte.creado_movil = ahora;
  parte.estado = 'pendiente'; delete parte.error;
  clearTimeout(tAuto);
  for (const l of parte.lineas) delete l._busca;
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
document.querySelectorAll('[data-volver]').forEach(b => b.addEventListener('click', () => $('btnAtras').click()));
$('btnAtras').addEventListener('click', async () => {
  if (horas) return salirHoras();
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
  else if (r.reintentar) toast('La oficina no responde ahora mismo. El parte se enviará solo en un momento.', 4000);
}
async function pedirEnvioSegundoPlano() {
  try { const reg = await navigator.serviceWorker.ready; if (reg.sync) await reg.sync.register('enviar-partes'); } catch (e) {}
}
window.addEventListener('online', () => { pintarRed(); enviar(); catastroPendiente(); });
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

// ---------- Ver la parcela en el mapa del Catastro o en Google Maps ----------
function tieneMapa(l) { return !!(l && (l.catastro || l.sigpac || l.lat != null)); }
// Referencia catastral de una línea: la del Catastro (GPS) o, si no, a partir de la SIGPAC (prov-mun-pol-parc)
async function rcDeLinea(l) {
  if (l.catastro && l.catastro.rc) return { rc: l.catastro.rc, cp: l.catastro.cp, cm: l.catastro.cm };
  if (l._rc) return l._rc;
  const p = String(l.sigpac || '').split(/[-:\s]+/).filter(Boolean).map(Number);
  if (p.length < 4 || p.slice(0, 4).some(isNaN)) return null;
  const [cp, cm, pol, parc] = p;
  for (const q of [`CodigoMunicipio=${cm}&CodigoMunicipioINE=`, `CodigoMunicipio=&CodigoMunicipioINE=${cm}`]) {
    const d = await pedirXML(`${OVC}OVCCallejeroCodigos.asmx/Consulta_DNPPP_Codigos?CodigoProvincia=${cp}&${q}&Poligono=${pol}&Parcela=${parc}`);
    const rc = tx(d, 'pc1') + tx(d, 'pc2');
    if (rc) return (l._rc = { rc, cp: tx(d, 'cp') || cp, cm: tx(d, 'cm') || cm });
  }
  return null;
}
async function abrirMapa(l, google, navegar) {
  // la ventana se abre ya (si no, el móvil la bloquea) y luego se le pone la dirección
  const w = window.open('', '_blank');
  const ir = url => { if (w && !w.closed) w.location.href = url; else location.href = url; };
  const cerrar = () => { try { if (w) w.close(); } catch (e) {} };
  const ent = navegar ? entradaDe(l.id_parcela) : null;
  if (ent) return ir(urlGoogle(ent.lat, ent.lon, true));             // entrada guardada: exacta
  if (!navigator.onLine) {
    if (google && l.lat != null) return ir(urlGoogle(l.lat, l.lon, navegar));
    cerrar(); return toast('Sin conexión: el mapa se puede ver cuando haya cobertura');
  }
  toast('Buscando la parcela en el Catastro…', 2000);
  const r = await rcDeLinea(l);
  if (!google) {
    if (r) return ir(`https://www1.sedecatastro.gob.es/Cartografia/mapa.aspx?refcat=${r.rc}&del=${+r.cp || ''}&mun=${+r.cm || ''}&final=&ZV=NO`);
    cerrar(); return toast('No encuentro esta parcela en el Catastro');
  }
  let lat = null, lon = null;
  if (r) {
    const d = await pedirXML(`${OVC}OVCCoordenadas.asmx/Consulta_CPMRC?Provincia=&Municipio=&SRS=EPSG:4326&RC=${r.rc}`);
    lat = tx(d, 'ycen'); lon = tx(d, 'xcen');
  }
  if (!lat && l.lat != null) { lat = l.lat; lon = l.lon; }       // si no, donde se tomó el GPS
  if (!lat) { cerrar(); return toast('No tengo la ubicación de esta parcela'); }
  if (navegar && r) {
    // en vez del centro de la parcela: el punto del camino que linda con ella
    toast('Buscando el camino que llega a la parcela…', 2500);
    const p = await puntoAcceso(r.rc, +lat, +lon).catch(() => null);
    if (p) { lat = p.lat; lon = p.lon; }
    toast(p ? (p.modo === 'camino' ? '🧭 Destino: el camino del Catastro que linda con la parcela'
             : p.modo === 'contorno' ? '🧭 Destino: el camino que linda con la parcela' : '🧭 Destino: el camino más cercano a la parcela')
            : '🧭 No encuentro caminos en el mapa: voy al centro de la parcela', 3000);
  }
  ir(urlGoogle(lat, lon, navegar));
}

// ---------- Entrada de la parcela (la guarda un trabajador estando allí; la usan todos) ----------
function entradaDe(idParcela) {
  return idParcela == null ? null : ((cat && cat.entradas) || []).find(e => String(e.id_parcela) === String(idParcela)) || null;
}
function guardarEntradaAqui(l) {
  if (!('geolocation' in navigator)) return toast('Este móvil no permite la ubicación');
  toast('Tomando tu ubicación…', 3000);
  navigator.geolocation.getCurrentPosition(async pos => {
    const c = pos.coords;
    if (c.accuracy > 50) return toast('El GPS no es preciso ahora (±' + Math.round(c.accuracy) + ' m). Espera un poco al aire libre y repite.', 4000);
    if (!confirm(`¿Guardar este punto (±${Math.round(c.accuracy)} m) como ENTRADA de ${nombreParcela(l)}${l.paraje ? ' (' + l.paraje + ')' : ''}?\n\n"Ir a la parcela" llevará aquí a todos los trabajadores.`)) return;
    const e = { id_parcela: l.id_parcela, lat: c.latitude, lon: c.longitude, precision_m: c.accuracy, trabajador: sesion.nombre || '', fecha: new Date().toISOString() };
    try {
      await Sync.guardarEntrada(e);
      cat.entradas = ((cat.entradas || []).filter(x => String(x.id_parcela) !== String(l.id_parcela))).concat([e]);
      await BD.guardar('catalogos', cat);
      pintarParcelas();
      toast('📌 Entrada guardada. "Ir a la parcela" llevará aquí.', 3500);
    } catch (err) {
      toast(navigator.onLine ? 'No se pudo guardar la entrada: ' + err.message : 'Sin conexión: guarda la entrada cuando haya cobertura', 4500);
    }
  }, () => toast('No se pudo obtener la ubicación'), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}

// ---------- Punto de acceso automático: borde de la parcela (Catastro) + caminos (OpenStreetMap) ----------
async function pedirTexto(url, ms, opciones) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, Object.assign({ signal: ctl.signal }, opciones || {})); return r.ok ? await r.text() : null; }
  catch (e) { return null; } finally { clearTimeout(t); }
}
async function contornoParcela(rc) {
  const xml = await pedirTexto('https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=wfs&version=2&request=getfeature' +
    '&STOREDQUERIE_ID=GetParcel&refcat=' + encodeURIComponent(rc.slice(0, 14)) + '&srsname=EPSG::4326', 8000);
  if (!xml) return null;
  const m = xml.match(/<gml:posList[^>]*>([^<]+)<\/gml:posList>/);
  if (!m) return null;
  const n = m[1].trim().split(/\s+/).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < n.length; i += 2) {
    const a = n[i], b = n[i + 1];
    pts.push(Math.abs(a) > 25 ? { lat: a, lon: b } : { lat: b, lon: a });   // en España la latitud es > 25
  }
  return pts.length >= 3 ? pts : null;
}
// Los caminos son parcelas del Catastro (nº 9000 y siguientes: "CAMINO", "VÍA DE COMUNICACIÓN"…).
// Se buscan las parcelas vecinas y, si una es camino, el destino es el centro del lindero con ese camino.
function puntosGML(txt) {
  const n = String(txt || '').trim().split(/\s+/).map(Number), pts = [];
  for (let i = 0; i + 1 < n.length; i += 2) { const a = n[i], b = n[i + 1]; pts.push(Math.abs(a) > 25 ? { lat: a, lon: b } : { lat: b, lon: a }); }
  return pts;
}
async function caminoCatastro(rc, pol) {
  const la = pol.map(p => p.lat), lo = pol.map(p => p.lon), m = 0.0006;
  const bbox = [Math.min(...la) - m, Math.min(...lo) - m, Math.max(...la) + m, Math.max(...lo) + m].map(x => x.toFixed(6)).join(',');
  const xml = await pedirTexto('https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=wfs&version=2&request=getfeature' +
    '&typenames=cp:CadastralParcel&bbox=' + bbox + ',urn:ogc:def:crs:EPSG::4326&srsname=EPSG::4326', 10000);
  if (!xml) return null;
  const vecinas = xml.split(/<member>|<wfs:member>/).slice(1).map(f => ({
    rc: (f.match(/<cp:nationalCadastralReference>([^<]+)</) || [])[1] || '',
    pts: puntosGML((f.match(/<gml:posList[^>]*>([^<]+)</) || [])[1])
  })).filter(f => f.rc && f.rc !== rc.slice(0, 14) && /^\d{5}[A-Z]\d{3}9\d{4}$/.test(f.rc) && f.pts.length > 2);
  if (!vecinas.length) return null;
  const lat0 = pol[0].lat, lon0 = pol[0].lon, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  const P = q => ({ x: (q.lon - lon0) * kx, y: (q.lat - lat0) * ky });
  const segd = (a, b, p) => { const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y); };
  let mejor = null;
  for (const v of vecinas) {
    // ¿es un camino? (no un arroyo o un canal)
    const d = await pedirXML(`${OVC}OVCCallejero.asmx/Consulta_DNPRC?Provincia=&Municipio=&RC=${v.rc}`).catch(() => null);
    const desc = d && d.documentElement ? d.documentElement.textContent.toUpperCase() : '';
    if (desc && /ARROYO|RIO |RÍO|CANAL|BARRANCO|RAMBLA|ACEQUIA|EMBALSE/.test(desc) && !/CAMINO|CARRETERA|VEREDA|CAÑADA|COLADA/.test(desc)) continue;
    const C = v.pts.map(P);
    const junto = pol.map(q => { const p = P(q); let mm = Infinity; for (let j = 0; j + 1 < C.length; j++) mm = Math.min(mm, segd(C[j], C[j + 1], p)); return mm <= 6; });
    // el tramo seguido más largo de lindero con el camino
    const n = junto.length; let largo = 0, ini = -1;
    for (let i = 0; i < n; i++) {
      if (!junto[i] || junto[(i - 1 + n) % n] && junto.some(x => !x)) continue;
      let k = 0; while (k < n && junto[(i + k) % n]) k++;
      if (k > largo) { largo = k; ini = i; }
    }
    if (largo && (!mejor || largo > mejor.largo)) mejor = { largo, punto: pol[(ini + Math.floor(largo / 2)) % n] };
  }
  return mejor ? { lat: mejor.punto.lat, lon: mejor.punto.lon, modo: 'camino' } : null;
}

async function puntoAcceso(rc, lat0, lon0) {
  // 1) el camino del Catastro que linda con la parcela
  const contorno = await contornoParcela(rc);
  if (contorno) { const c = await caminoCatastro(rc, contorno).catch(() => null); if (c) return c; }
  // 2) si no, los caminos de OpenStreetMap; sin contorno, el camino más cercano al centro
  const pol = contorno || [{ lat: lat0, lon: lon0 }];
  const conContorno = pol.length > 1;
  const q = `[out:json][timeout:12];way(around:${conContorno ? 350 : 450},${lat0},${lon0})[highway~"^(primary|secondary|tertiary|unclassified|residential|living_street|road|service|track)$"];out geom;`;
  const txt = await pedirTexto('https://overpass-api.de/api/interpreter', 12000,
    { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!txt) return null;
  let datos; try { datos = JSON.parse(txt); } catch (e) { return null; }
  // plano local en metros
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
  const P = p => ({ x: (p.lon - lon0) * kx, y: (p.lat - lat0) * ky });
  const G = q => ({ lat: lat0 + q.y / ky, lon: lon0 + q.x / kx });
  const poli = pol.map(P);
  const cerca = (a, b, p) => {                     // punto de [a,b] más cercano a p
    const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
    let t = L ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
    return { x: a.x + t * dx, y: a.y + t * dy };
  };
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const rango = { primary: 0, secondary: 0, tertiary: 0, unclassified: 1, residential: 1, living_street: 1, road: 1, service: 2, track: 2 };
  let mejor = null;
  for (const w of (datos.elements || [])) {
    if (!w.geometry || w.geometry.length < 2) continue;
    const via = w.geometry.map(P);
    let dmin = Infinity, punto = null;
    for (let i = 0; i + 1 < via.length; i++) {
      for (const v of poli) { const c = cerca(via[i], via[i + 1], v); const dd = d(c, v); if (dd < dmin) { dmin = dd; punto = c; } }
      for (let j = 0; j + 1 < poli.length; j++) {
        for (const e of [via[i], via[i + 1]]) { const c = cerca(poli[j], poli[j + 1], e); const dd = d(c, e); if (dd < dmin) { dmin = dd; punto = e; } }
      }
    }
    // con contorno: primero los que lindan (≤30 m) y, entre ellos, el más principal; sin contorno: el más cercano al centro
    const nota = conContorno ? (dmin <= 30 ? 0 : 1000) + (rango[w.tags && w.tags.highway] ?? 3) * 10 + dmin / 100 : dmin;
    if (dmin <= (conContorno ? 200 : 450) && (!mejor || nota < mejor.nota)) mejor = { nota, punto };
  }
  if (!mejor) return null;
  return Object.assign(G(mejor.punto), { modo: conContorno ? 'contorno' : 'centro' });
}
// navegar: abre Google Maps con la ruta en coche hasta la parcela (como "Cómo llegar")
function urlGoogle(lat, lon, navegar) {
  return navegar ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=driving`
                 : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

// =====================================================================
//  MIS HORAS (control de trabajadores -> tabla Diario de Access)
// =====================================================================
const aMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const aHHMM = n => { if (n === '' || n == null || isNaN(+n)) return ''; const m = Math.round(+n * 60); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
function calcHoras(h) {
  if (h.vacaciones || h.baja_medica) return 0;
  const e = aMin(h.hora_entrada), s = aMin(h.hora_salida);
  if (e == null || s == null) return '';
  let m = s - e; if (m < 0) m += 1440;                       // salida después de medianoche
  m -= (+h.descanso_min || 0);
  return Math.max(0, Math.round(m / 60 * 100) / 100);
}
function filaHoras(h) {
  const chip = h.estado === 'enviado' ? '<span class="chip enviado">Enviado</span>'
    : h.estado === 'error' ? '<span class="chip error">Error</span>'
    : h.estado === 'en_curso' ? '<span class="chip curso">En curso</span>' : '<span class="chip pendiente">Pendiente</span>';
  const det = h.vacaciones ? 'Vacaciones' : h.baja_medica ? 'Baja médica'
    : (h.horas !== '' && h.horas != null ? duracion(+h.horas) + ' trabajadas' : 'Sin horas');
  return `<li data-id="${esc(h.id)}"><div class="txt"><b>⏱ ${esc(fechaES(h.fecha))} · Mis horas</b><span>${esc(det)}</span></div>${chip}</li>`;
}
async function nuevasHoras() {
  const mias = (await BD.partes()).filter(p => p.tipo === 'horas' && p.fecha === hoy());
  const abierta = mias.find(p => p.estado !== 'enviado');
  if (abierta) return abrirHoras(abierta);
  if (mias.length && !confirm('Ya enviaste tus horas de hoy. ¿Apuntar otra jornada?')) return;
  abrirHoras({ id: uuid(), tipo: 'horas', estado: 'nuevo', fecha: hoy(), hora_entrada: '', hora_salida: '',
    descanso_min: '', horas: '', vacaciones: false, baja_medica: false, observaciones: '', gps: null, creado_movil: null });
}
function abrirHoras(h) {
  horas = JSON.parse(JSON.stringify(h)); parte = null;
  const ro = horas.estado === 'enviado';
  mostrar('vHoras', horas.estado === 'nuevo' ? 'Mis horas' : ro ? 'Horas enviadas' : 'Mis horas', fechaES(horas.fecha));
  if ((horas.horas === '' || horas.horas == null) && horas.hora_entrada) horas.horas = calcHoras(horas);   // jornadas antiguas con entrada/salida
  $('hFecha').value = horas.fecha; $('hHoras').value = aHHMM(horas.horas);
  $('hVacaciones').checked = !!horas.vacaciones; $('hBaja').checked = !!horas.baja_medica;
  $('hObs').value = horas.observaciones || '';
  $('vHoras').querySelectorAll('input, textarea, button').forEach(el => { if (!el.hasAttribute('data-volver')) el.disabled = ro; });
  ['hGuardar', 'hEnviar'].forEach(id => $(id).classList.toggle('oculto', ro));
  $('hBorrar').classList.toggle('oculto', ro || horas.estado === 'nuevo');
  $('horasError').textContent = horas.estado === 'error' ? 'No se pudo enviar: ' + (horas.error || '') : '';
  $('horasError').classList.toggle('oculto', horas.estado !== 'error');
  pintarHoras();
}
function leerHoras() {
  horas.fecha = $('hFecha').value; horas.hora_entrada = ''; horas.hora_salida = ''; horas.descanso_min = '';
  horas.vacaciones = $('hVacaciones').checked; horas.baja_medica = $('hBaja').checked;
  horas.observaciones = $('hObs').value.trim();
  const t = $('hHoras').value;
  horas.horas = (horas.vacaciones || horas.baja_medica) ? 0 : (t ? r2(aMin(t) / 60) : '');
}
function pintarHoras() {
  leerHoras();
  const ausente = horas.vacaciones || horas.baja_medica;
  if (horas.estado !== 'enviado') $('hHoras').disabled = ausente;
  $('avisoHoras').className = 'aviso oculto';
}
async function guardarHorasLocal() {
  if (horas.estado === 'nuevo') { horas.estado = 'en_curso'; horas.creado_movil = new Date().toISOString(); }
  if (horas.estado === 'error') horas.estado = 'pendiente';
  await BD.guardarParte(horas);
  if (horas.estado === 'en_curso' && navigator.onLine) Sync.guardarBorrador(horas).catch(() => {});
}
function gpsUnaVez() {
  if (!('geolocation' in navigator) || !horas) return;
  const h = horas;
  navigator.geolocation.getCurrentPosition(pos => {
    h.gps = { lat: pos.coords.latitude, lon: pos.coords.longitude, precision: pos.coords.accuracy, fecha: new Date(pos.timestamp).toISOString() };
    if (horas === h) BD.guardarParte(h).catch(() => {});
  }, () => {}, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
}
['hFecha', 'hHoras', 'hVacaciones', 'hBaja'].forEach(id => $(id).addEventListener('change', () => {
  if (id === 'hVacaciones' && $('hVacaciones').checked) $('hBaja').checked = false;
  if (id === 'hBaja' && $('hBaja').checked) $('hVacaciones').checked = false;
  pintarHoras(); if (horas.estado !== 'nuevo') guardarHorasLocal();
}));
$('hGuardar').addEventListener('click', async () => {
  leerHoras();
  if (horas.estado === 'nuevo' && !horas.horas && !horas.vacaciones && !horas.baja_medica) { irInicio(); return; }
  await guardarHorasLocal(); irInicio(); toast('Guardado. Envíalo cuando termines la jornada.');
});
$('hEnviar').addEventListener('click', async () => {
  leerHoras();
  if (!horas.fecha) return toast('Falta la fecha');
  if (horas.fecha > hoy()) return toast('La fecha no puede ser posterior a hoy');
  if (!horas.vacaciones && !horas.baja_medica) {
    if (!(horas.horas > 0)) return toast('Pon las horas trabajadas');
    if (horas.horas > 16 && !confirm('Salen ' + duracion(horas.horas) + '. ¿Es correcto?')) return;
  }
  const otras = (await BD.partes()).filter(p => p.tipo === 'horas' && p.fecha === horas.fecha && p.id !== horas.id);
  if (otras.length && !confirm('Ya tienes otra jornada apuntada el ' + fechaES(horas.fecha) + '. ¿Enviar también esta?')) return;
  if (!horas.creado_movil) horas.creado_movil = new Date().toISOString();
  if (!horas.gps) gpsUnaVez();
  horas.estado = 'pendiente'; delete horas.error;
  await BD.guardarParte(horas);
  irInicio();
  toast(navigator.onLine ? 'Horas terminadas. Enviando…' : 'Horas guardadas. Se enviarán al tener cobertura.');
  pedirEnvioSegundoPlano(); enviar();
});
$('hBorrar').addEventListener('click', async () => {
  if (!confirm('¿Borrar estas horas? Aún no se han enviado a la oficina.')) return;
  const id = horas.id; await BD.borrarParte(id);
  if (navigator.onLine) Sync.borrarBorrador(id).catch(() => {});
  irInicio(); toast('Horas borradas');
});
async function salirHoras() {
  if (horas.estado === 'nuevo') { leerHoras(); if ((horas.horas || horas.vacaciones || horas.baja_medica) && !confirm('No has guardado. ¿Salir sin guardar?')) return; }
  else if (horas.estado !== 'enviado') { leerHoras(); await BD.guardarParte(horas); }
  irInicio();
}

// Cosechadora: cereal secano / riego (campo Cereal de las líneas en Access)
function pintarRiego() {
  document.querySelectorAll('[data-riego]').forEach(b => b.classList.toggle('elegido', !!parte && parte.riego === b.dataset.riego));
}
document.querySelectorAll('[data-riego]').forEach(b => b.addEventListener('click', () => {
  if (!parte || soloLectura()) return;
  parte.riego = b.dataset.riego;
  for (const l of parte.lineas) l.cereal = parte.riego;
  pintarRiego(); autoguardar();
}));
