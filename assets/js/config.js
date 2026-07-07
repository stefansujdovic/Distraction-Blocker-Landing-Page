/**
 * Site configuration — the only file you normally need to touch.
 *
 * downloadUrl   Direct link to the installer. It uses GitHub's "latest release"
 *               alias, so publishing a new release with an asset named
 *               DistractionBlockerSetup.exe updates this automatically — no code
 *               change needed.
 * sheetEndpoint Google Apps Script Web App URL that appends each submitted email
 *               to a private Google Sheet. Set to "" to turn off email
 *               collection (downloads keep working either way).
 * installerName Shown to the user; also the suggested filename on download.
 */
window.DB_CONFIG = {
  downloadUrl:   "https://github.com/stefansujdovic/Distraction-Blocker-Landing-Page/releases/latest/download/DistractionBlockerSetup.exe",
  sheetEndpoint: "https://script.google.com/macros/s/AKfycbz20tRjwMpsZdWPxqhFq9j40zHQvHkP3ZAr1OdvsfFkPqePzfZn_hxXR9JET0hZRElg/exec",
  installerName: "DistractionBlockerSetup.exe"
};
