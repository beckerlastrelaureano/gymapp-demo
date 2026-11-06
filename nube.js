/**
 * nube.js — Datos del gimnasio en la nube (Firebase becker-sync)
 * -----------------------------------------------------------------------
 * - Al activar el código, el dueño crea su acceso (email + contraseña) y el
 *   gimnasio se sube a gimnasios/{gid}. Desde ahí el link y el QR para los
 *   alumnos llevan "?g={gid}" (por ejemplo ?g=focus).
 * - Quien abre ese link baja los datos del gimnasio: ve su nombre, su marca
 *   y entra con su DNI. Cada tanto se vuelve a bajar lo nuevo.
 * - Solo el dispositivo donde entró el dueño (Acceso administrador) sube
 *   cambios del gimnasio. Los alumnos suben solo lo suyo (series, pesos y
 *   asistencias) a gimnasios/{gid}/alumnos/{alumnoId}.
 * Se carga después de licencia.js y antes que la app, sin tocar su código.
 */
(function () {
  var PROYECTO = 'becker-sync';
  var API_KEY = 'AIzaSyD9CG3aFhpSl_waa1GyqUvoDYtG7k7yG7o';
  var BASE = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents';
  var AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts:';
  var CLAVE_DATOS = 'gymapp-datos-v1';
  var CLAVE_LICENCIA = 'gymapp-licencia';
  var CLAVE_NUBE = 'gymapp-nube';
  var CLAVE_SESION = 'gymapp-sesion';
  var NOMBRE_DEMO = 'Gimnasio Demo';
  var SEGUNDOS_ENTRE_BAJADAS = 20;

  var setPrevio = Storage.prototype.setItem;
  var aplicando = false;

  function leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function guardarLocal(k, v) { aplicando = true; try { setPrevio.call(localStorage, k, JSON.stringify(v)); } finally { aplicando = false; } }
  var cfg = leer(CLAVE_NUBE);
  function guardarCfg() { guardarLocal(CLAVE_NUBE, cfg); }
  function esDueno() { return !!(cfg && cfg.rol === 'dueno'); }
  function azar() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
  function slug(t) {
    return (t || 'gimnasio').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'gimnasio';
  }

  // El link y el QR de Ajustes / Instalar suman "?g=..." (lo lee la app compilada).
  function actualizarLink() { window.gymLinkExtra = cfg && cfg.gid ? '?g=' + encodeURIComponent(cfg.gid) : ''; }
  actualizarLink();

  // ----- Firebase por REST ---------------------------------------------
  function authPost(metodo, cuerpo) {
    return fetch(AUTH + metodo + '?key=' + API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo)
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) { var e = new Error((j.error && j.error.message) || 'ERROR'); e.codigo = e.message; throw e; }
        return j;
      });
    });
  }
  function entrarFirebase(email, clave, crear) {
    return authPost(crear ? 'signUp' : 'signInWithPassword', { email: email, password: clave, returnSecureToken: true })
      .then(function (j) { return { uid: j.localId, email: j.email, token: j.idToken, refresh: j.refreshToken, vence: Date.now() + (Number(j.expiresIn) - 60) * 1000 }; });
  }
  function mensajeAuth(e) {
    var c = (e && e.codigo) || '';
    if (/EMAIL_EXISTS/.test(c)) return 'Ese email ya tiene cuenta. Tocá "Ya tengo cuenta".';
    if (/INVALID_LOGIN|INVALID_PASSWORD|EMAIL_NOT_FOUND/.test(c)) return 'Email o contraseña incorrectos.';
    if (/WEAK_PASSWORD/.test(c)) return 'La contraseña tiene que tener al menos 6 caracteres.';
    if (/INVALID_EMAIL/.test(c)) return 'Ese email no es válido.';
    if (/TOO_MANY/.test(c)) return 'Demasiados intentos. Esperá unos minutos.';
    return 'No se pudo conectar. Revisá internet y probá de nuevo.';
  }
  var sesionFb = null; // { uid, token, refresh, vence } solo en memoria + refresh guardado
  function tokenDueno() {
    if (sesionFb && sesionFb.vence > Date.now()) return Promise.resolve(sesionFb.token);
    if (!cfg || !cfg.refresh) return Promise.reject(new Error('SIN_SESION'));
    return fetch('https://securetoken.googleapis.com/v1/token?key=' + API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(cfg.refresh)
    }).then(function (r) { if (!r.ok) throw new Error('SIN_SESION'); return r.json(); }).then(function (j) {
      sesionFb = { uid: j.user_id, token: j.id_token, refresh: j.refresh_token, vence: Date.now() + (Number(j.expires_in) - 60) * 1000 };
      cfg.refresh = j.refresh_token; guardarCfg();
      return sesionFb.token;
    });
  }

  function aCampos(o) {
    var f = {};
    Object.keys(o).forEach(function (k) {
      f[k] = typeof o[k] === 'number' ? { integerValue: String(o[k]) } : { stringValue: String(o[k]) };
    });
    return f;
  }
  function deCampos(doc) {
    var f = (doc && doc.fields) || {}, o = {};
    Object.keys(f).forEach(function (k) { o[k] = 'integerValue' in f[k] ? Number(f[k].integerValue) : f[k].stringValue; });
    return o;
  }
  function pedir(url, opciones) {
    return fetch(url, opciones).then(function (r) {
      if (r.status === 404) return null;
      return r.json().then(function (j) {
        if (!r.ok) { var e = new Error((j.error && j.error.status) || 'ERROR'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function leerDoc(ruta) {
    return pedir(BASE + '/' + ruta + '?key=' + API_KEY, { cache: 'no-store' }).then(function (d) { return d ? deCampos(d) : null; });
  }
  function escribirDoc(ruta, datos, token, soloSiNoExiste) {
    var q = '?key=' + API_KEY + Object.keys(datos).map(function (k) { return '&updateMask.fieldPaths=' + k; }).join('') +
      (soloSiNoExiste ? '&currentDocument.exists=false' : '');
    var h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return pedir(BASE + '/' + ruta + q, { method: 'PATCH', headers: h, body: JSON.stringify({ fields: aCampos(datos) }) });
  }
  function listarAlumnos(gid) {
    var todos = [];
    function pagina(tk) {
      return pedir(BASE + '/gimnasios/' + encodeURIComponent(gid) + '/alumnos?pageSize=300&key=' + API_KEY + (tk ? '&pageToken=' + encodeURIComponent(tk) : ''), { cache: 'no-store' })
        .then(function (j) {
          ((j && j.documents) || []).forEach(function (d) { var o = deCampos(d); o.id = d.name.split('/').pop(); todos.push(o); });
          return j && j.nextPageToken ? pagina(j.nextPageToken) : todos;
        });
    }
    return pagina('');
  }
  function buscarPorCodigo(codigo) {
    return pedir(BASE + ':runQuery?key=' + API_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'gimnasios' }], where: { fieldFilter: { field: { fieldPath: 'codigo' }, op: 'EQUAL', value: { stringValue: codigo } } }, limit: 1 } })
    }).then(function (res) {
      var d = (res || []).filter(function (x) { return x.document; })[0];
      if (!d) return null;
      var o = deCampos(d.document); o.gid = d.document.name.split('/').pop(); return o;
    });
  }

  // ----- Armar los datos: gimnasio + lo que subió cada alumno ----------
  function parteAlumno(d, a) {
    return {
      registros: a.registros || {}, pesos: a.pesos || {},
      asist: (d.asistencias || []).filter(function (x) { return x.alumnoId === a.id && x.por === 'alumno'; })
    };
  }
  function componer(principal, alumnos) {
    var d = JSON.parse(principal.datos);
    var borradas = {}; JSON.parse(principal.borradas || '[]').forEach(function (id) { borradas[id] = 1; });
    var ids = {}; d.asistencias.forEach(function (x) { ids[x.id] = 1; });
    alumnos.forEach(function (s) {
      var a = d.alumnos.filter(function (x) { return x.id === s.id; })[0];
      if (!a) return;
      var p; try { p = JSON.parse(s.datos); } catch (e) { return; }
      a.registros = p.registros || {}; a.pesos = p.pesos || {};
      (p.asist || []).forEach(function (x) {
        if (x && x.alumnoId === a.id && !ids[x.id] && !borradas[x.id] &&
            !d.asistencias.some(function (y) { return y.alumnoId === x.alumnoId && y.fecha === x.fecha; })) {
          d.asistencias.push(x); ids[x.id] = 1;
        }
      });
    });
    var local = leer(CLAVE_DATOS);
    d.admin = esDueno() && local && local.admin ? local.admin : { email: '', clave: azar() };
    return d;
  }
  function sinAdmin(d) { var c = JSON.parse(JSON.stringify(d)); delete c.admin; return c; }
  // Lo que es del gimnasio (no de cada alumno): sirve para avisar si se editó donde no se sube.
  function partePrincipal(d) {
    var c = sinAdmin(d);
    c.alumnos.forEach(function (a) { delete a.registros; delete a.pesos; });
    c.asistencias = c.asistencias.filter(function (x) { return x.por !== 'alumno'; });
    return JSON.stringify(c);
  }

  var base = null;        // último estado bajado/subido
  var partes = {};        // alumnoId -> JSON de su parte ya subida
  var borradas = [];
  function recordar(d) {
    base = d; partes = {};
    d.alumnos.forEach(function (a) { partes[a.id] = JSON.stringify(parteAlumno(d, a)); });
  }

  function aplicar(d) {
    var nuevo = JSON.stringify(d);
    if (localStorage.getItem(CLAVE_DATOS) === nuevo) return;
    aplicando = true;
    try { setPrevio.call(localStorage, CLAVE_DATOS, nuevo); } finally { aplicando = false; }
    try { window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_DATOS, newValue: nuevo })); } catch (e) { location.reload(); }
  }

  // ----- Bajar ---------------------------------------------------------
  var bajando = false, pendiente = null, subiendo = false;
  function bajar(primera) {
    if (!cfg || !cfg.gid || bajando || pendiente || subiendo) return Promise.resolve();
    bajando = true;
    return Promise.all([leerDoc('gimnasios/' + encodeURIComponent(cfg.gid)), listarAlumnos(cfg.gid)]).then(function (r) {
      var principal = r[0];
      if (!principal) { if (primera) avisar('No encontramos ese gimnasio. Pedile el link de nuevo a tu gimnasio.'); return; }
      borradas = JSON.parse(principal.borradas || '[]');
      // La licencia que vale es la del gimnasio, también para el dueño: reemplaza a un código
      // viejo guardado en este dispositivo (se bloquea solo si Becker suspende el del gimnasio).
      var lic = leer(CLAVE_LICENCIA);
      if (!lic || lic.codigo !== principal.codigo) {
        guardarLocal(CLAVE_LICENCIA, { codigo: principal.codigo, gimnasio: JSON.parse(principal.datos).gym.nombre, verificado: Date.now() });
        if (window.gymLicenciaControlar) window.gymLicenciaControlar();
      }
      if (pendiente || subiendo) return; // hubo un cambio local mientras bajaba: se sube primero
      var d = componer(principal, r[1]);
      recordar(d);
      aplicar(d);
    }).catch(function () {
      if (primera) avisar('Sin conexión: se muestran los últimos datos guardados.');
    }).then(function () { bajando = false; quitarCarga(); });
  }

  // ----- Subir ---------------------------------------------------------
  function programarSubida() {
    clearTimeout(pendiente);
    pendiente = setTimeout(function () { pendiente = null; subir(); }, 1500);
  }
  function subir() {
    var d = leer(CLAVE_DATOS);
    if (!cfg || !cfg.gid || !d || !base) return;
    subiendo = true;
    var tareas = [];
    if (esDueno() && d.gym && d.gym.nombre === NOMBRE_DEMO) {
      avisar('Este gimnasio ya está activado: los datos de ejemplo no se guardan en la nube.');
      subiendo = false;
      return;
    }
    if (esDueno()) {
      var antes = {}; base.asistencias.forEach(function (x) { antes[x.id] = 1; });
      var ahora = {}; d.asistencias.forEach(function (x) { ahora[x.id] = 1; });
      Object.keys(antes).forEach(function (id) { if (!ahora[id] && borradas.indexOf(id) < 0) borradas.push(id); });
      borradas = borradas.slice(-1000);
      tareas.push(tokenDueno().then(function (tk) {
        return escribirDoc('gimnasios/' + encodeURIComponent(cfg.gid), { datos: JSON.stringify(sinAdmin(d)), borradas: JSON.stringify(borradas), actualizado: Date.now() }, tk);
      }).catch(function (e) {
        if (e && (e.message === 'SIN_SESION' || e.status === 401 || e.status === 403)) avisar('Volvé a entrar con Acceso administrador para guardar los cambios en la nube.');
        else avisar('No se pudieron guardar los cambios en la nube. Se reintenta solo.');
        throw e;
      }));
    } else if (base && partePrincipal(d) !== partePrincipal(base)) {
      avisar('Los cambios del panel solo se guardan en la nube desde el dispositivo del dueño (Acceso administrador).');
    }
    d.alumnos.forEach(function (a) {
      var p = JSON.stringify(parteAlumno(d, a));
      if (partes[a.id] === p || !base.alumnos.some(function (x) { return x.id === a.id; })) return;
      tareas.push(escribirDoc('gimnasios/' + encodeURIComponent(cfg.gid) + '/alumnos/' + encodeURIComponent(a.id),
        { dni: a.dni, datos: p, actualizado: Date.now() }).then(function () { partes[a.id] = p; }));
    });
    Promise.all(tareas).then(function () {
      if (esDueno()) recordar(d);
    }).catch(function () {
      setTimeout(programarSubida, 15000);
    }).then(function () { subiendo = false; });
  }

  Storage.prototype.setItem = function (k, v) {
    setPrevio.call(this, k, v);
    if (!aplicando && this === localStorage && k === CLAVE_DATOS && cfg && cfg.gid) programarSubida();
  };

  // ----- Pantallas -----------------------------------------------------
  function estilos() {
    if (document.getElementById('nube-estilos')) return;
    var s = document.createElement('style');
    s.id = 'nube-estilos';
    s.textContent =
      '#nube{position:fixed;inset:0;z-index:2147483647;background:radial-gradient(900px 500px at 50% -150px,rgba(15,93,117,.35),transparent 70%),#0A0C0E;' +
      'color:#F2F4F7;font:15px/1.5 Inter,system-ui,sans-serif;display:grid;place-items:center;padding:16px;overflow:auto}' +
      '#nube .caja{width:min(420px,100%);background:#14171C;border:1px solid #262B33;border-radius:20px;padding:26px 22px;text-align:center}' +
      '#nube h1{font:700 1.5rem "Space Grotesk",system-ui,sans-serif;margin:8px 0 6px}' +
      '#nube p{color:#98A2B0;margin:0 0 16px}' +
      '#nube .icono{width:64px;height:64px;margin:0 auto 6px;border-radius:18px;display:grid;place-items:center;background:rgba(15,93,117,.25);border:1px solid rgba(80,170,200,.35);font-size:28px}' +
      '#nube input{width:100%;box-sizing:border-box;font:500 1rem Inter,sans-serif;color:#F2F4F7;background:#0A0C0E;border:1px solid #262B33;border-radius:12px;padding:13px;margin-bottom:10px}' +
      '#nube input:focus{outline:2px solid #3FA7C9;border-color:transparent}' +
      '#nube button{display:block;width:100%;box-sizing:border-box;border:0;border-radius:12px;padding:14px;font:600 1rem Inter,sans-serif;cursor:pointer}' +
      '#nube .primario{background:#3FA7C9;color:#06141A;margin-bottom:10px}#nube .primario:disabled{opacity:.6;cursor:wait}' +
      '#nube .secundario{background:transparent;color:#98A2B0;border:1px solid #262B33;margin-bottom:8px}' +
      '#nube .error{color:#FF6B6B;font-weight:600;min-height:1.5em;margin:0 0 10px}' +
      '#nube-aviso{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483646;max-width:min(440px,calc(100% - 32px));' +
      'background:#14171C;color:#F2F4F7;border:1px solid #3FA7C9;border-radius:12px;padding:12px 14px;font:14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)}';
    document.head.appendChild(s);
  }
  var capa = null;
  function mostrar(html) {
    estilos();
    if (!capa) { capa = document.createElement('div'); capa.id = 'nube'; capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-modal', 'true'); document.body.appendChild(capa); }
    capa.innerHTML = '<div class="caja">' + html + '</div>';
  }
  function quitarCarga() { if (capa && capa.getAttribute('data-carga')) { capa.remove(); capa = null; } }
  function pantallaCarga() { mostrar('<div class="icono">⏳</div><h1>Cargando tu gimnasio…</h1><p>Un segundo.</p>'); capa.setAttribute('data-carga', '1'); }
  var ultimoAviso = '';
  function avisar(texto) {
    if (texto === ultimoAviso) return;
    ultimoAviso = texto;
    estilos();
    var a = document.getElementById('nube-aviso');
    if (!a) { a = document.createElement('div'); a.id = 'nube-aviso'; a.setAttribute('role', 'status'); document.body.appendChild(a); }
    a.textContent = texto;
    clearTimeout(avisar.t);
    avisar.t = setTimeout(function () { a.remove(); ultimoAviso = ''; }, 7000);
  }
  function esc(t) { return String(t || '').replace(/[<>&"]/g, ''); }

  // Paso después de poner el código: el dueño crea su acceso y se sube el gimnasio.
  function pasoCuenta(codigo, nombreGym, yaTengo) {
    mostrar(
      '<div class="icono">👤</div>' +
      '<h1>' + (yaTengo ? 'Entrá con tu cuenta' : 'Creá tu acceso de dueño') + '</h1>' +
      '<p>' + (yaTengo ? 'El email y la contraseña con los que creaste el acceso de ' : 'Con tu email (por ejemplo tu Gmail) vas a entrar al panel de ') + esc(nombreGym || 'tu gimnasio') + ' desde cualquier dispositivo.</p>' +
      '<form id="nube-form"><input id="nube-mail" type="email" autocomplete="username" placeholder="tuemail@gmail.com" aria-label="Email" required>' +
      '<input id="nube-clave" type="password" autocomplete="' + (yaTengo ? 'current-password' : 'new-password') + '" placeholder="Contraseña (mínimo 6)" aria-label="Contraseña" required minlength="6">' +
      '<div class="error" id="nube-error"></div>' +
      '<button class="primario" id="nube-ok">' + (yaTengo ? 'Entrar' : 'Crear acceso') + '</button></form>' +
      '<button class="secundario" id="nube-cambiar">' + (yaTengo ? 'Todavía no tengo cuenta' : 'Ya tengo cuenta') + '</button>' +
      (yaTengo ? '<button class="secundario" id="nube-olvide">Me olvidé la contraseña</button>' : '') +
      '<button class="secundario" id="nube-despues">Ahora no (seguir solo en este dispositivo)</button>'
    );
    document.getElementById('nube-despues').onclick = function () { location.reload(); };
    var error = document.getElementById('nube-error'), boton = document.getElementById('nube-ok');
    document.getElementById('nube-mail').focus();
    document.getElementById('nube-cambiar').onclick = function () { pasoCuenta(codigo, nombreGym, !yaTengo); };
    var olvide = document.getElementById('nube-olvide');
    if (olvide) olvide.onclick = function () {
      var mail = document.getElementById('nube-mail').value.trim();
      if (!mail) { error.textContent = 'Escribí tu email y tocá de nuevo.'; return; }
      authPost('sendOobCode', { requestType: 'PASSWORD_RESET', email: mail })
        .then(function () { error.style.color = '#7BD88F'; error.textContent = 'Te mandamos un email para cambiar la contraseña.'; })
        .catch(function (e) { error.textContent = mensajeAuth(e); });
    };
    document.getElementById('nube-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var mail = document.getElementById('nube-mail').value.trim().toLowerCase();
      var clave = document.getElementById('nube-clave').value;
      boton.disabled = true; error.style.color = ''; error.textContent = '';
      var s;
      entrarFirebase(mail, clave, !yaTengo).then(function (ses) {
        s = ses; sesionFb = ses;
        return buscarPorCodigo(codigo);
      }).then(function (existente) {
        if (existente) {
          if (existente.dueno !== s.uid) throw new Error('EN_USO');
          return existente.gid; // el dueño entra desde otro dispositivo: se baja lo de la nube
        }
        var d = leer(CLAVE_DATOS);
        if (d && d.gym && d.gym.nombre === 'Mi gimnasio' && nombreGym) d.gym.nombre = nombreGym;
        var raiz = slug(nombreGym || (d && d.gym && d.gym.nombre));
        // Primer nombre libre: focus, focus-2, focus-3...
        function libre(n) {
          var gid = n ? raiz + '-' + (n + 1) : raiz;
          return leerDoc('gimnasios/' + gid).then(function (g) { return g && n < 50 ? libre(n + 1) : gid; });
        }
        return libre(0).then(function (gid) {
          return escribirDoc('gimnasios/' + gid, { codigo: codigo, dueno: s.uid, datos: JSON.stringify(sinAdmin(d)), borradas: '[]', actualizado: Date.now() }, s.token, true)
            .then(function () { return gid; });
        });
      }).then(function (gid) {
        cfg = { gid: gid, rol: 'dueno', uid: s.uid, email: mail, refresh: s.refresh };
        guardarCfg();
        var d = leer(CLAVE_DATOS) || {};
        d.admin = { email: mail, clave: clave };
        guardarLocal(CLAVE_DATOS, d);
        location.reload();
      }).catch(function (e) {
        boton.disabled = false;
        error.textContent = e && e.message === 'EN_USO' ? 'Ese código ya lo usa otro gimnasio. Escribile a Becker.'
          : e && e.codigo ? mensajeAuth(e)
          : e && e.status === 403 ? 'La nube todavía no está habilitada para Gym App. Avisale a Becker.'
          : 'No se pudo conectar. Revisá internet y probá de nuevo.';
      });
    });
  }

  // "Acceso administrador" en un dispositivo que bajó el gimnasio de la nube:
  // se valida con Firebase y, si es el dueño, este dispositivo pasa a ser del dueño.
  var dejarPasar = false;
  window.addEventListener('submit', function (e) {
    var f = e.target, mail = f && f.querySelector && f.querySelector('#mail'), clave = f && f.querySelector('#clave');
    if (!mail || !clave || dejarPasar || !cfg || !cfg.gid) return;
    var d = leer(CLAVE_DATOS);
    if (esDueno() && d && d.admin && d.admin.email === mail.value.trim().toLowerCase() && d.admin.clave === clave.value) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var email = mail.value.trim().toLowerCase(), pass = clave.value;
    var s;
    entrarFirebase(email, pass, false).then(function (ses) {
      s = ses;
      return leerDoc('gimnasios/' + encodeURIComponent(cfg.gid));
    }).then(function (g) {
      if (!g || g.dueno !== s.uid) { avisar('Esa cuenta no es la del dueño de este gimnasio.'); return; }
      sesionFb = s;
      cfg = { gid: cfg.gid, rol: 'dueno', uid: s.uid, email: email, refresh: s.refresh };
      guardarCfg();
      var actual = leer(CLAVE_DATOS);
      actual.admin = { email: email, clave: pass };
      aplicar(actual);
      setTimeout(function () { dejarPasar = true; try { f.requestSubmit(); } finally { dejarPasar = false; } }, 50);
    }).catch(function (err) { avisar(err && err.codigo ? mensajeAuth(err) : 'No se pudo conectar. Revisá internet.'); });
  }, true);

  // Fuera de la demo no se muestra el usuario y la contraseña de prueba.
  var revisando = false;
  function ocultarPistaDemo() {
    if (revisando) return;
    revisando = true;
    requestAnimationFrame(function () {
      revisando = false;
      var ps = document.querySelectorAll('p.t-tenue');
      for (var i = 0; i < ps.length; i++) {
        if (!/Versión de prueba/.test(ps[i].textContent)) continue;
        var d = leer(CLAVE_DATOS);
        if (d && d.gym && d.gym.nombre !== NOMBRE_DEMO) ps[i].style.display = 'none';
      }
    });
  }

  // Ajustes: si el gimnasio está activado pero no está en la nube, el QR llevaría a la demo.
  // Se tapa el QR y se ofrece conectarlo.
  function revisarLinkAjustes() {
    var sec = document.querySelector('[aria-label="Link y QR"]');
    if (!sec) return;
    var d = leer(CLAVE_DATOS), lic = leer(CLAVE_LICENCIA);
    var falta = !(cfg && cfg.gid) && d && d.gym && d.gym.nombre !== NOMBRE_DEMO;
    var aviso = sec.querySelector('#nube-falta');
    Array.prototype.forEach.call(sec.children, function (h) { if (h.tagName !== 'H2' && h.id !== 'nube-falta') h.style.display = falta ? 'none' : ''; });
    if (!falta) { if (aviso) aviso.remove(); return; }
    if (aviso) return;
    aviso = document.createElement('div');
    aviso.id = 'nube-falta';
    aviso.style.cssText = 'border:1px solid #E0A33A;background:rgba(224,163,58,.1);border-radius:12px;padding:14px;display:grid;gap:10px;font-size:14px';
    aviso.innerHTML = '<b>El link para alumnos todavía no está listo.</b>' +
      '<span>Este gimnasio no está conectado a la nube: si les pasás el link o el QR, a tus alumnos les abre la demo y no los encuentra. Conectalo creando tu acceso de dueño.</span>';
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-primario'; b.textContent = lic ? 'Conectar mi gimnasio' : 'Activar con mi código';
    b.onclick = function () {
      if (lic) pasoCuenta(lic.codigo, lic.gimnasio, false);
      else { localStorage.removeItem(CLAVE_LICENCIA); location.reload(); }
    };
    aviso.appendChild(b);
    sec.appendChild(aviso);
  }

  function instalada() {
    try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch (e) { return false; }
  }
  function pantallaElegirGym() {
    mostrar(
      '<div class="icono">🏋️</div><h1>¿De qué gimnasio sos?</h1>' +
      '<p>Escaneá de nuevo el QR de tu gimnasio, o escribí acá el nombre que aparece al final de su link (por ejemplo, en <b>…/?g=focus</b> es <b>focus</b>).</p>' +
      '<form id="nube-gym"><input id="nube-gid" autocomplete="off" autocapitalize="none" placeholder="focus" aria-label="Gimnasio">' +
      '<div class="error" id="nube-gerr"></div><button class="primario" id="nube-gok">Entrar</button></form>' +
      '<button class="secundario" id="nube-demo">Solo quiero ver la demo</button>'
    );
    var input = document.getElementById('nube-gid'), err = document.getElementById('nube-gerr'), ok = document.getElementById('nube-gok');
    document.getElementById('nube-demo').onclick = function () { guardarLocal('gymapp-quiere-demo', true); location.reload(); };
    document.getElementById('nube-gym').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = input.value.trim(), m = t.match(/[?&]g=([^&#\s]+)/);
      var gid = m ? decodeURIComponent(m[1]) : slug(t);
      if (!t) { err.textContent = 'Escribí el nombre de tu gimnasio.'; return; }
      ok.disabled = true; err.textContent = '';
      leerDoc('gimnasios/' + encodeURIComponent(gid)).then(function (g) {
        if (!g) { ok.disabled = false; err.textContent = 'No encontramos ese gimnasio. Fijate en el link que te pasaron.'; return; }
        location.replace(location.pathname + '?g=' + encodeURIComponent(gid));
      }).catch(function () { ok.disabled = false; err.textContent = 'No hay conexión. Probá de nuevo con internet.'; });
    });
  }

  window.gymNube = { pasoCuenta: pasoCuenta, config: function () { return cfg; } };

  // ----- Arranque ------------------------------------------------------
  function arrancar() {
    var g = new URLSearchParams(location.search).get('g');
    if (g && (!cfg || cfg.gid !== g)) {
      // Link de un gimnasio: este dispositivo pasa a mostrar ese gimnasio, aunque antes fuera
      // dueño de otro (sus datos quedan en la nube y vuelve a entrar con Acceso administrador).
      cfg = { gid: g, rol: 'alumno' };
      guardarCfg();
      localStorage.removeItem(CLAVE_DATOS);
      localStorage.removeItem(CLAVE_LICENCIA);
      try { sessionStorage.removeItem(CLAVE_SESION); } catch (e) {}
      actualizarLink();
    }
    if (cfg && cfg.gid) {
      if (!leer(CLAVE_DATOS)) pantallaCarga();
      bajar(true);
      setInterval(function () { if (document.visibilityState === 'visible') bajar(false); }, SEGUNDOS_ENTRE_BAJADAS * 1000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') bajar(false); });
    } else if (instalada() && !leer(CLAVE_LICENCIA) && !leer('gymapp-quiere-demo')) {
      // App instalada que abrió sin saber el gimnasio (por ejemplo en iPhone, que no comparte
      // memoria con Safari): en vez de la demo, pregunta de qué gimnasio es.
      pantallaElegirGym();
    } else {
      // Gimnasio activado antes de que existiera la nube: falta crear el acceso del dueño.
      var lic = leer(CLAVE_LICENCIA), d = leer(CLAVE_DATOS);
      var yaPregunto = false; try { yaPregunto = sessionStorage.getItem('gymapp-nube-despues'); sessionStorage.setItem('gymapp-nube-despues', '1'); } catch (e) {}
      if (lic && d && d.gym && d.gym.nombre !== NOMBRE_DEMO && !yaPregunto) pasoCuenta(lic.codigo, lic.gimnasio, false);
    }
    new MutationObserver(function () { ocultarPistaDemo(); revisarLinkAjustes(); }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) arrancar();
  else document.addEventListener('DOMContentLoaded', arrancar);
})();
