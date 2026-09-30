# Übergabe LagCam

Stand 30.09.2026. Normale App v0 mit Version 17, Test-App Stand 1. Beides lokal committet.

Diese Datei dient als Einstieg in einen neuen Chat. Lies zuerst diese Datei und danach `PLAN.md`. `PLAN.md` enthält die vollständige, abgestimmte Planung, die Testergebnisse des Tablets und die Regeln für die Kommunikation mit dem Nutzer.

## Kurzfassung

LagCam ist eine Progressive Web App für das Training im Turmspringen. Ein Samsung Galaxy Tab Active Pro (SM-T545, Android 11, Chrome 154) filmt den Sprung. Die App zeigt das Bild mit einstellbarer Verzögerung. Die Ausgabe geht per USB-C auf HDMI an einen 22-Zoll-Fernseher. Der Springer sieht seinen Sprung, nachdem er aus dem Becken gestiegen ist.

## Zusammenarbeit

- Antworten auf Deutsch, sachlich und ohne Floskeln. Die genauen Stilregeln stehen in `PLAN.md` unter „Kommunikation mit dem Nutzer“.
- Der Nutzer programmiert nicht. Claude schreibt den gesamten Code, der Nutzer testet auf dem Tablet und schickt Fotos.
- Claude committet lokal im Projektordner. Der Nutzer lädt mit GitHub Desktop über „Push origin“ hoch. „Fetch origin“ reicht dafür nicht.
- Ob eine Version online ist, prüft Claude selbst, indem es `app.js` von GitHub Pages abruft und `APP_VERSION` liest.
- Anleitungen für GitHub oder Android brauchen genaue Klickwege.

## Orte

- Projektordner: `C:\Users\Hilde\Desktop\Cload_Projekte\DelayAnwendung`
- Repository: `tiefenrausch4711-stack/turm-delay`, öffentlich, Branch `main`
- App: `https://tiefenrausch4711-stack.github.io/turm-delay/`
- Test-App: `https://tiefenrausch4711-stack.github.io/turm-delay/test/`
- Testseite für die Fähigkeiten des Tablets: `https://tiefenrausch4711-stack.github.io/turm-delay/test.html`

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Einstellungsbildschirm und Betriebsansicht |
| `style.css` | Gestaltung, dunkles Graphit mit Türkis als Akzent, Stil eines Messinstruments |
| `app.js` | Gesamte Logik mit Kamera, Kodierung, Puffer, Wiedergabe, Überwachung und Oberfläche |
| `sw.js` | Service Worker für den Offline-Betrieb und für Updates |
| `manifest.webmanifest` | Installation als App, Vollbild, Querformat |
| `icon-192.png`, `icon-512.png` | Symbol, weiße Kamera mit einer Uhr als Objektiv auf dunkelblauem Grund |
| `icon.py` | Erzeugt beide Symbole, Aufruf `python icon.py .` im Projektordner, braucht Pillow |
| `test/` | Test-App „LagCam Test“, vollständige Kopie der App mit eigenen Änderungen |
| `test.html` | Testseite für die Fähigkeiten des Tablets |
| `PLAN.md` | Vollständige Planung und Testergebnisse |
| `.claude/launch.json` | Lokaler Vorschau-Server mit `python -m http.server 8765` |

## Normale App und Test-App

Seit dem 30.09.2026 gibt es zwei Apps nebeneinander.

- Die normale App „LagCam“ liegt im Hauptordner. Ihr Stand ist mit dem Git-Tag `v0` gesichert. Sie wird im Training genutzt und nur noch bei Fehlern geändert.
- Die Test-App „LagCam Test“ liegt im Ordner `test/`. Neue Funktionen kommen nur dorthin. Sie hat ein oranges Symbol und in der App ein oranges Schild „Test“. Oben rechts steht „Stand“ mit ihrer Nummer.
- Beide teilen sich die Adresse von GitHub Pages, sind aber getrennt installiert. Die Test-App speichert ihre Einstellungen unter `lagcam.test.settings` und übernimmt beim ersten Start die Einstellungen der normalen App. Ihr Offline-Speicher heißt `lagcam-test-vN`, der der normalen App `turm-delay-vN`. Jeder Service Worker löscht nur Speicher mit dem eigenen Präfix.
- Bei Änderungen an der Test-App `APP_VERSION` in `test/app.js` und `VERSION` in `test/sw.js` erhöhen.
- Hat sich die Test-App bewährt, werden ihre Änderungen in den Hauptordner übernommen. Dabei `STORE_KEY`, `MAIN_STORE_KEY`, Präfix, Namen, Schild und Symbol der normalen App beibehalten. Danach den neuen Stand mit einem Tag wie `v1` sichern.
- Symbol der Test-App mit `python icon.py test c2570c` erzeugen.

## Neue Version veröffentlichen

1. `APP_VERSION` in `app.js` und `VERSION` in `sw.js` um eins erhöhen. Das ist bei jeder Änderung Pflicht, sonst bleibt das Tablet auf der alten Version.
2. Committen, mit der Attribution `Co-Authored-By` aus den Systemhinweisen.
3. Der Nutzer klickt in GitHub Desktop auf „Push origin“.
4. Auf dem Tablet die App einmal öffnen. Die neue Version wird dabei im Hintergrund geladen. Beim nächsten Öffnen ist sie aktiv. Die Versionsnummer steht oben rechts im Einstellungsbildschirm.

## Aktueller Funktionsumfang

- Der Name ist „LagCam“ ohne Leerzeichen. In der App steht er in Großbuchstaben als LAGCAM.

- Beim Öffnen erscheint immer der Einstellungsbildschirm.
- Die Vorschau ist gestaltet wie ein Kamerasucher, mit Eckmarken und Drittellinien. Unten stehen Auflösung, Belichtung, Fokus und die gemessene neben der eingestellten Bildrate.
- 01 Verzögerung von 1 bis 30 Sekunden, mit großer Anzeige, Plus- und Minustasten und Skala.
- 02 Kamera, Rückseite oder Vorderseite.
- 03 Zoom, bei beiden Kameras von 1 bis 8.
- 04 Belichtung, Auto oder Manuell. Bei Manuell gibt es einen Helligkeitsregler von stockdunkel bis weiß. Er verteilt die Helligkeit auf Zeit und ISO. Zuerst steigt die Zeit bis 1/250 s, dann der ISO-Wert, danach wieder die Zeit.
- 05 Fokus, Auto oder Manuell. Bei Manuell gibt es einen Regler von nah bis fern, linear über den gemeldeten Wert von `focusDistance`. Bei der Vorderseite ist der Bereich ausgeblendet.
- Zoom, Belichtung und Fokus werden pro Kamera gespeichert.
- Fest eingestellt sind 1080p, 30 Bilder pro Sekunde und keine Spiegelung. Schalter dafür wurden bewusst entfernt.
- Im Betrieb ist das Bild im Format 16:9 über die volle Breite. Oben rechts steht die Anzeige, zum Beispiel „20 s“. Weiß bedeutet normal. Gelb bedeutet Überlast oder weniger Bilder als eingestellt. Rot bedeutet Kameraausfall, dann läuft das Neuverbinden. Beim Start zeigt die Anzeige einen Countdown, der erst mit dem ersten Kamerabild beginnt.
- 3 Sekunden Drücken an beliebiger Stelle führt zurück in die Einstellungen, mit einem türkisen Fortschrittskreis.
- Technik: Kamerabilder werden über `MediaStreamTrackProcessor` gelesen und mit `VideoEncoder` in H.264 per Hardware kodiert. Etwa jede Sekunde gibt es einen Keyframe. Ein Ringpuffer hält die Daten, `VideoDecoder` zeichnet sie auf ein Canvas. Wake Lock hält den Bildschirm an.
- Überwachung: Kommen länger als 2 Sekunden keine Bilder, gilt die Kamera als ausgefallen, und die App verbindet alle 3 Sekunden neu. Während eines Kamerastarts und bis 3 Sekunden nach jedem Kamerabefehl ruht die Überwachung. Jeder Kamerabefehl hat eine Zeitgrenze von 3 Sekunden.

## Wichtige Erkenntnisse

- Chrome bietet auf dem Tablet höchstens 30 Bilder pro Sekunde an. 60 sind nicht möglich.
- Bei schwachem Licht senkt die Automatik die Bildrate. Im Wohnzimmer wurden nur 16,6 Bilder pro Sekunde gemessen. Eine kurze manuelle Belichtung hält 30.
- Hardware-Kodierung läuft stabil. Im Lasttest gingen keine Bilder verloren, und 30 Sekunden Puffer brauchen bei 1080p nur etwa 25 MB.
- Das Tablet hat 16:10, der Fernseher 16:9. Die Ränder lassen sich eventuell über eine Zoom-Einstellung am Fernseher (BSL-22112V) entfernen.
- Die Vorschau im Claude-Desktop hat keinen Kamerazugriff. Zum Testen wird per JavaScript eine künstliche Kamera eingespeist, ein Canvas mit `captureStream`, das `navigator.mediaDevices.getUserMedia` ersetzt. Vor jedem Test Service Worker und Caches löschen, sonst lädt die Vorschau eine alte Version. Werkzeugaufrufe mit langen `await` blockieren `requestAnimationFrame`, deshalb die Wiedergabe in getrennten Aufrufen prüfen.
- Test am 30.09.2026 mit Version 14. Bild, Zoom und Fokusregler funktionieren, die Richtung des Fokusreglers stimmt. Im Automatikmodus meldet Chrome über `getSettings()` nur die zuletzt manuell gesetzten Werte für Belichtung und Fokus. Seit Version 15 steht bei Automatik deshalb nur „Auto“ ohne Zahlen.
- Am 29.09.2026 gelöster Update-Fehler: Der Service Worker speichert Dateien mit `cache: 'reload'`, sonst landen alte Dateien aus dem Browser-Zwischenspeicher im Offline-Speicher.

## Offen und als Nächstes

- Version 17 und die Test-App müssen noch hochgeladen und auf dem Tablet geprüft werden.
- Der Nutzer hat noch nicht gesagt, welche Funktionen die Test-App bekommen soll.
- Angeboten und noch nicht entschieden ist `navigator.storage.persist()`, damit Chrome den Offline-Speicher nicht bei vollem Speicher löscht.
- Test in der Halle: Werden 30 Bilder pro Sekunde erreicht? Welche Belichtung passt? Gibt es Streifen durch das Hallenlicht?
- Prüfen, ob die Vorschau im Einstellungsbildschirm auf dem Tablet flüssig läuft. Der Nutzer hatte ein Hängen gemeldet. Das betraf wahrscheinlich die Vorschau im Claude-Desktop. Die möglichen Ursachen auf dem Tablet wurden in Version 12 behoben.
- Test über 3 Stunden, mit Blick auf Wärme und Stabilität. Falls das Tablet überhitzt, wieder 720p als Rückfall einbauen.
- Die Checkliste für das Tablet aus `PLAN.md` an den Nutzer übergeben. Sie betrifft „Nicht stören“, die Akkuoptimierung, die Helligkeit, das Ladekabel und die Wärme.
- Alte Symbole wie „Cam Delay“, „Turm Delay“, „Cam Time“ oder „Lag Time“ auf dem Tablet entfernen und die App neu als „LagCam“ installieren.
