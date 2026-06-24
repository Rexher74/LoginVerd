# Login Verd para la UPC — versión Firefox

Versión para **Firefox** (escritorio y **Android**) de la extensión *Login Verd*, que
inicia sesión automáticamente en `login.upc.edu`, incluido el segundo factor (2FA).

Funciona exactamente igual que la versión de Chrome: configuras una vez tu usuario,
contraseña y la clave 2FA (a partir del QR de la UPC) y entras con un solo clic.
Todos los datos se guardan **solo en local** en tu navegador; no se envían a ningún servidor.

> Esta carpeta es independiente de la extensión de Chrome de la raíz del repositorio.
> No modifica nada de la versión original.

## Instalación

### Escritorio (Firefox)

**Opción A — Temporal (para probar, se borra al cerrar Firefox):**

1. Abre `about:debugging#/runtime/this-firefox`.
2. Pulsa **«Cargar complemento temporal…»** (*Load Temporary Add-on*).
3. Selecciona el archivo `manifest.json` dentro de la carpeta `LoginVerd-Firefox/`.

**Opción B — Instalación permanente:** Firefox solo instala de forma permanente las
extensiones **firmadas por Mozilla**. Sube `LoginVerd-Firefox.zip` (en la raíz del repo)
a [addons.mozilla.org](https://addons.mozilla.org/developers/) para firmarlo, o usa
**Firefox Developer Edition / Nightly** poniendo `xpinstall.signatures.required` a `false`
en `about:config` y arrastrando el `.zip`/`.xpi` a la ventana.

### Android (Firefox para Android)

El soporte de extensiones MV3 está disponible en Firefox para Android moderno. Para
instalar una extensión propia (no publicada en AMO):

1. **Vía AMO (recomendado):** firma el `.zip` en
   [addons.mozilla.org](https://addons.mozilla.org/developers/) (puede ser «self-distributed»)
   e instálalo desde el enlace de descarga del `.xpi` que te da Mozilla.
2. **Vía USB con Firefox Nightly:** activa las *Custom Add-on collections* en
   Ajustes → *Secret settings*, o usa `web-ext run -t firefox-android` desde el escritorio
   con el móvil conectado por USB y la depuración activada.

Una vez instalada, el icono de la extensión aparece en el **menú ⋮** de Firefox para
Android: ábrelo para ver el código 2FA en vivo y los accesos directos, y la página de
configuración funciona igual que en escritorio.

## Cómo se usa

1. Abre la **configuración** de la extensión (botón «Configuración» del popup, o
   `about:addons` → Login Verd → Preferencias).
2. Sigue la guía paso a paso de la propia página: sube la **imagen del QR** que te da la UPC,
   pon el **nombre del dispositivo** (`LoginVerd` por defecto) y tu **usuario y contraseña**.
3. Entra en `https://login.upc.edu/`: aparecerá un botón **«Iniciar sesión como …»** y, en la
   pantalla de 2FA, el código se rellenará y enviará automáticamente.

## Qué cambia respecto a la versión de Chrome

El código de la lógica (`content.js`, `totp.js`, `popup.js`, `background.js`) es el mismo: la
API `chrome.*` que usa el original ya devuelve *promesas* en Firefox, así que es compatible
tal cual. Los únicos cambios necesarios para Firefox son:

| Tema | Chrome (original) | Firefox (esta versión) |
|------|-------------------|------------------------|
| Tipo de *background* | `background.service_worker` | `background.scripts` (página de eventos, soportada por Gecko) |
| Página de opciones | `options_page` | `options_ui` con `open_in_tab: true` (se abre en pestaña completa) |
| ID y compatibilidad | — | `browser_specific_settings.gecko` (id, `strict_min_version`, `data_collection_permissions: none`) + `gecko_android` |
| Lectura del QR | API nativa `BarcodeDetector` | **Firefox no tiene `BarcodeDetector`**, así que se incluye la librería [`jsQR`](https://github.com/cozmo/jsQR) (`src/jsqr.js`) para leer el QR. Si el navegador llegara a exponer `BarcodeDetector`, se usa esa por ser más rápida. |
| Móvil | — | `meta viewport` en el popup y opciones para que se vea bien en Android |

Nada de esto cambia el comportamiento ni los datos: el QR se sigue procesando **en local**,
solo se guarda la clave 2FA (no la imagen).

## Desarrollo

```bash
# Validar contra las reglas de Mozilla (0 errores / 0 avisos / 0 advertencias)
npx web-ext lint --source-dir LoginVerd-Firefox

# Probar en un Firefox temporal
npx web-ext run --source-dir LoginVerd-Firefox

# Probar en Android (móvil por USB con depuración activada)
npx web-ext run --source-dir LoginVerd-Firefox -t firefox-android

# Generar el .zip para subir a addons.mozilla.org
npx web-ext build --source-dir LoginVerd-Firefox
```

`src/jsqr.js` es la distribución UMD de jsQR v1.4.0 (licencia Apache-2.0), incluida sin
modificar para no depender de red.
