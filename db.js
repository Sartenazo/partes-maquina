// Almacenamiento local en el móvil (IndexedDB). Funciona sin conexión.
// Se usa tanto desde la página como desde el service worker.
(function (g) {
  const NOMBRE = 'partes-maquina', VERSION = 1;
  let abierta = null;

  function abrir() {
    if (abierta) return abierta;
    abierta = new Promise((ok, mal) => {
      const r = indexedDB.open(NOMBRE, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('partes')) db.createObjectStore('partes', { keyPath: 'id' });
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => { abierta = null; mal(r.error); };
    });
    return abierta;
  }

  async function tx(almacen, modo, fn) {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction(almacen, modo);
      fn(t.objectStore(almacen));
      t.oncomplete = () => ok();
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error);
    });
  }
  const req = r => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });

  g.BD = {
    async leer(clave) { const db = await abrir(); return req(db.transaction('kv').objectStore('kv').get(clave)); },
    guardar(clave, valor) { return tx('kv', 'readwrite', s => { s.put(valor, clave); }); },
    borrar(clave) { return tx('kv', 'readwrite', s => { s.delete(clave); }); },
    async partes() {
      const db = await abrir();
      const lista = await req(db.transaction('partes').objectStore('partes').getAll());
      return lista.sort((a, b) => (b.fecha + (b.hora_inicio || '') + b.creado_movil).localeCompare(a.fecha + (a.hora_inicio || '') + a.creado_movil));
    },
    async parte(id) { const db = await abrir(); return req(db.transaction('partes').objectStore('partes').get(id)); },
    guardarParte(p) { return tx('partes', 'readwrite', s => { s.put(p); }); },
    borrarParte(id) { return tx('partes', 'readwrite', s => { s.delete(id); }); },
    async vaciarTodo() {
      await tx('partes', 'readwrite', s => { s.clear(); });
      await tx('kv', 'readwrite', s => { s.clear(); });
    }
  };
})(self);
