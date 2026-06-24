/*
 * background.js — Service worker mínimo.
 * Solo se usa para abrir la página de opciones cuando el content script
 * (que no puede hacerlo por sí mismo) lo solicita.
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
  return false;
});
