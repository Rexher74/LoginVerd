/*
 * totp.js — Generación de códigos TOTP (RFC 6238) sin dependencias externas.
 * Se usa tanto en el content script como en la página de opciones y el popup.
 * Expone un objeto global `UPCTOTP`.
 */
(function (global) {
  "use strict";

  // Decodifica una cadena Base32 (RFC 4648) a Uint8Array.
  function base32Decode(input) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const clean = String(input).toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
    let bits = 0;
    let value = 0;
    const out = [];
    for (const ch of clean) {
      const idx = alphabet.indexOf(ch);
      if (idx === -1) continue; // ignora caracteres no válidos
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        bits -= 8;
        out.push((value >>> bits) & 0xff);
      }
    }
    return new Uint8Array(out);
  }

  // Comprueba que una clave Base32 es plausible (no vacía tras decodificar).
  function isValidSecret(secret) {
    try {
      return base32Decode(secret).length >= 5;
    } catch (e) {
      return false;
    }
  }

  // Parsea una URI otpauth://totp/...?secret=...&issuer=...&algorithm=...&digits=...&period=...
  // Devuelve un objeto de configuración o null si no es válida.
  function parseOtpauth(uri) {
    try {
      const u = new URL(String(uri).trim());
      if (u.protocol !== "otpauth:") return null;
      const p = u.searchParams;
      const secret = p.get("secret");
      if (!secret) return null;
      let label = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
      let issuer = p.get("issuer") || "";
      if (!issuer && label.includes(":")) issuer = label.split(":")[0];
      return {
        secret: secret.replace(/\s+/g, ""),
        algorithm: (p.get("algorithm") || "SHA1").toUpperCase(),
        digits: parseInt(p.get("digits") || "6", 10) || 6,
        period: parseInt(p.get("period") || "30", 10) || 30,
        issuer: issuer,
        label: label,
      };
    } catch (e) {
      return null;
    }
  }

  // Acepta una clave Base32 "pelada" o una URI otpauth:// y devuelve config normalizada.
  function parseSecretInput(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return null;
    if (/^otpauth:\/\//i.test(trimmed)) {
      return parseOtpauth(trimmed);
    }
    const secret = trimmed.replace(/\s+/g, "");
    if (!isValidSecret(secret)) return null;
    return { secret, algorithm: "SHA1", digits: 6, period: 30, issuer: "", label: "" };
  }

  // Genera el código TOTP. opts = {algorithm, digits, period, time(ms)}
  async function generateTOTP(secretBase32, opts) {
    opts = opts || {};
    const algorithm = (opts.algorithm || "SHA1").toUpperCase();
    const digits = opts.digits || 6;
    const period = opts.period || 30;
    const nowMs = opts.time !== undefined ? opts.time : Date.now();
    const counter = Math.floor(nowMs / 1000 / period);

    const keyBytes = base32Decode(secretBase32);
    const hashName =
      { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" }[algorithm] || "SHA-1";

    // Contador de 8 bytes big-endian.
    const counterBytes = new Uint8Array(8);
    let tmp = counter;
    for (let i = 7; i >= 0; i--) {
      counterBytes[i] = tmp & 0xff;
      tmp = Math.floor(tmp / 256);
    }

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: hashName },
      false,
      ["sign"]
    );
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, counterBytes));

    // Truncamiento dinámico (RFC 4226).
    const offset = sig[sig.length - 1] & 0x0f;
    const binary =
      ((sig[offset] & 0x7f) << 24) |
      ((sig[offset + 1] & 0xff) << 16) |
      ((sig[offset + 2] & 0xff) << 8) |
      (sig[offset + 3] & 0xff);
    const otp = (binary % Math.pow(10, digits)).toString().padStart(digits, "0");
    return otp;
  }

  // Segundos que faltan para que cambie el código actual.
  function secondsRemaining(period, timeMs) {
    period = period || 30;
    const nowMs = timeMs !== undefined ? timeMs : Date.now();
    return period - (Math.floor(nowMs / 1000) % period);
  }

  global.UPCTOTP = {
    base32Decode,
    isValidSecret,
    parseOtpauth,
    parseSecretInput,
    generateTOTP,
    secondsRemaining,
  };
})(typeof window !== "undefined" ? window : self);
