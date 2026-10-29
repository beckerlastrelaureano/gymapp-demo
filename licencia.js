/**
 * licencia.js — Código de acceso de Becker para Gym App
 * -----------------------------------------------------------------------
 * - Con los datos de demo ("Gimnasio Demo") la app funciona libre.
 * - Cuando el gimnasio formatea ("Sí, empezar de cero"), la app pide el
 *   código que le da Becker. Sin código válido no se puede usar.
 * - Con código, cada vez que se abre se consulta si sigue activo. Si Becker
 *   lo suspende desde Rumbo (Marca Personal > Clientes), la app se bloquea.
 *
 * Los códigos viven en Firebase (proyecto becker-sync, colección "licencias").
 * Este archivo se carga ANTES que la app, sin tocar el código de la demo.
 */
(function () {
  // ----- Configuración (editable) --------------------------------------
  var PROYECTO = 'becker-sync';
  var API_KEY = 'AIzaSyD9CG3aFhpSl_waa1GyqUvoDYtG7k7yG7o'; // pública, la misma de Rumbo
  var WHATSAPP_BECKER = '5492954574231';
  var DIAS_SIN_INTERNET = 15;   // días que se puede usar sin poder verificar el código
  var MINUTOS_ENTRE_CONTROLES = 30;

  // ----- Claves de la app de demo (no cambiar) -------------------------
  var CLAVE_DATOS = 'gymapp-datos-v1';
  var CLAVE_LICENCIA = 'gymapp-licencia';
  var NOMBRE_DEMO = 'Gimnasio Demo';
  var NOMBRE_VACIO = 'Mi gimnasio';

  var DIA = 86400000;
  var setItemOriginal = Storage.prototype.setItem;

  function leer(clave) {
    try { return JSON.parse(localStorage.getItem(clave)); } catch (e) { return null; }
  }
  function guardar(clave, valor) {
    setItemOriginal.call(localStorage, clave, JSON.stringify(valor));
  }

  // Sin datos guardados la demo arranca con "Gimnasio Demo".
  function esDemo() {
    var d = leer(CLAVE_DATOS);
    return !d || !d.gym || d.gym.nombre === NOMBRE_DEMO;
  }

  // Consulta el código en Firestore. Devuelve { estado, gimnasio } o null si no existe.
  function consultar(codigo) {
    var url = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO +
      '/databases/(default)/documents/licencias/' + encodeURIComponent(codigo) + '?key=' + API_KEY;
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('red');
      return r.json().then(function (doc) {
        var f = doc.fields || {};
        var texto = function (k) { return f[k] && f[k].stringValue || ''; };
        return { estado: texto('estado'), gimnasio: texto('gimnasio') };
      });
    });
  }

  // ----- Pantalla que tapa la app --------------------------------------
  var capa = null;
  function estilos() {
    if (document.getElementById('lic-estilos')) return;
    var s = document.createElement('style');
    s.id = 'lic-estilos';
    s.textContent =
      '#lic{position:fixed;inset:0;z-index:2147483647;background:radial-gradient(900px 500px at 50% -150px,rgba(15,93,117,.35),transparent 70%),#0A0C0E;' +
      'color:#F2F4F7;font:15px/1.5 Inter,system-ui,sans-serif;display:grid;place-items:center;padding:16px;overflow:auto}' +
      '#lic .caja{width:min(420px,100%);background:#14171C;border:1px solid #262B33;border-radius:20px;padding:26px 22px;text-align:center}' +
      '#lic h1{font:700 1.6rem "Space Grotesk",system-ui,sans-serif;margin:8px 0 6px;letter-spacing:-.01em}' +
      '#lic p{color:#98A2B0;margin:0 0 16px}' +
      '#lic .icono{width:64px;height:64px;margin:0 auto 6px;border-radius:18px;display:grid;place-items:center;background:rgba(15,93,117,.25);border:1px solid rgba(80,170,200,.35);font-size:28px}' +
      '#lic input{width:100%;box-sizing:border-box;font:600 1.2rem "JetBrains Mono",monospace;letter-spacing:.08em;text-align:center;text-transform:uppercase;' +
      'color:#F2F4F7;background:#0A0C0E;border:1px solid #262B33;border-radius:12px;padding:14px;margin-bottom:12px}' +
      '#lic input:focus{outline:2px solid #3FA7C9;border-color:transparent}' +
      '#lic button,#lic a{display:block;width:100%;box-sizing:border-box;border:0;border-radius:12px;padding:14px;font:600 1rem Inter,sans-serif;cursor:pointer;text-decoration:none}' +
      '#lic .primario{background:#3FA7C9;color:#06141A;margin-bottom:10px}' +
      '#lic .primario:disabled{opacity:.6;cursor:wait}' +
      '#lic .secundario{background:transparent;color:#98A2B0;border:1px solid #262B33}' +
      '#lic .error{color:#FF6B6B;font-weight:600;min-height:1.5em;margin:0 0 10px}';
    document.head.appendChild(s);
  }
  function mostrar(html) {
    estilos();
    if (!capa) {
      capa = document.createElement('div');
      capa.id = 'lic';
      capa.setAttribute('role', 'dialog');
      capa.setAttribute('aria-modal', 'true');
      document.body.appendChild(capa);
    }
    capa.innerHTML = '<div class="caja">' + html + '</div>';
  }
  function ocultar() {
    if (capa) { capa.remove(); capa = null; }
  }

  function pantallaCodigo() {
    mostrar(
      '<div class="icono">🔑</div>' +
      '<h1>Activá tu gimnasio</h1>' +
      '<p>Ingresá el código de acceso que te dio Becker.</p>' +
      '<form id="lic-form"><input id="lic-codigo" autocomplete="off" placeholder="GYM-XXXX-XXXX" aria-label="Código de acceso">' +
      '<div class="error" id="lic-error"></div>' +
      '<button class="primario" id="lic-activar">Activar</button></form>' +
      '<a class="secundario" href="https://wa.me/' + WHATSAPP_BECKER + '?text=' +
      encodeURIComponent('Hola Becker! Quiero mi código de acceso para Gym App.') + '" target="_blank" rel="noopener">Pedir mi código</a>' +
      '<button class="secundario" id="lic-demo" style="margin-top:10px">Volver a la demo</button>'
    );
    var form = document.getElementById('lic-form');
    var input = document.getElementById('lic-codigo');
    var error = document.getElementById('lic-error');
    var boton = document.getElementById('lic-activar');
    input.focus();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var codigo = input.value.trim().toUpperCase().replace(/\s+/g, '');
      if (!codigo) { error.textContent = 'Escribí el código.'; return; }
      boton.disabled = true;
      boton.textContent = 'Verificando…';
      error.textContent = '';
      consultar(codigo).then(function (lic) {
        if (!lic) { error.textContent = 'Ese código no existe. Revisalo.'; return; }
        if (lic.estado !== 'activo') { error.textContent = 'Ese código está suspendido. Escribile a Becker.'; return; }
        guardar(CLAVE_LICENCIA, { codigo: codigo, gimnasio: lic.gimnasio, verificado: Date.now() });
        // Si el gimnasio todavía se llama "Mi gimnasio", le pone el nombre del código.
        var d = leer(CLAVE_DATOS);
        if (d && d.gym && d.gym.nombre === NOMBRE_VACIO && lic.gimnasio) {
          d.gym.nombre = lic.gimnasio;
          guardar(CLAVE_DATOS, d);
        }
        location.reload();
      }).catch(function () {
        error.textContent = 'No hay conexión. Probá de nuevo con internet.';
      }).then(function () {
        boton.disabled = false;
        boton.textContent = 'Activar';
      });
    });

    document.getElementById('lic-demo').addEventListener('click', function () {
      localStorage.removeItem(CLAVE_DATOS);
      location.reload();
    });
  }

  function pantallaSuspendida(lic, motivo) {
    var nombre = lic.gimnasio || 'tu gimnasio';
    mostrar(
      '<div class="icono">⏸</div>' +
      '<h1>Acceso pausado</h1>' +
      '<p>' + (motivo === 'sin-internet'
        ? 'Hace más de ' + DIAS_SIN_INTERNET + ' días que no se puede verificar el código. Conectate a internet y volvé a abrir la app.'
        : 'El acceso de Gym App para ' + nombre.replace(/[<>&]/g, '') + ' está suspendido. Escribile a Becker para reactivarlo.') + '</p>' +
      '<a class="primario" href="https://wa.me/' + WHATSAPP_BECKER + '?text=' +
      encodeURIComponent('Hola Becker! Soy de ' + nombre + '. Quiero reactivar Gym App (código ' + lic.codigo + ').') +
      '" target="_blank" rel="noopener">Escribir a Becker</a>' +
      '<button class="secundario" id="lic-reintentar">Ya está, volver a probar</button>'
    );
    document.getElementById('lic-reintentar').addEventListener('click', function () { location.reload(); });
  }

  // ----- Control principal ---------------------------------------------
  var controlando = false;
  function controlar() {
    if (controlando) return;
    var lic = leer(CLAVE_LICENCIA);

    if (!lic) {
      if (esDemo()) ocultar(); else pantallaCodigo();
      return;
    }

    controlando = true;
    consultar(lic.codigo).then(function (remota) {
      if (!remota || remota.estado !== 'activo') { pantallaSuspendida(lic, 'suspendido'); return; }
      lic.verificado = Date.now();
      lic.gimnasio = remota.gimnasio || lic.gimnasio;
      guardar(CLAVE_LICENCIA, lic);
      ocultar();
    }).catch(function () {
      // Sin internet: se permite usar un tiempo desde la última verificación.
      if (Date.now() - (lic.verificado || 0) > DIAS_SIN_INTERNET * DIA) pantallaSuspendida(lic, 'sin-internet');
      else ocultar();
    }).then(function () { controlando = false; });
  }

  // Si la app formatea los datos ("empezar de cero"), se vuelve a controlar al instante.
  Storage.prototype.setItem = function (clave, valor) {
    setItemOriginal.call(this, clave, valor);
    if (this === localStorage && clave === CLAVE_DATOS && !leer(CLAVE_LICENCIA)) {
      setTimeout(controlar, 0);
    }
  };

  function arrancar() {
    controlar();
    setInterval(controlar, MINUTOS_ENTRE_CONTROLES * 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') controlar();
    });
  }
  if (document.body) arrancar();
  else document.addEventListener('DOMContentLoaded', arrancar);
})();
