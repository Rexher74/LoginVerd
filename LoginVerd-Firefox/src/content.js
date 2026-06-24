/*
 * content.js — Se inyecta en https://login.upc.edu/*
 *
 * Detecta si estamos en la página de login o en la de 2FA y:
 *  - Login: muestra un botón "Iniciar sesión como X". Al pulsarlo rellena
 *    usuario/contraseña y envía el formulario.
 *  - 2FA: si venimos del flujo automático, genera el código TOTP, lo rellena
 *    y envía. Si no, muestra un botón para hacerlo manualmente.
 *
 * Los campos se localizan por sus IDs/atributos estables de Keycloak, por lo
 * que funciona aunque la página esté en catalán, español o inglés.
 */
(function () {
  "use strict";

  const FLAG_KEY = "upc_autologin_inprogress";
  const FLAG_TTL_MS = 2 * 60 * 1000; // el flag caduca a los 2 min
  const DEFAULT_DEVICE_NAME = "LoginVerd";

  // ---------- localización de elementos (independiente del idioma) ----------
  const findUsername = () =>
    document.getElementById("username") ||
    document.querySelector('input[name="username"]') ||
    document.querySelector('input[autocomplete="username"]');

  const findPassword = () =>
    document.getElementById("password") ||
    document.querySelector('input[name="password"]') ||
    document.querySelector('input[type="password"]');

  const findOtp = () =>
    document.getElementById("otp") ||
    document.querySelector('input[name="otp"]') ||
    document.querySelector('input[autocomplete="one-time-code"]');

  const findSubmit = (form) =>
    (form &&
      (form.querySelector("#kc-login") ||
        form.querySelector('[name="login"]') ||
        form.querySelector('button[type="submit"], input[type="submit"]'))) ||
    document.getElementById("kc-login");

  // ---------- selección de dispositivo OTP ----------
  // Cuando hay varios autenticadores registrados, Keycloak muestra un selector
  // (radios name="selectedCredentialId"). Por defecto marca uno que puede NO ser
  // el nuestro, así que debemos marcar el que coincida con el nombre configurado.
  const findCredentialRadios = () =>
    Array.from(document.querySelectorAll('input[type="radio"][name="selectedCredentialId"]'));

  function tileTitleForRadio(radio) {
    let label = null;
    // 1) label asociado por atributo for (lo normal en los tiles de Keycloak).
    if (radio.id) {
      const esc =
        (window.CSS && typeof window.CSS.escape === "function")
          ? window.CSS.escape(radio.id)
          : radio.id.replace(/"/g, '\\"');
      try { label = document.querySelector(`label[for="${esc}"]`); } catch (e) {}
    }
    // 2) por si el radio estuviera dentro del propio label.
    if (!label) label = radio.closest("label");
    // 3) último recurso: el primer <label> hermano que aparezca tras el radio
    //    (NUNCA el primer label del contenedor, que sería siempre el mismo).
    if (!label) {
      let sib = radio.nextElementSibling;
      while (sib && sib.tagName !== "LABEL") sib = sib.nextElementSibling;
      label = sib;
    }
    if (!label) return "";
    const t = label.querySelector(".pf-c-tile__title");
    return ((t ? t.textContent : label.textContent) || "").trim();
  }

  // Normaliza para comparar nombres ignorando mayúsculas y espacios:
  // "LoginVerd" == "Login Verd" == "login verd".
  const normalizeName = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

  // Marca el dispositivo cuyo nombre coincide con `deviceName`.
  // Devuelve {hasSelector, selected, available[]}.
  function selectCredential(deviceName) {
    const radios = findCredentialRadios();
    if (!radios.length) return { hasSelector: false, selected: true, available: [] };

    const target = normalizeName(deviceName);
    const titles = radios.map(tileTitleForRadio);

    let idx = radios.findIndex((r, i) => normalizeName(titles[i]) === target);
    if (idx === -1) {
      idx = radios.findIndex((r, i) => {
        const n = normalizeName(titles[i]);
        return n && target && (n.includes(target) || target.includes(n));
      });
    }
    if (idx === -1) return { hasSelector: true, selected: false, available: titles };

    const radio = radios[idx];
    if (!radio.checked) {
      radio.checked = true; // al marcarlo se desmarcan los demás del grupo
      radio.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { hasSelector: true, selected: true, available: titles };
  }

  // ---------- utilidades de formulario ----------
  function setValue(input, value) {
    const proto = window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function submitForm(form, submitBtn) {
    if (typeof form.requestSubmit === "function") {
      // requestSubmit dispara el evento submit (y el onsubmit del propio Keycloak).
      form.requestSubmit(submitBtn || undefined);
    } else if (submitBtn) {
      submitBtn.click();
    } else {
      form.submit();
    }
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- flag de "login en progreso" (sobrevive a la navegación) ----------
  function setInProgress() {
    try { sessionStorage.setItem(FLAG_KEY, String(Date.now())); } catch (e) {}
  }
  function isInProgress() {
    try {
      const v = sessionStorage.getItem(FLAG_KEY);
      return !!v && Date.now() - parseInt(v, 10) < FLAG_TTL_MS;
    } catch (e) { return false; }
  }
  function clearInProgress() {
    try { sessionStorage.removeItem(FLAG_KEY); } catch (e) {}
  }

  // ---------- almacenamiento ----------
  async function getConfig() {
    const data = await chrome.storage.local.get(["username", "password", "totp", "deviceName"]);
    if (!data.deviceName) data.deviceName = DEFAULT_DEVICE_NAME;
    const configured = !!(data.username && data.password && data.totp && data.totp.secret);
    return { data, configured };
  }

  // ---------- interfaz (Shadow DOM, aislada del CSS de la página) ----------
  // OJO: no llamar a esta constante "CSS": taparía el objeto global window.CSS
  // (window.CSS.escape) que usamos en tileTitleForRadio.
  const BANNER_CSS = `
    :host { all: initial; }
    .card {
      position: fixed; top: 18px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #ffffff; color: #1b1b1b;
      border: 1px solid #e3e3e3; border-top: 4px solid #1f9d55;
      border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.18);
      padding: 14px 16px; width: 320px; max-width: 92vw;
      box-sizing: border-box;
      animation: drop .25s ease;
    }
    @keyframes drop { from { opacity: 0; transform: translate(-50%, -10px); } to { opacity: 1; transform: translate(-50%, 0); } }
    .head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
    .logo { width: 18px; height: 18px; border-radius: 5px; flex: none; object-fit: contain; }
    .title { font-size: 13px; font-weight: 700; flex: 1; }
    .close { border: none; background: none; cursor: pointer; color: #999; font-size: 16px; line-height: 1; padding: 2px; }
    .close:hover { color: #444; }
    .sub { font-size: 12px; color: #666; margin: 0 0 10px; line-height: 1.4; }
    .btn {
      display: block; width: 100%; box-sizing: border-box;
      background: #1f9d55; color: #fff; border: none; border-radius: 8px;
      padding: 11px 14px; font-size: 14px; font-weight: 600; cursor: pointer;
      transition: background .15s;
    }
    .btn:hover { background: #157f43; }
    .btn:disabled { background: #a6d3ba; cursor: default; }
    .btn.secondary { background: #e6f5ec; color: #1f9d55; }
    .btn.secondary:hover { background: #d7efe0; }
    .footer { margin-top: 10px; text-align: center; }
    .link { background: none; border: none; color: #1f9d55; cursor: pointer; font-size: 12px; text-decoration: underline; padding: 0; }
    .status { display: flex; align-items: center; gap: 9px; font-size: 13px; color: #333; }
    .spinner { width: 16px; height: 16px; border: 2px solid #cdead8; border-top-color: #1f9d55; border-radius: 50%; animation: spin .7s linear infinite; flex: none; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .user { font-weight: 700; }
  `;

  let host = null;
  function unmount() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  function mount(buildInner) {
    unmount();
    host = document.createElement("div");
    host.id = "upc-autologin-host";
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = BANNER_CSS;
    const card = document.createElement("div");
    card.className = "card";
    shadow.append(style, card);
    buildInner(card, shadow);
    (document.body || document.documentElement).appendChild(host);
    return { card, shadow };
  }

  function header(card, title, withClose) {
    const head = document.createElement("div");
    head.className = "head";
    const logo = document.createElement("img");
    logo.className = "logo";
    logo.src = chrome.runtime.getURL("icons/icon128.png");
    logo.alt = "";
    const t = document.createElement("span");
    t.className = "title";
    t.textContent = title;
    head.append(logo, t);
    if (withClose) {
      const close = document.createElement("button");
      close.className = "close";
      close.textContent = "✕";
      close.title = "Cerrar";
      close.addEventListener("click", unmount);
      head.append(close);
    }
    card.append(head);
    return head;
  }

  function configLink(card, text) {
    const footer = document.createElement("div");
    footer.className = "footer";
    const link = document.createElement("button");
    link.className = "link";
    link.textContent = text || "Configuración";
    link.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "openOptions" }).catch(() => {});
    });
    footer.append(link);
    card.append(footer);
  }

  // ---------- pantallas ----------
  function showLoginButton(cfg) {
    mount((card) => {
      header(card, "Login Verd para la UPC", true);
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = `Iniciar sesión como ${cfg.data.username}`;
      btn.addEventListener("click", () => doLogin(cfg, btn));
      card.append(btn);
      configLink(card, "Cambiar usuario / configuración");
    });
  }

  function showConfigurePrompt() {
    mount((card) => {
      header(card, "Login Verd para la UPC", true);
      const p = document.createElement("p");
      p.className = "sub";
      p.textContent = "Aún no has configurado tus credenciales. Configúralas una vez para iniciar sesión con un clic.";
      card.append(p);
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Abrir configuración";
      btn.addEventListener("click", () =>
        chrome.runtime.sendMessage({ type: "openOptions" }).catch(() => {})
      );
      card.append(btn);
    });
  }

  function showOtpButton(cfg, attemptedUser) {
    mount((card) => {
      header(card, "Login Verd para la UPC", true);
      const p = document.createElement("p");
      p.className = "sub";
      p.textContent = attemptedUser
        ? `Segundo factor para ${attemptedUser}.`
        : "Introduce tu código de doble factor.";
      card.append(p);
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Introducir código 2FA";
      btn.addEventListener("click", () => doOtp(cfg, btn));
      card.append(btn);
    });
  }

  function showWorking(message) {
    mount((card) => {
      header(card, "Login Verd para la UPC", false);
      const row = document.createElement("div");
      row.className = "status";
      const sp = document.createElement("span");
      sp.className = "spinner";
      const txt = document.createElement("span");
      txt.textContent = message;
      row.append(sp, txt);
      card.append(row);
    });
  }

  // Se muestra cuando hay selector de dispositivo pero ninguno coincide con el
  // nombre configurado: no enviamos un código que iría al dispositivo equivocado.
  function showDeviceMismatch(cfg, deviceName, available) {
    mount((card) => {
      header(card, "Login Verd para la UPC", true);
      const p = document.createElement("p");
      p.className = "sub";
      const list = (available || []).filter(Boolean).join(", ");
      p.textContent =
        `No encuentro el dispositivo «${deviceName}» entre los disponibles` +
        (list ? ` (${list}). ` : ". ") +
        "Revisa que el «Nombre del dispositivo» de la extensión coincida con el que registraste en la UPC.";
      card.append(p);
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Abrir configuración";
      btn.addEventListener("click", () =>
        chrome.runtime.sendMessage({ type: "openOptions" }).catch(() => {})
      );
      card.append(btn);
    });
  }

  // ---------- acciones ----------
  async function doLogin(cfg, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "Iniciando sesión…"; }
    const user = findUsername();
    const pass = findPassword();
    const form = (pass && pass.closest("form")) || document.getElementById("kc-form-login");
    if (!user || !pass || !form) {
      if (btn) { btn.disabled = false; btn.textContent = "Reintentar"; }
      return;
    }
    setValue(user, cfg.data.username);
    setValue(pass, cfg.data.password);
    setInProgress(); // para continuar automáticamente en la página 2FA
    submitForm(form, findSubmit(form));
  }

  async function doOtp(cfg, btn) {
    if (btn) { btn.disabled = true; }
    const otp = findOtp();
    const form = (otp && otp.closest("form")) || document.getElementById("kc-otp-login-form");
    if (!otp || !form) {
      if (btn) { btn.disabled = false; }
      return;
    }

    // Si hay selector de dispositivo, marca el nuestro antes de enviar el código.
    const sel = selectCredential(cfg.data.deviceName || DEFAULT_DEVICE_NAME);
    if (sel.hasSelector && !sel.selected) {
      showDeviceMismatch(cfg, cfg.data.deviceName || DEFAULT_DEVICE_NAME, sel.available);
      return;
    }

    showWorking("Introduciendo código 2FA…");

    // Evita que el código caduque justo al enviarlo: si quedan <3 s, espera al
    // siguiente intervalo antes de generarlo.
    const period = (cfg.data.totp && cfg.data.totp.period) || 30;
    const remaining = UPCTOTP.secondsRemaining(period);
    if (remaining < 3) await sleep((remaining + 0.4) * 1000);

    let code;
    try {
      code = await UPCTOTP.generateTOTP(cfg.data.totp.secret, cfg.data.totp);
    } catch (e) {
      showOtpButton(cfg, null);
      return;
    }
    setValue(otp, code);
    submitForm(form, findSubmit(form));
  }

  // ---------- arranque ----------
  (async function init() {
    if (!chrome.runtime || !chrome.runtime.id) return; // contexto inválido
    const cfg = await getConfig();

    // Página de 2FA
    if (findOtp()) {
      const attemptedUser =
        (document.getElementById("kc-attempted-username") || {}).textContent || "";
      if (!cfg.configured) {
        // sin TOTP configurado no podemos ayudar con el 2FA
        return;
      }
      if (isInProgress()) {
        clearInProgress(); // limpia antes de enviar para no reintentar en bucle si falla
        doOtp(cfg, null);
      } else {
        showOtpButton(cfg, attemptedUser.trim());
      }
      return;
    }

    // Página de login (usuario + contraseña)
    if (findUsername() && findPassword()) {
      if (cfg.configured) showLoginButton(cfg);
      else showConfigurePrompt();
    }
  })();
})();
