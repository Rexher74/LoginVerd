# Login Verd: Auto Login para la UPC

Extensión de navegador (Chrome / Edge / Brave) que inicia sesión automáticamente en
**https://login.upc.edu/**, incluido el segundo factor de autenticación (2FA), con un solo clic.

Código **open source** (MIT): [Rexher74/LoginVerd](https://github.com/Rexher74/LoginVerd).

La página de login de la UPC usa **Keycloak**. Esta extensión localiza los campos por sus
identificadores estables (`#username`, `#password`, `#otp`, `#kc-login`), por lo que funciona
aunque la página esté en **catalán, español o inglés** (el texto de los botones puede cambiar,
los identificadores no).

---

## Cómo funciona

1. **Configuras una vez** tu usuario, contraseña y el QR del 2FA (página de opciones).
2. Cada vez que entras en `login.upc.edu` aparece una tarjeta con el botón
   **«Iniciar sesión como _tu_usuario_»**.
3. Al pulsarlo:
   - Rellena usuario y contraseña y pulsa **Entra**.
   - Espera a la redirección a la página del 2FA.
   - Si la UPC muestra **varios dispositivos OTP**, selecciona automáticamente el tuyo
     (por defecto **«Login Verd»**). Esto es importante: el dispositivo marcado por defecto
     suele ser otro, y enviar el código contra el dispositivo equivocado falla.
   - Genera el código de 6 dígitos a partir de la clave del QR (algoritmo TOTP, el mismo que
     Google Authenticator / Authy), lo rellena y pulsa **Entra**.

El código 2FA **se calcula en tu navegador** en el momento exacto del envío; no se guarda ningún
código, solo la clave secreta.

> **Nombre del dispositivo:** la coincidencia ignora mayúsculas y espacios, así que «LoginVerd»,
> «Login Verd» y «login verd» se consideran el mismo. Si registraste el dispositivo con otro
> nombre, ponlo en el campo **«Nombre del dispositivo»** de la configuración.

---

## Instalación (modo desarrollador)

1. Abre Chrome y ve a `chrome://extensions`.
2. Activa el **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **«Cargar extensión sin empaquetar»** (Load unpacked).
4. Selecciona la carpeta de este proyecto (`auto-login-upc`).
5. Aparecerá el icono de la extensión en la barra. Pulsa el icono → **Configuración**.

> También funciona en Edge (`edge://extensions`) y Brave.

---

## Configuración del 2FA (paso a paso)

Tienes que **crear un nuevo autenticador** en tu cuenta UPC y usar ese mismo QR en la extensión.
La propia página de opciones incluye estas instrucciones con capturas.

1. Entra en **Seguridad de la cuenta → Iniciando sesión**:
   `https://login.upc.edu/realms/upc/account/account-security/signing-in`
2. En **«Autenticación de dos factores»**, haz clic en **«Configurar Aplicación autenticadora»**
   (ver `assets/img1.png`).
3. Aparecerá un **código QR** (ver `assets/img2.png`). **Haz una captura o foto del QR y guárdala**:
   la necesitarás para configurar Login Verd en cada navegador/dispositivo.
4. Sube esa imagen del QR en la página de opciones de la extensión (zona «Arrastra el QR»). La
   extensión empezará a mostrar el **código de un solo uso** en vivo.
5. En la UPC, en **«Nombre del dispositivo»**, escribe **`LoginVerd`**.
   (Si usas otro nombre, ponlo también en el campo «Nombre del dispositivo» de la extensión.)
6. Copia el **código de un solo uso** que muestra la extensión en el campo
   **«Código de un solo uso»** de la UPC.
7. **Desmarca** la casilla **«Cerrar sesión en otros dispositivos»** para que tus demás métodos OTP
   sigan funcionando.
8. Pulsa **«Enviar»** en la UPC y, por último, **«Guardar»** en la extensión.

> **Alternativa para la clave:** en la extensión puedes desplegar «O introducir la clave manualmente»
> y pegar la clave (Base32) o la URI `otpauth://…` en lugar de subir la imagen.

> **Verifica:** el **código en vivo** que muestra la extensión debe ir cambiando cada 30 s. Es el
> que pegas en el paso 6.

---

## Privacidad y seguridad

- Tus datos se guardan **solo en tu navegador** (`chrome.storage.local`) y **no se envían a ningún
  servidor**. La extensión solo actúa en `https://login.upc.edu/*`.
- **Se almacenan sin cifrar.** Cualquiera con acceso a tu perfil de Chrome podría leerlos. Úsala
  únicamente en un equipo personal y de confianza.
- La imagen del QR no se guarda: solo se extrae y almacena la clave secreta.
- Para borrar todo: elimina la extensión, o entra en Configuración y vacía los campos.

---

## Estructura del proyecto

```
auto-login-upc/
├── manifest.json          Manifiesto MV3
├── icons/                 Iconos 16/48/128
├── assets/                Capturas usadas en las instrucciones (img1, img2)
└── src/
    ├── background.js       Service worker (solo abre la página de opciones)
    ├── content.js          Se inyecta en login.upc.edu: detecta página, selecciona
    │                       el dispositivo OTP y autocompleta usuario/contraseña/código
    ├── totp.js             Generación de códigos TOTP (RFC 6238), sin dependencias
    ├── options.html/.js    Configuración + instrucciones (lee el QR con BarcodeDetector)
    └── popup.html/.js       Estado rápido + código 2FA en vivo
```

---

## Notas técnicas

- **Manifest V3**, sin librerías externas.
- La lectura del QR usa la API nativa del navegador **`BarcodeDetector`** (disponible en Chrome en
  macOS/Windows). Si no estuviera disponible, usa la entrada manual de la clave.
- El TOTP usa **Web Crypto** (`crypto.subtle`, HMAC-SHA1/256/512) y respeta los parámetros que
  vengan en la URI `otpauth://` (`algorithm`, `digits`, `period`).
- Para no enviar un código a punto de caducar, si quedan menos de 3 s del intervalo, espera al
  siguiente antes de generarlo.
- **Selección de dispositivo:** si la página de 2FA muestra el selector de Keycloak
  (`input[name="selectedCredentialId"]`), marca el radio cuyo título coincide con el nombre
  configurado antes de enviar. La comparación normaliza mayúsculas y espacios. Si ninguno coincide,
  no envía nada y avisa, para no fallar contra el dispositivo equivocado.

---

## Licencia

Este proyecto es **open source** bajo la licencia MIT. Ver [LICENSE](LICENSE) y el repositorio en
[github.com/Rexher74/LoginVerd](https://github.com/Rexher74/LoginVerd).
