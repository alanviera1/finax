# AGENTS.md

PWA personal de finanzas (Firestore + Gemini) en vanilla JS, sin build, sin bundler, sin dependencias npm y sin framework de tests. Entry point único: `js/bootstrap.js`, cargado en `index.html` como `<script type="module">`.

## Arquitectura: capas con dependencia unidireccional

```
core -> ui -> services -> features -> js/bootstrap.js (wiring)
```

- `js/core/` (hoja): state, dom, constants, storage, utils, secrets. No importa nada del repo.
- `js/ui/`: solo importa core.
- `js/services/`: importa core, ui (exclusivamente `ui/toast.js`) y firebase-config. Nunca features.
- `js/features/`: importa core, ui, services, firebase-config y otros features. Cross-feature acotado y por convención: `transactions.js` exporta `registerTransactionAtomic` y `reserveAccountDebit` (usados por debts/savings); `navigation.js` importa de transactions/debts/savings/subscriptions.
- `js/bootstrap.js`: único archivo que hace wiring (listeners con callbacks, DI de audio/notificaciones, eventos). Nada más debe importar de él.

Regla dura: **core/ui/services nunca pueden importar features ni bootstrap**. Si un cambio lo exige, reintroduce una llamada por callback/DI desde bootstrap.

## Convenciones de módulos (no hay bundler)

- Imports relativos SIEMPRE con extensión `.js` explícita (`./core/utils.js`), sin aliases ni path absolutos. Todo identificador usado debe estar importado.
- `firebase-config.js` vive en la raíz (fuera de `js/`): desde `js/features/` se importa como `../../firebase-config.js`; desde `js/services/firestore/` como `../../../firebase-config.js`. Su inicialización (`initializeApp` + `initializeFirestore` con `persistentLocalCache`) corre como side-effect del primer import: NO debe agregarse `<script>` para firebase-config en index.html.
- Funciones top-level nombradas con `export function` explícito; no hay exports default.
- Chart.js se usa como global `window.Chart` (CDN), nunca se importa.
- Sin package.json, Node trata `.js` como CommonJS: `node --check` directo falla con sintaxis ESM. Para validar sintaxis, copiar el archivo a un temporal con extensión `.mjs` y correr `node --check` ahí.

## Estado y DOM

- Todo el estado vive en `js/core/state.js` (maps `transactions`, `debts`, `savingsGoals`, `subscriptions`, flags, etc.). `js/core/dom.js` resuelve los ids del HTML una sola vez (`bindDom()` -> `dom.*`); las features renderizan desde `state` vía `dom.*`, sin querySelector dispersos.
- Firestore solo se escucha en `js/services/firestore/listeners.js`; notifica a las features mediante callbacks que inyecta bootstrap (`onBalanceSummary`, `onDebtsChange`, ...). Las features no abren snapshot listeners.

## Versiones: mantener 4 valores sincronizados (bump juntos)

- `BUILD_ID` en `js/core/constants.js`
- `CACHE_VERSION` en `sw.js`
- query `?v=` de `./js/bootstrap.js` en `index.html`
- query `?v=` de `./js/bootstrap.js` en `sw.js` (APP_SHELL_URLS)

Actual: `20260805-bootstrap-v1`. Un bump parcial deja a usuarios con caché vieja.

## Service Worker (`sw.js`)

- `APP_SHELL_URLS` precachea TODOS los módulos de core/ui/services/features + firebase-config + bootstrap + iconos. Al crear cualquier archivo bajo `js/`, hay que añadirlo a la lista y hacer el bump completo (ver arriba).
- Solo existen `icons/icon-192.png` y `icons/icon-512.png` (no hay SVG): manifest y SW referencian los PNG.
- `cache.addAll` aborta el install si alguna URL da 404: toda ruta listada debe existir (regla de oro para el modo offline).
- APIs financieras (Firestore, `generativelanguage.googleapis.com`, `*.googleapis.com`, `*.firebaseio.com`) jamás se sirven desde caché (`isFinancialApiRequest`).
- CDN (Tailwind, Font Awesome, Chart.js) se cachean en install como runtime con `no-cors` (respuestas opaque).

## Secrets

- `js/core/secrets.js` está en `.gitignore` y contiene `GEMINI_API_KEY` real: copiar `js/core/secrets.example.js` -> `secrets.js`. Nunca loguear la llave ni commitearla. El `firebaseConfig` (apiKey, projectId, ...) sí está hardcodeado en `firebase-config.js`.

## Verificación y git

- No hay tests automatizados: la validación son smoke tests manuales en navegador (online y offline tras reinstalar el SW).
- Antes de reportar un cambio: `node --check` (truco .mjs), revisar que el grafo de imports no tenga huérfanos ni capas invertidas, y CRLF=0 (los archivos del repo usan LF).
- Mensajes de commit en español con prefijo convencional (ej. `feat: ...`).

## Dominio del Negocio (Finax)

- Finax es un tracker financiero personal.
- Entidades principales: Transacciones (ingresos/gastos), Deudas (préstamos y pagos), Metas de Ahorro y Suscripciones recurrentes.
- Uso de IA (Gemini): Se utiliza para procesar comandos de voz (audio a texto), analizar transacciones ingresadas de forma natural (Smart Transactions) y generar comentarios sarcásticos o de advertencia ("roasts") sobre los gastos del usuario.

## Sistema de Diseño y UI

- Se utiliza Tailwind CSS (vía CDN) para todos los estilos.
- Se utiliza FontAwesome (vía CDN) para los íconos.
- La interfaz es mobile-first.
- Las interacciones principales (crear transacción, añadir deuda, etc.) NO usan alerts ni ventanas nuevas, utilizan el componente propio `bottomSheet` (modales que se deslizan desde abajo).
- Las notificaciones al usuario se hacen exclusivamente a través del módulo `ui/toast.js`.
