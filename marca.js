/**
 * marca.js — Ícono y nombre de cada gimnasio al instalar la app
 * -----------------------------------------------------------------------
 * Con un gimnasio que no es la demo, arma el manifest de la app con el
 * nombre del gimnasio y su logo (o sus iniciales sobre su color), y cambia
 * el ícono de iPhone (apple-touch-icon). Así, al "Instalar" o "Agregar a
 * inicio", el ícono es el del gimnasio. La demo usa el manifest de siempre.
 */
(function () {
  var CLAVE_DATOS = 'gymapp-datos-v1';
  var CLAVE_NUBE = 'gymapp-nube';
  var NOMBRE_DEMO = 'Gimnasio Demo';

  function leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function iniciales(nombre) {
    return String(nombre || '').trim().split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (p) { return p[0]; }).join('').toUpperCase() || 'G';
  }
  function cargarImagen(src) {
    return new Promise(function (ok) {
      if (!src) return ok(null);
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = function () { ok(null); };
      img.src = src;
    });
  }

  // Ícono cuadrado en PNG: el logo ocupando todo (como dentro de la app) o las iniciales.
  // margen: Android recorta el ícono en círculo; con margen el logo no se corta.
  function dibujar(img, gym, tam, margen) {
    var m = Math.round(tam * (margen || 0));
    var c = document.createElement('canvas');
    c.width = c.height = tam;
    var x = c.getContext('2d');
    if (img) {
      x.fillStyle = '#FFFFFF';
      x.fillRect(0, 0, tam, tam);
      var lado = Math.min(img.naturalWidth, img.naturalHeight);
      x.drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, m, m, tam - 2 * m, tam - 2 * m);
    } else {
      x.fillStyle = gym.acento || '#0F5D75';
      x.fillRect(0, 0, tam, tam);
      x.fillStyle = '#FFFFFF';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = '700 ' + Math.round(tam * (margen ? 0.3 : 0.38)) + 'px "Space Grotesk", Inter, system-ui, sans-serif';
      x.fillText(iniciales(gym.nombre), tam / 2, tam * 0.53);
    }
    return c.toDataURL('image/png');
  }

  function poner(sel, crear, attr, valor) {
    var el = document.querySelector(sel);
    if (!el) { el = document.createElement(crear.tag); Object.keys(crear).forEach(function (k) { if (k !== 'tag') el.setAttribute(k, crear[k]); }); document.head.appendChild(el); }
    if (el.getAttribute(attr) !== valor) el.setAttribute(attr, valor);
  }

  var original = null, ultima = '';
  function aplicar() {
    var d = leer(CLAVE_DATOS), gym = d && d.gym;
    var link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    if (!original) original = { manifest: 'manifest.json', apple: (document.querySelector('link[rel="apple-touch-icon"]') || {}).href, titulo: (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content };
    var cfg = leer(CLAVE_NUBE) || {};
    var firma = gym && gym.nombre !== NOMBRE_DEMO ? [gym.nombre, gym.acento, gym.logo, cfg.gid].join('|') : 'demo';
    if (firma === ultima) return;
    ultima = firma;

    if (firma === 'demo') {
      link.setAttribute('href', original.manifest);
      if (original.apple) poner('link[rel="apple-touch-icon"]', { tag: 'link', rel: 'apple-touch-icon' }, 'href', original.apple);
      if (original.titulo) poner('meta[name="apple-mobile-web-app-title"]', { tag: 'meta', name: 'apple-mobile-web-app-title' }, 'content', original.titulo);
      return;
    }

    cargarImagen(gym.logo).then(function (img) {
      if (firma !== ultima) return; // cambió mientras cargaba
      var i192 = dibujar(img, gym, 192), i512 = dibujar(img, gym, 512), i180 = dibujar(img, gym, 180), iMask = dibujar(img, gym, 512, 0.12);
      var carpeta = location.origin + location.pathname.replace(/[^/]*$/, '');
      var inicio = carpeta + (cfg.gid ? '?g=' + encodeURIComponent(cfg.gid) : '');
      var nombre = String(gym.nombre || 'Mi gimnasio');
      var manifest = {
        id: inicio,
        name: nombre,
        short_name: nombre.length > 14 ? nombre.split(/\s+/)[0].slice(0, 14) : nombre,
        description: 'Rutinas, cuotas y asistencia de ' + nombre,
        lang: 'es-AR',
        start_url: inicio,
        scope: carpeta,
        display: 'standalone',
        background_color: '#0A0C0E',
        theme_color: '#0A0C0E',
        icons: [
          { src: i192, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: i512, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: iMask, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      };
      link.setAttribute('href', 'data:application/manifest+json;charset=utf-8,' + encodeURIComponent(JSON.stringify(manifest)));
      poner('link[rel="apple-touch-icon"]', { tag: 'link', rel: 'apple-touch-icon' }, 'href', i180);
      poner('link[rel="icon"]', { tag: 'link', rel: 'icon', type: 'image/png' }, 'href', i192);
      poner('meta[name="apple-mobile-web-app-title"]', { tag: 'meta', name: 'apple-mobile-web-app-title' }, 'content', manifest.short_name);
    });
  }

  // Se revisa al abrir, cuando cambian los datos (logo, nombre, color) y cada tanto.
  var setPrevio = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    setPrevio.call(this, k, v);
    if (this === localStorage && (k === CLAVE_DATOS || k === CLAVE_NUBE)) setTimeout(aplicar, 0);
  };
  window.addEventListener('storage', function () { setTimeout(aplicar, 0); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aplicar);
  else aplicar();
  setInterval(aplicar, 5000);
})();
