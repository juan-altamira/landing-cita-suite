# Landing de Cita Suite

Sitio público de presentación en <https://cita-suite.com.ar>. La aplicación vive en
<https://app.cita-suite.com.ar>; ingreso, privacidad y términos enlazan allí.

## Desarrollo

```sh
npm ci
npm run dev
npm run build   # genera dist/
```

## Publicación

Vercel publica cada push a `main` en `cita-suite.com.ar` y en `cita-suite.vercel.app`
(proyecto `landing-cita-suite`). `vercel.json` define los encabezados de seguridad y caché y
redirige `/login`, `/privacidad` y `/terminos` a la aplicación. El DNS del dominio está en
Cloudflare: `cita-suite.com.ar` es un CNAME sin proxy hacia Vercel.

La configuración de Cloudflare Workers con la que la landing se sirvió brevemente quedó en el
historial (commit `fc177a8`). Volver a publicarla con su dominio reemplazaría ese CNAME:
hacerlo sólo como un cambio deliberado de alojamiento.
