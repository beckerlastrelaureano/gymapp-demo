# gymApp (demo + código de acceso de Becker)

Copia de la demo de gymapp-demo.vercel.app con un agregado: `licencia.js`.

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
