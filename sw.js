/* Service Worker – Stand 2026-11-11-1423
   Eigene Dateien: Netz zuerst (Updates kommen sofort an), nach 3 s oder offline der
   zuletzt gespeicherte Stand. Schriften: aus dem Zwischenspeicher, im Hintergrund erneuert.
   Bibliotheken von cdnjs (feste Versionen, etwa jsPDF fürs PDF): einmal geholt, dann
   aus dem Zwischenspeicher – so geht das PDF auch offline.
   Deine Daten liegen in IndexedDB und werden hier nie angefasst. */
const CACHE = "begleiter-v-2026-11-11-1423", FONTS = "begleiter-fonts", LIBS = "begleiter-libs";
const CORE = ["./", "index.html", "adapter.js?v=2026-11-11-1423", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
const LIB_URLS = ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"];
/* Bibliotheken gleich mitnehmen; klappt das nicht (offline), holt sie der erste Gebrauch. */
function preLibs() {
  return caches.open(LIBS).then(c => Promise.all(LIB_URLS.map(u => c.match(u).then(m => m ||
    fetch(u, { mode: "cors" }).then(r => { if (r.ok) return c.put(u, r); }))))).catch(() => {});
}
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(preLibs).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("begleiter-v-") && k !== CACHE)
    .map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
function netFirst(req, ms) {
  const net = fetch(req).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return res;
  });
  const cached = () => caches.match(req).then(m => m || (req.mode === "navigate" ? caches.match("./") : null));
  return new Promise(resolve => {
    let done = false;
    const t = setTimeout(() => cached().then(m => { if (m && !done) { done = true; resolve(m); } }), ms);
    net.then(res => { if (!done) { done = true; clearTimeout(t); resolve(res); } })
       .catch(() => cached().then(m => { if (!done) { done = true; clearTimeout(t); resolve(m || Response.error()); } }));
  });
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const u = new URL(req.url);
  if (u.origin === location.origin) { e.respondWith(netFirst(req, 3000)); return; }
  if (u.hostname === "cdnjs.cloudflare.com") {
    e.respondWith(caches.open(LIBS).then(c => c.match(req.url).then(m => m || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") c.put(req.url, res.clone()); return res; }))));
    return;
  }
  if (u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then(c => c.match(req).then(m => {
      const f = fetch(req).then(res => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; })
        .catch(() => m || Response.error());
      return m || f;
    })));
  }
});
