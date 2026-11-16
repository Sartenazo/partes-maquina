// Conexión con Supabase: inicio de sesión, catálogos y envío de partes.
// Lo usan la página y el service worker (envío en segundo plano).
(function (g) {
  const cfg = () => g.APP_CONFIG || {};
  const configurado = () => !!(cfg().SUPABASE_URL && cfg().SUPABASE_ANON_KEY);
  let enviando = null;

  async function peticion(ruta, { metodo = 'GET', cuerpo, token, cabeceras = {} } = {}) {
    const r = await fetch(cfg().SUPABASE_URL.replace(/\/$/, '') + ruta, {
      method: metodo,
      headers: Object.assign({
        apikey: cfg().SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + (token || cfg().SUPABASE_ANON_KEY),
        'Content-Type': 'application/json'
      }, cabeceras),
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
    });
    const texto = await r.text();
    let datos = null;
    try { datos = texto ? JSON.parse(texto) : null; } catch (e) { datos = texto; }
    if (!r.ok) {
      const msg = (datos && (datos.message || datos.error_description || datos.msg || datos.error)) || ('Error ' + r.status);
      const err = new Error(traducir(msg)); err.status = r.status; throw err;
    }
    return { datos, cabeceras: r.headers };
  }

  function traducir(m) {
    if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos';
    if (/Email not confirmed/i.test(m)) return 'El usuario no está confirmado (márcalo como confirmado en Supabase)';
    if (/sin permiso/i.test(m)) return 'Tu usuario no está dado de alta como trabajador activo. Avisa a la oficina.';
    if (/JWT expired/i.test(m)) return 'Sesión caducada';
    return m;
  }

  function guardarSesion(d) {
    return g.BD.guardar('sesion', {
      access_token: d.access_token,
      refresh_token: d.refresh_token,
      expira: Date.now() + (d.expires_in || 3600) * 1000,
      user_id: d.user && d.user.id,
      email: d.user && d.user.email
    });
  }

  async function token(forzar) {
    const s = await g.BD.leer('sesion');
    if (!s || s.demo) return s;
    if (!forzar && s.expira - 120000 > Date.now()) return s;
    const { datos } = await peticion('/auth/v1/token?grant_type=refresh_token', {
      metodo: 'POST', cuerpo: { refresh_token: s.refresh_token }
    });
    await guardarSesion(datos);
    const nueva = await g.BD.leer('sesion');
    nueva.nombre = s.nombre; nueva.clave = s.clave;
    await g.BD.guardar('sesion', nueva);
    return nueva;
  }

  async function conToken(fn) {
    let s = await token(false);
    try { return await fn(s.access_token); }
    catch (e) {
      if (e.status !== 401) throw e;
      s = await token(true);
      return fn(s.access_token);
    }
  }

  async function leerTabla(tabla, tk, orden) {
    const todas = [];
    for (let desde = 0; ; desde += 1000) {
      const { datos } = await peticion('/rest/v1/' + tabla + '?select=*&order=' + orden, {
        token: tk, cabeceras: { Range: desde + '-' + (desde + 999) }
      });
      todas.push(...datos);
      if (datos.length < 1000) return todas;
    }
  }

  g.Sync = {
    configurado,

    async entrar(email, clave) {
      const { datos } = await peticion('/auth/v1/token?grant_type=password', {
        metodo: 'POST', cuerpo: { email, password: clave }
      });
      await guardarSesion(datos);
      const s = await g.BD.leer('sesion');
      const { datos: fichas } = await peticion('/rest/v1/trabajadores?select=nombre,clave,activo&user_id=eq.' + s.user_id, { token: s.access_token });
      if (!fichas.length || !fichas[0].activo) {
        await g.BD.borrar('sesion');
        throw new Error('Tu usuario no está dado de alta como trabajador activo. Avisa a la oficina.');
      }
      s.nombre = fichas[0].nombre; s.clave = fichas[0].clave;
      await g.BD.guardar('sesion', s);
      await g.Sync.descargarCatalogos();
      await g.Sync.recuperarBorradores().catch(() => {});
      return s;
    },

    // Copia en la nube de un parte EN CURSO (por si se rompe o se cambia el móvil)
    async guardarBorrador(p) {
      const s = await g.BD.leer('sesion');
      if (!s || s.demo) return;
      return conToken(tk => peticion('/rest/v1/partes_borradores?on_conflict=id', {
        metodo: 'POST', token: tk, cuerpo: { id: p.id, datos: p, actualizado: new Date().toISOString() },
        cabeceras: { Prefer: 'resolution=merge-duplicates,return=minimal' }
      }));
    },
    async borrarBorrador(id) {
      const s = await g.BD.leer('sesion');
      if (!s || s.demo) return;
      return conToken(tk => peticion('/rest/v1/partes_borradores?id=eq.' + id, { metodo: 'DELETE', token: tk }));
    },
    // Al entrar en un móvil nuevo: recupera los partes en curso guardados en la nube
    async recuperarBorradores() {
      const s = await g.BD.leer('sesion');
      if (!s || s.demo) return 0;
      const { datos } = await conToken(tk => peticion('/rest/v1/partes_borradores?select=datos', { token: tk }));
      let n = 0;
      for (const b of datos || []) {
        if (b.datos && b.datos.id && !(await g.BD.parte(b.datos.id))) { await g.BD.guardarParte(b.datos); n++; }
      }
      return n;
    },

    async descargarCatalogos() {
      const s = await g.BD.leer('sesion');
      if (s && s.demo) return g.BD.leer('catalogos');
      return conToken(async tk => {
        // clases = Máquina (Claseequipamiento) · faenas = Tipo Trabajo (Clasefaena)
        const [empresas, parcelas, faenas, clases, unidades] = await Promise.all([
          leerTabla('cat_empresas', tk, 'nombre'),
          leerTabla('cat_parcelas', tk, 'poligono,parcela'),
          leerTabla('cat_faenas', tk, 'nombre'),
          leerTabla('cat_clases', tk, 'nombre'),
          leerTabla('cat_unidades', tk, 'id')
        ]);
        const cat = { empresas, parcelas, faenas, clases, unidades, fecha: new Date().toISOString() };
        await g.BD.guardar('catalogos', cat);
        return cat;
      });
    },

    // Envía todos los partes pendientes. Devuelve {enviados, errores, sinConexion}
    enviarPendientes() {
      if (enviando) return enviando;
      enviando = (async () => {
        const res = { enviados: 0, errores: 0, sinConexion: false };
        const s = await g.BD.leer('sesion');
        if (!s) return res;
        const pendientes = (await g.BD.partes()).filter(p => p.estado === 'pendiente' || p.estado === 'error');
        for (const p of pendientes) {
          try {
            if (s.demo) {
              if (g.navigator && g.navigator.onLine === false) throw new TypeError('offline');
              await new Promise(r => setTimeout(r, 400));
            } else {
              await conToken(tk => peticion('/rest/v1/rpc/registrar_parte', {
                metodo: 'POST', token: tk, cuerpo: { p: aEnvio(p) }
              }));
            }
            p.estado = 'enviado'; p.enviado = new Date().toISOString(); delete p.error;
            await g.BD.guardarParte(p);
            res.enviados++;
          } catch (e) {
            if (e instanceof TypeError || !e.status) { res.sinConexion = true; break; } // sin red
            p.estado = 'error'; p.error = e.message;
            await g.BD.guardarParte(p);
            res.errores++;
          }
        }
        await g.BD.guardar('ultimoEnvio', { fecha: new Date().toISOString(), ...res });
        return res;
      })().finally(() => { enviando = null; });
      return enviando;
    }
  };

  const hm = iso => { const d = new Date(iso); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  // Lo que viaja a la nube (sin campos internos de la app)
  function aEnvio(p) {
    return {
      id: p.id, fecha: p.fecha, hora_inicio: p.hora_inicio || '', hora_fin: p.hora_fin || '',
      id_empresa: p.id_empresa, empresa: p.empresa, clase: p.clase || '', faena: p.faena || '',
      maquina: '', kilos: p.kilos === '' || p.kilos == null ? '' : p.kilos,
      observaciones: p.observaciones || '',
      lat: p.gps ? p.gps.lat : '', lon: p.gps ? p.gps.lon : '',
      gps_precision_m: p.gps ? p.gps.precision : '', gps_fecha: p.gps ? p.gps.fecha : '',
      creado_movil: p.creado_movil,
      lineas: (p.lineas || []).map((l, i) => ({
        id: l.id, orden: i + 1, id_parcela: l.id_parcela == null ? '' : l.id_parcela,
        poligono: l.poligono || '', parcela: l.parcela || '', paraje: l.paraje || '',
        tipo_cultivo: l.tipo_cultivo || '', superficie: l.superficie == null ? '' : l.superficie,
        sigpac: l.sigpac || '', cantidad: l.cantidad === '' || l.cantidad == null ? '' : l.cantidad,
        unidad: l.unidad || '', observaciones: l.observaciones || '',
        lat: l.lat == null ? '' : l.lat, lon: l.lon == null ? '' : l.lon,
        gps_precision_m: l.precision == null ? '' : l.precision,
        inicio: (l.tramos && l.tramos.length) ? l.tramos[0].inicio : '',
        fin: (l.tramos && l.tramos.length) ? (l.tramos[l.tramos.length - 1].fin || '') : '',
        horas: (l.tramos && l.tramos.length) ? Math.round(l.tramos.reduce((s, t) => s + (new Date(t.fin || Date.now()) - new Date(t.inicio)) / 36e5, 0) * 100) / 100 : '',
        tramos: (l.tramos || []).map(t => hm(t.inicio) + '-' + (t.fin ? hm(t.fin) : '')).join(', ')
      }))
    };
  }
})(self);
