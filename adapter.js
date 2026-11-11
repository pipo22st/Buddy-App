/* Buddy – Adapter für den Betrieb außerhalb von claude.ai
   ------------------------------------------------------------
   Das Artefakt spricht mit claude.ai über claude.use("db" | "downloads" | "sample").
   Diese Datei stellt dieselbe Schnittstelle bereit, damit der unveränderte
   App-Code als eigenständige Handy-App läuft:
     db        → IndexedDB auf dem Gerät (gleiche Dokumentnamen wie im Artefakt)
     downloads → Teilen-Menü (iPhone: „In Dateien sichern") bzw. Download
     sample    → vorerst nicht verfügbar (KI-Funktionen zeigen ihren Ersatzweg)
   Zusätzlich: Ersteinrichtung mit Datenübernahme, „Sicherung einspielen",
   Service Worker für Offline-Betrieb. */
(function () {
  "use strict";
  var BUILD = "2026-11-11-1423";
  var DB_NAME = "begleiter", STORE = "kv";
  var BASE_KEY = "meta:base", INIT_KEY = "meta:init", DOC = "doc:";
  var PACK_FORMAT = "begleiter-sicherung", PACK_VERSION = 1;

  /* ---------- IndexedDB ---------- */
  var dbp = null;
  function idb() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
      r.onblocked = function () { rej(new Error("Speicher blockiert")); };
    });
    return dbp;
  }
  function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function done(t) { return new Promise(function (res, rej) { t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; t.onabort = function () { rej(t.error || new Error("Abgebrochen")); }; }); }
  function kvGet(key) { return idb().then(function (d) { return req(d.transaction(STORE).objectStore(STORE).get(key)); }); }
  function kvPut(key, val) { return idb().then(function (d) { var t = d.transaction(STORE, "readwrite"); t.objectStore(STORE).put(val, key); return done(t); }); }
  function kvKeys() { return idb().then(function (d) { return req(d.transaction(STORE).objectStore(STORE).getAllKeys()); }); }
  function kvReplaceAll(entries) {
    return idb().then(function (d) {
      var t = d.transaction(STORE, "readwrite"), s = t.objectStore(STORE);
      s.clear(); entries.forEach(function (e) { s.put(e[1], e[0]); });
      return done(t);
    });
  }
  var clone = function (v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); };

  /* ---------- Ersatz für claude.use(...) ---------- */
  var storageOk = true;
  var dbApi = {
    doc: function (name) {
      return {
        get: function () { return kvGet(DOC + name).then(function (v) { return { exists: v !== undefined, data: function () { return clone(v); } }; }); },
        set: function (obj) { return kvPut(DOC + name, clone(obj)); }
      };
    }
  };

  function mimeOf(name) {
    return /\.json$/i.test(name) ? "application/json" : /\.csv$/i.test(name) ? "text/csv" :
      /\.pdf$/i.test(name) ? "application/pdf" : "text/plain";
  }
  function plainDownload(blob, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  function declined() { var e = new Error("declined"); e.code = "declined"; return e; }
  /* Teilen braucht auf dem iPhone einen frischen Tipp. Ging der zwischen
     Klick und Datei verloren, gibt es einen zweiten Knopf statt eines Fehlers. */
  function shareSheet(file, blob) {
    return new Promise(function (res, rej) {
      var o = overlay(
        '<h3 style="font-size:17px;margin-bottom:6px">Datei ist bereit</h3>' +
        '<p class="hint" style="margin:0 0 14px">' + esc(file.name) + '</p>' +
        '<div class="row"><button class="btn btn-p" data-a="share">Sichern oder teilen</button>' +
        '<button class="btn" data-a="dl">Herunterladen</button><button class="btn" data-a="x">Abbrechen</button></div>');
      o.querySelector('[data-a="share"]').onclick = function () {
        navigator.share({ files: [file], title: file.name }).then(function () { o.remove(); res(); },
          function (e) { if (e && e.name === "AbortError") return; o.remove(); plainDownload(blob, file.name); res(); });
      };
      o.querySelector('[data-a="dl"]').onclick = function () { o.remove(); plainDownload(blob, file.name); res(); };
      o.querySelector('[data-a="x"]').onclick = function () { o.remove(); rej(declined()); };
    });
  }
  var downloadsApi = {
    save: function (opts) {
      var filename = opts.filename, type = mimeOf(filename);
      /* Text bekommt UTF-8 angesagt, Binäres (PDF) seinen reinen Typ. */
      var blob = new Blob([opts.data], { type: /^text\/|json$/.test(type) ? type + ";charset=utf-8" : type });
      var file = null;
      try { file = new File([blob], filename, { type: type }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: filename }).catch(function (e) {
          if (e && e.name === "AbortError") throw declined();
          return shareSheet(file, blob);
        });
      }
      plainDownload(blob, filename);
      return Promise.resolve();
    }
  };

  window.claude = {
    use: function (name) {
      if (name === "db") return Promise.resolve(storageOk ? dbApi : null);
      if (name === "downloads") return Promise.resolve(downloadsApi);
      /* "sample" (KI) ist hier noch nicht angebunden. Die App zeigt dann
         ihren eingebauten Ersatzweg statt der KI-Antwort. */
      return Promise.resolve(null);
    }
  };

  /* ---------- Sicherungen ---------- */
  function parsePack(text) {
    var p;
    try { p = JSON.parse(text); } catch (e) { throw new Error("Die Datei ist kein gültiges JSON."); }
    if (!p || p.format !== PACK_FORMAT || typeof p.docs !== "object" || p.docs === null)
      throw new Error("Das ist keine Sicherung dieser App. Erstellt wird sie unter Mehr → „Komplett-Sicherung“.");
    if (p.version > PACK_VERSION) throw new Error("Die Sicherung stammt aus einer neueren Version – erst die App aktualisieren.");
    return p;
  }
  function restorePack(p) {
    var base = Array.isArray(p.base) ? p.base : [];
    /* Die Historie kommt als eigenes Dokument „log/base“ – so liest sie der App-Code wie im Artefakt. */
    var entries = [[BASE_KEY, { items: base }], [DOC + "log/base", { items: base }],
                   [INIT_KEY, { at: new Date().toISOString(), from: p.stand || null, build: BUILD }]];
    Object.keys(p.docs).forEach(function (n) { entries.push([DOC + n, p.docs[n]]); });
    return kvReplaceAll(entries);
  }
  function readFile(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result)); }; r.onerror = function () { rej(r.error); }; r.readAsText(f); }); }
  function deDate(s) { try { return new Date(s).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return s || "unbekannt"; } }

  /* ---------- kleine UI-Helfer (nutzen die Stile der App) ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function overlay(html) {
    var o = document.createElement("div");
    o.setAttribute("role", "dialog");
    o.style.cssText = "position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:18px;" +
      "background:color-mix(in srgb,var(--bg,#F2F5F3) 70%,transparent);backdrop-filter:blur(8px)";
    o.innerHTML = '<div class="card" style="max-width:440px;width:100%">' + html + "</div>";
    document.body.appendChild(o);
    return o;
  }

  /* ---------- Start ---------- */
  function runMain(baseItems) {
    window.__APP_BASE__ = baseItems || [];
    var src = document.getElementById("app-main");
    var s = document.createElement("script");
    s.textContent = src.textContent;
    document.body.appendChild(s);
    addBackupControls();
  }

  function firstRun() {
    var o = overlay(
      '<h3 style="font-size:19px;margin-bottom:6px">Willkommen</h3>' +
      '<p class="hint" style="margin:0 0 14px;font-size:13.5px">Deine Daten liegen in dieser App direkt auf dem Gerät. ' +
      'Zum Umziehen spielst du einmal die <b>Komplett-Sicherung</b> aus dem Artefakt ein.</p>' +
      '<input type="file" accept=".json,application/json" hidden>' +
      '<div class="row"><button class="btn btn-p" data-a="pick">Sicherung einspielen</button>' +
      '<button class="btn" data-a="empty">Leer starten</button></div>' +
      '<p class="hint" data-a="msg" style="margin:12px 0 0"></p>');
    var input = o.querySelector("input"), msg = o.querySelector('[data-a="msg"]');
    o.querySelector('[data-a="pick"]').onclick = function () { input.click(); };
    o.querySelector('[data-a="empty"]').onclick = function () {
      kvPut(INIT_KEY, { at: new Date().toISOString(), from: null, build: BUILD }).then(function () { o.remove(); runMain([]); });
    };
    input.onchange = function () {
      var f = input.files[0]; input.value = ""; if (!f) return;
      msg.textContent = "Wird eingespielt …";
      readFile(f).then(parsePack).then(function (p) {
        return restorePack(p).then(function () { o.remove(); runMain(p.base || []); });
      }).catch(function (e) { msg.style.color = "var(--crit)"; msg.textContent = e.message; });
    };
  }

  function addBackupControls() {
    var card = document.getElementById("expCard");
    if (!card || card.querySelector("[data-restore]")) return;
    var row = card.querySelector(".row");
    var input = document.createElement("input");
    input.type = "file"; input.accept = ".json,application/json"; input.hidden = true;
    var btn = document.createElement("button");
    btn.className = "btn btn-s"; btn.textContent = "Sicherung einspielen"; btn.setAttribute("data-restore", "");
    btn.onclick = function () { input.click(); };
    input.onchange = function () {
      var f = input.files[0]; input.value = ""; if (!f) return;
      readFile(f).then(parsePack).then(function (p) {
        if (!confirm("Alle Daten in dieser App werden durch die Sicherung vom " + deDate(p.stand) + " ersetzt. Fortfahren?")) return;
        return restorePack(p).then(function () { location.reload(); });
      }).catch(function (e) { alert(e.message); });
    };
    (row || card).appendChild(btn); card.appendChild(input);
    var v = document.createElement("p");
    v.className = "hint"; v.style.margin = "10px 0 0";
    v.textContent = "Handy-App · Stand " + BUILD;
    card.appendChild(v);
  }

  function start() {
    Promise.all([kvGet(BASE_KEY), kvGet(INIT_KEY), kvKeys()]).then(function (r) {
      var base = r[0], init = r[1], keys = r[2];
      if (base === undefined && init === undefined && keys.length === 0) firstRun();
      else runMain(base && base.items);
    }).catch(function () {
      storageOk = false;           /* App zeigt dann selbst „Kein Speicher" */
      runMain([]);
    });
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  start();
})();
