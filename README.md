# Buddy

Persönliche App für Training, Gewohnheiten, Geld und Körper – gebaut aus einem Claude-Artefakt.
Läuft komplett im Browser, auch offline, und lässt sich am iPhone wie eine App auf den
Home-Bildschirm legen.

## Datenschutz

- Dieses Repo enthält nur den App-Code – keine Einträge, keine Trainingshistorie.
- Alle Einträge liegen ausschließlich auf dem Gerät (IndexedDB) und werden nirgends hochgeladen.
- Die Seite selbst ist öffentlich erreichbar. Ohne eingespielte Sicherung zeigt sie nur eine leere App.

## Einrichten (einmal)

1. Alle Dateien dieses Ordners ins Repo hochladen, auch den Ordner `icons`.
2. Settings → Pages → Build and deployment → Source: „Deploy from a branch“ →
   Branch `main`, Ordner `/ (root)` → Save.
3. Nach kurzer Zeit läuft die App unter `https://BENUTZERNAME.github.io/REPO/`.

## Aufs iPhone

1. Die Adresse in Safari öffnen → Teilen → „Zum Home-Bildschirm“.
2. Die App über das neue Symbol öffnen. Die Home-Bildschirm-App hat einen eigenen Speicher,
   getrennt von Safari – eingespielt wird deshalb erst dort.
3. „Sicherung einspielen“ → die Komplett-Sicherung wählen
   (im Artefakt: Mehr → Daten & Sicherung → Komplett-Sicherung).

## Aktualisieren

Die neue Fassung hochladen und die alten Dateien ersetzen. Die App holt den neuen Stand beim
nächsten Öffnen mit Netz; die Einträge auf dem Gerät bleiben.

## Sichern

Mehr → Daten & Sicherung → Komplett-Sicherung, zum Beispiel in „Dateien“ ablegen. Der
Wochenrückblick am Sonntag erinnert daran, wenn die letzte Sicherung eine Woche oder länger her ist.
