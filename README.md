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

`cita-suite.com.ar` se sirve desde Cloudflare Workers: el Worker `cita-suite-landing` sólo
contiene los archivos de `dist/` (sin código propio, así que no consume la cuota diaria de
Workers) y su dominio está declarado en `wrangler.jsonc`. `public/_headers` define los
encabezados de seguridad y caché, y `public/_redirects` lleva `/login`, `/privacidad` y
`/terminos` a la aplicación (en Vercel lo hace `vercel.json`).

```sh
npm run build
npx wrangler@4.86.0 deploy
```

Requiere `wrangler login` con acceso a la cuenta de Cloudflare de Cita Suite. Para que cada
push a `main` publique solo, conectar el repositorio en Cloudflare → Workers & Pages →
`cita-suite-landing` → Settings → Builds, con `npm run build` como comando de compilación y
`npx wrangler deploy` como comando de despliegue.

Vercel sigue publicando cada push a `main` en `cita-suite.vercel.app`; es una copia, no el
dominio principal.
