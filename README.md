# gymApp (demo + código de acceso de Becker + nube)

Copia de la demo de gymapp-demo.vercel.app con tres agregados: `licencia.js`, `nube.js` y `marca.js`.
Publicada en https://beckerlastrelaureano.github.io/gymapp-demo/

- Con los datos de ejemplo ("Gimnasio Demo") se usa libre, para mostrarla.
- En *Ajustes del gimnasio > Empezar como gimnasio nuevo* se formatea. Desde ahí la app
  pide el **código de acceso** que da Becker (se crean en Rumbo > Marca Personal > Clientes).
- Cada vez que se abre, consulta si el código sigue activo. Si Becker lo suspende, se bloquea.
  Sin internet se puede usar hasta 15 días desde la última verificación.

Los códigos están en Firebase, proyecto `becker-sync`, colección `licencias`
(`{ gimnasio, estado: "activo" | "suspendido", whatsapp, vencePago }`).

Notas técnicas:
- `assets/` es la app ya compilada (no hay código fuente). No editar a mano salvo lo justo.
- Las animaciones de ejercicios se cargan desde gymapp-demo.vercel.app (no borrar ese proyecto de Vercel).
- Los datos de cada gimnasio se guardan en el navegador del dispositivo donde se usa.

## Nube y link propio de cada gimnasio (`nube.js`)

1. Después de poner el código, el dueño crea su acceso con su email (Gmail) y contraseña.
2. El gimnasio se sube a Firebase (`gimnasios/{gid}`, por ejemplo `gimnasios/focus`).
3. En Ajustes, el link y el QR para alumnos pasan a ser `.../gymapp-demo/?g=focus`.
   Quien lo abre ve el nombre y la marca del gimnasio y entra con su DNI.
4. Los datos se bajan solos cada 20 segundos (y al volver a la app).
5. Solo el dispositivo donde entró el dueño ("Acceso administrador" con su email) sube
   cambios del gimnasio. Los alumnos suben solo lo suyo a `gimnasios/{gid}/alumnos/{id}`.
6. En otro dispositivo, el dueño abre el link del gimnasio y entra con "Acceso administrador"
   y su email: ese dispositivo pasa a ser del dueño.

Antes de usarlo hay que pegar las reglas de `reglas-firebase.txt` en la consola de Firebase.
Si un gimnasio ya estaba activado, la próxima vez que se abre la app le pide crear el acceso.

Límites conocidos:
- Los profes que entran con DNI en su propio celular pueden ver el panel, pero sus cambios no
  se guardan en la nube (la app avisa). Tienen que usar un dispositivo donde entró el dueño.
- Las anotaciones de los alumnos se pueden escribir sin cuenta (cualquiera con el link).
- Los GIF, fotos y el logo se guardan aparte (`gimnasios/{gid}/medios/`, en pedazos), así el
  documento principal del gimnasio no pasa el máximo de 1 MB de Firestore. Hace falta el bloque
  `medios` de `reglas-firebase.txt`.
- Si la nube rechaza un cambio, ese dispositivo no baja nada hasta poder guardarlo (no se pierde).
- Todo se guarda también en el navegador: en iPhone el máximo es de unos 5 MB, así que conviene
  usar GIF livianos (menos de 500 KB).

## Ícono de cada gimnasio al instalar (`marca.js`)

Fuera de la demo, el manifest de la app se arma con el nombre del gimnasio y su logo (o sus
iniciales sobre su color si no tiene logo). También cambia el ícono de iPhone. La app instalada
abre directo en el link del gimnasio (`?g=...`). Si el dueño cambia el logo, lo toman las
instalaciones nuevas; las que ya estaban instaladas pueden tardar en actualizarse o necesitar
reinstalarse (eso lo decide el celular).

## También en Vercel

Es la misma app, publicada desde este repo (Vercel > Add New > Project > importar
`gymapp-demo`, sin cambiar nada de la configuración). No usar el nombre `gymapp-demo` en Vercel:
ese es el proyecto de donde salen las animaciones.

- Los datos de cada gimnasio están en la nube, así que el link de GitHub y el de Vercel muestran lo mismo.
  Los dos siguen funcionando.
- Cada dirección guarda aparte su memoria del navegador: en la de Vercel, el dueño entra una vez con
  "Acceso administrador" y su email; los alumnos vuelven a poner su DNI.

## Divisiones en las rutinas

Cada ejercicio puede tener `bloque` (por ejemplo `Entrada en calor`). El profe lo elige debajo del
nombre del ejercicio y vale desde ahí hasta la división siguiente. Los títulos se ven en el editor,
en la ficha del alumno, en la rutina del día, en la rutina completa y en el PDF. Sin `bloque`, todo
se ve como antes. El código agregado al bundle son las funciones `bqK`, `bqN`, `bqH`, `bqSet` y `bqSel`.
