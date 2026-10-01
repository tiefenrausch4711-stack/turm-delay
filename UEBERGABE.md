# Übergabe LagTime

Stand 30.09.2026. Normale App v0 mit Version 23, Test-App Stand 29. Beides lokal committet.

Diese Datei dient als Einstieg in einen neuen Chat. Lies zuerst diese Datei und danach `PLAN.md`. `PLAN.md` enthält die vollständige, abgestimmte Planung, die Testergebnisse des Tablets und die Regeln für die Kommunikation mit dem Nutzer.

## Kurzfassung

LagTime ist eine Progressive Web App für das Training im Turmspringen. Ein Samsung Galaxy Tab Active Pro (SM-T545, Android 11, Chrome 154) filmt den Sprung. Die App zeigt das Bild mit einstellbarer Verzögerung. Die Ausgabe geht per USB-C auf HDMI an einen 22-Zoll-Fernseher. Der Springer sieht seinen Sprung, nachdem er aus dem Becken gestiegen ist.

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
| `test/` | Test-App „LagTime Test“, vollständige Kopie der App mit eigenen Änderungen |
| `test.html` | Testseite für die Fähigkeiten des Tablets |
| `PLAN.md` | Vollständige Planung und Testergebnisse |
| `.claude/launch.json` | Lokaler Vorschau-Server mit `python -m http.server 8765` |

## Normale App und Test-App

Seit dem 30.09.2026 gibt es zwei Apps nebeneinander.

- Die normale App „LagTime“ liegt im Hauptordner. Ihr Stand ist mit dem Git-Tag `v0` gesichert. Sie wird im Training genutzt und nur noch bei Fehlern geändert.
- Die Test-App „LagTime Test“ liegt im Ordner `test/`. Neue Funktionen kommen nur dorthin. Sie hat ein oranges Symbol und in der App ein oranges Schild „Test“. Oben rechts steht „Stand“ mit ihrer Nummer.
- Beide teilen sich die Adresse von GitHub Pages, sind aber getrennt installiert. Die Test-App speichert ihre Einstellungen unter `lagcam.test.settings` und übernimmt beim ersten Start die Einstellungen der normalen App. Ihr Offline-Speicher heißt `lagcam-test-vN`, der der normalen App `turm-delay-vN`. Jeder Service Worker löscht nur Speicher mit dem eigenen Präfix.
- Bei Änderungen an der Test-App `APP_VERSION` in `test/app.js` und `VERSION` in `test/sw.js` erhöhen.
- Hat sich die Test-App bewährt, werden ihre Änderungen in den Hauptordner übernommen. Dabei `STORE_KEY`, `MAIN_STORE_KEY`, Präfix, Namen, Schild und Symbol der normalen App beibehalten. Danach den neuen Stand mit einem Tag wie `v1` sichern.
- Symbol der Test-App mit `python icon.py test c2570c` erzeugen.
- Der Bereich der normalen App ist seit Version 18 auf `./index.html` begrenzt, mit `id` `./`. Vorher umfasste er den Ordner `test/`, und Chrome meldete die Test-App als schon installiert. Nach dieser Änderung muss die normale App auf dem Tablet einmal deinstalliert und neu installiert werden.

## Test-App, geplante Funktionen

Mit dem Nutzer am 30.09.2026 abgestimmt. Gebaut wird in drei Schritten, jeder wird auf dem Tablet geprüft.

1. Erledigt in Stand 2. Speicherknopf, Videoliste, Wiedergabe mit Zeitlupe und Einzelbildern, Schieberegler, Stern, Name, Löschen, Export, Löschen nach 7 Tagen. Seit Stand 18 ist die Frist unten in der Videoliste mit Minus- und Plustasten frei von 1 bis 30 Tagen einstellbar, seit Stand 19 mit „nie“ als Stufe nach 30, gespeichert als `settings.keepDays`, 0 bedeutet nie. Aufgeräumt wird 1,5 Sekunden nach dem letzten Tippen, eine kürzere Frist löscht dann sofort. Eine Auswahlliste mit festen Werten hatte der Nutzer abgelehnt. Teilen wurde in Stand 9 auf Wunsch des Nutzers entfernt, es bleibt nur Herunterladen.
2. Erledigt in Stand 4. Zeichnen im Standbild mit Freihand und geraden Linien, Winkel über drei Punkte messen, Zoom mit zwei Fingern, Schleife über einen Abschnitt. Zeichnungen sind nur vorübergehend und verschwinden, sobald das Video weiterläuft.
Zweiter Nutzertest in Stand 21. Geprüft ohne Befund: Kamerawechsel, Verzögerung 1 bis 30, Betrieb mit 30 Sekunden über mehrere Minuten mit stabil etwa 33 Sekunden Puffer, Speichern von 30 Sekunden, 42 Videos über fünf Tage, Sonderzeichen in Namen, schnelles Öffnen und Schließen, Schleife in Zeitlupe, Schnitt auf 4 Bilder, Export eines langen Videos. Behoben:
- Das Fenster „Darstellung“ legt einen Verlaufseintrag an. Die Zurück-Geste schließt es, statt die Seite zu wechseln.
- Vorschaubilder nutzen das Vollbild vor der Zielstelle, wenn es im sichtbaren Teil liegt, und einen gemeinsamen Decoder. 42 Bilder brauchen höchstens 10 statt etwa 55 Sekunden.
- Das Foto speichert bei Zoom nur den sichtbaren Ausschnitt in voller Größe und meldet „Foto gespeichert“. Der Knopf ist während des Speicherns gesperrt.
- Dateinamen enden nicht mehr auf „_“, wenn der Name nur aus Sonderzeichen besteht.
- Die Auswahl der Springer ist höchstens 280 Pixel breit.

Nutzertest in Stand 20, umgesetzt am 01.10.2026.
- Fällt die Kamera im Betrieb aus, bleibt der Puffer erhalten. Er läuft weiter auf den Fernseher und lässt sich speichern, die Anzeige ist dabei rot. Nach dem Neuverbinden kommen die neuen Bilder hinter die Lücke in denselben Puffer. Eine Lücke gilt nicht als Überlast, siehe `hasDueFrame`.
- Speichern im Countdown zeigt „Puffer füllt sich noch“ und speichert nichts.
- „Start“ ist gesperrt, solange die Kamera nicht läuft.
- Zurück-Taste und Zurück-Geste von Android über die History API. Wiedergabe führt zur Liste, Liste zu Live, im Betrieb wirkt sie nicht. Betrieb, Liste und Wiedergabe legen je einen Verlaufseintrag an, „‹ Liste“, „Live“ und Löschen nutzen `history.back()`.
- Die Liste behält ihre Position nach dem Zurückkehren aus einem Video.
- „Bild vor“ und „Bild zurück“ schalten beim Halten fortlaufend weiter.
- Das Werkzeug „Zurück“ heißt „Rückgängig“.
- Die Bildfolge ist auf die Bilder im Abschnitt begrenzt.
- Das Vorschaubild stammt nie aus dem Vorlauf vor einem Schnitt.
- Oben rechts in der Liste steht nur der Platz der Videos.
- „Nur mit Stern“ ist bei leerer Liste gesperrt.
- Bewusst nicht geändert, auf Wunsch des Nutzers: doppeltes Speichern, weil 1 Sekunde Halten genügt, und die dauerhaft laufende Kamera auf Live, weil das Tablet für den Fernseher an bleiben muss.

Designdurchsicht in Stand 16. Filter der Liste stehen oben. `--dim` ist in beiden Modi auf etwa 4,5 zu 1 Kontrast angehoben. Kleinschrift ist größer, also Werkzeugleiste 12,5 Pixel, Skala 12,5, Hinweise 14, Version 13. Akzentfarbe als Schrift läuft über `--acc-text`, im Hellmodus 55 Prozent Akzent mit Schwarz gemischt. Die Umschaltung Live und Analyse ist im aktiven Zustand neutral grau, damit „Start“ die einzige große Akzentfläche bleibt. Seit Stand 23 haben die Videokarten eigene Farben `--card` und `--card-line`, im Dunkelmodus deutlich heller als der Hintergrund, dazu ein leichter Schatten. Seit Stand 22 sind auch die Schalter `.seg` dezent, also gewählter Teil mit 16 Prozent Akzent, Rand in `--acc-text` und normaler Schrift. Der Name steht in der Kartenzeile neben Nummer und Uhrzeit. Der schwarze Speicherring hat einen schwachen hellen Schein per `drop-shadow`.

Einstellungen seit Stand 29. Das Zahnrad öffnet das Fenster „Einstellungen“ mit den Abschnitten Darstellung, also Farbe und Modus, und Videos, also Aufbewahrung ohne Stern, „Belegt … MB“ und „Videos löschen …“. Löschen läuft in zwei Schritten mit „Ohne Stern löschen (n)“, „Alle löschen (n)“ in Rot und „Abbrechen“, in einer Transaktion. Die Aufbewahrung unten in der Liste und „Videos … MB“ oben in der Liste sind entfallen. Die Versionsnummer bleibt oben rechts auf Live. Einen Abschnitt „Über die App“ wollte der Nutzer nicht.

Navigation seit Stand 15. Die Seite mit Kamera und Einstellungen heißt „Live“. In der Kopfzeile von Live und Videoliste sitzt mittig an gleicher Stelle eine Umschaltung „Live | Analyse“. Der Knopf „Analyse“ neben Start und der Knopf „‹ Einstellungen“ in der Liste sind entfallen. In der Wiedergabe eines Videos bleibt „‹ Liste“.

Zusätzlich in Stand 6. Ein Zahnrad oben rechts in Einstellungen und Analyse öffnet das Fenster „Darstellung“. Dort gibt es seit Stand 7 vier Farbvorschläge, nämlich Türkis, Blau, Grün und Weiß, und links ein buntes Feld. Es öffnet sofort einen eigenen Farbwähler mit Fläche und Farbtonregler, der dem Hell- und Dunkelmodus folgt. Der Farbwähler von Android wird bewusst nicht genutzt. Dazu kommt die Wahl zwischen Dunkel und Hell. Der Betrieb bleibt immer schwarz. Gespeichert in `settings.ui`. Alle Türkistöne im CSS sind `color-mix` aus `--acc`. Die Schrift auf Akzentflächen `--acc-ink` wird nach Helligkeit dunkel oder weiß. Die hellen Werte gelten nur für `#settings`, `#analysis` und `#uiDlg`.
3. Erledigt in Stand 10, abgestimmt am 01.10.2026.
   - Foto. Entfallen in Stand 28.
   - Filter in der Liste nach Stern und nach Name. Seit Stand 23 heißt die Auswahl „Alle Namen“ statt „Alle Springer“, weil das allgemeiner ist.
   - Lot. Gestrichelte Senkrechte über die ganze Bildhöhe, mit Griff verschiebbar.
   - Schneiden. Rechts anwählen. Seit Stand 13 erscheinen auf dem normalen Zeitregler zwei zusätzliche Punkte, neutral weiß mit dunklem Rand, seit Stand 25 ohne Buchstaben und ohne Erklärung, mit markiertem Abschnitt dazwischen. Die Leiste darüber zeigt nur „Länge …“. Die Werkzeugleiste ist seit Stand 25 86 Pixel breit, damit „Rückgängig“ passt. Seit Stand 26 sitzt „Rückgängig“ ganz unten in der Werkzeugleiste unter „Bildfolge“, abgesetzt mit `margin-top: auto`. Seit Stand 27 steht „1:1“ zum Zurücksetzen des Zooms direkt unter „Ansehen“. Seit Stand 28 steht „Leeren“ unter „Rückgängig“ ganz unten, und das Werkzeug „Foto“ ist auf Wunsch des Nutzers entfallen. Farben wurden bewusst vermieden, weil sie mit der frei wählbaren Akzentfarbe kollidieren können. Eigene Regler gibt es nicht mehr. Darüber liegt eine schmale Leiste mit Länge, „Abbrechen“ und „Schneiden“. Das Original wird ersetzt und behält Nummer, Name und Stern. Neu kodiert wird nicht. Ab dem Keyframe vor dem Anfang bleibt ein unsichtbarer Vorlauf, gespeichert als `skip` im Datensatz `data`. Die Wiedergabe beginnt bei `pFirst`. Das MP4 überspringt den Vorlauf über eine Edit List `elst`.
   - Bildfolge. Abschnitt wie beim Schneiden mit den Punkten auf dem Zeitregler wählen, dazu 3 bis 16 Bilder, dann „Erstellen“. Ein eigener Decoder holt die Bilder in 1280 x 720. Der Hintergrund ist der Median der Helligkeit auf einem Raster von 4 Bildpunkten. Wo ein Bild deutlich abweicht, wird es eingesetzt, spätere Bilder liegen oben. Das Ergebnis ersetzt das Videobild, bis wieder ein Videobild erscheint. Man kann darauf zeichnen und es als Foto speichern.
   - Seit Stand 24 gibt es in der Wiedergabe neben „‹ Liste“ die Tasten „‹“ und „›“ für das vorherige und nächste Video, chronologisch und innerhalb des Filters der Liste, siehe `clipNeighbor`. Der Wechsel legt keinen Verlaufseintrag an. Zeitlupe bleibt, Zoom, Zeichnung, Schleife und Schnittauswahl werden zurückgesetzt.
   - Vergleich zweier Sprünge entfällt, weil von verschiedenen Brettern gesprungen wird. Zeitmessung und alle Vorschläge für den Betrieb wollte der Nutzer nicht.

Entscheidungen des Nutzers
- Kein Fernauslöser. Der Bildschirm wird auf den Fernseher gespiegelt.
- Während der Analyse ist die Kamera aus. Es gibt entweder Betrieb oder Analyse.
- Der Speicherknopf ist seit Stand 8 ein schwarzer Ring ohne Füllung, seit Stand 12 mit dünner Linie unten links im 16:9-Bereich. Er muss 1 Sekunde gehalten werden. Dabei verschwindet der Ring von oben im Uhrzeigersinn. Ist er weg, kommt die Meldung „Gespeichert“, danach erscheint der Ring wieder.
- Die Sekundenanzeige oben rechts steht seit Version 22 und Stand 8 frei, ohne Hintergrund und Rahmen, nur mit weichem Textschatten.
- Gespeichert wird der Teil des Puffers, der noch gezeigt wird, also vom Bild auf dem Fernseher bis zum Moment des Drückens. Der Trainer drückt direkt nach dem Eintauchen.
- Videos werden nach Datum gruppiert und pro Tag durchnummeriert. Seit Stand 11 steht nur die Zahl, ohne „Nr.“.

Technik in `test/analysis.js`
- Die Videos liegen in IndexedDB `lagcam-test`. Der Speicher `clips` hält die Angaben für die Liste mit Vorschaubild, `data` die H.264-Daten als Blob mit einer Bildtabelle und der Decoder-Konfiguration.
- Gespeichert wird ohne neu zu kodieren. Beginn ist der Keyframe vor dem gezeigten Bild.
- Vorschaubilder entstehen erst in der Liste, etwa 2 Sekunden vor dem Ende.
- Die Wiedergabe dekodiert mit `VideoDecoder`. Ein Sprung auf ein Bild dekodiert ab dem Keyframe davor und endet mit `flush()`.
- Der Export verpackt die Daten mit einem eigenen kleinen MP4-Muxer. Dateiname `LagTime_<Datum>_<Nr>_<Name>.mp4`.
- `navigator.storage.persist()` wird beim Start angefordert.
- Zeichnen, Winkel und Zoom stehen in `test/draw.js`. Formen liegen in Bildpunkten des Videos. Die Zeichenfläche `pDraw` liegt deckungsgleich über `pOut` in `pView`, das per CSS-Transform gezoomt wird. Zwei Finger zoomen und verschieben in jedem Werkzeug. Im Werkzeug „Ansehen“ verschiebt ein Finger, Doppeltippen setzt den Zoom zurück. Punkte von Linien und Winkeln lassen sich nachträglich verschieben. `onPlayerFrameShown()` löscht die Zeichnung bei jedem neuen Bild. Der Zoom bleibt.
- Die Schleife setzt mit dem ersten Druck den Anfang, mit dem zweiten das Ende, mit dem dritten wird sie aufgehoben. Bei aktiver Schleife springt die Wiedergabe am Ende über `startFeed(loopA)` zurück.
- In der Vorschau im Claude-Desktop läuft `requestAnimationFrame` nicht, wenn das Fenster im Hintergrund liegt. Die Wiedergabe lässt sich dann durch direkte Aufrufe von `playerTick(performance.now())` prüfen.

## Neue Version veröffentlichen

1. `APP_VERSION` in `app.js` und `VERSION` in `sw.js` um eins erhöhen. Das ist bei jeder Änderung Pflicht, sonst bleibt das Tablet auf der alten Version.
2. Committen, mit der Attribution `Co-Authored-By` aus den Systemhinweisen.
3. Der Nutzer klickt in GitHub Desktop auf „Push origin“.
4. Auf dem Tablet die App einmal öffnen. Die neue Version wird dabei im Hintergrund geladen. Beim nächsten Öffnen ist sie aktiv. Die Versionsnummer steht oben rechts im Einstellungsbildschirm.

## Aktueller Funktionsumfang

- Der Name ist „LagTime“ ohne Leerzeichen. In der App steht er in Großbuchstaben als LAGTIME.

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
- 1 Sekunde Drücken an beliebiger Stelle führt zurück in die Einstellungen, mit einem Fortschrittskreis in der Akzentfarbe. Seit Version 23 und Stand 20 ist es 1 Sekunde, vorher 3 und dann 2.
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

- Version 23 und die Test-App Stand 29 müssen noch hochgeladen und auf dem Tablet geprüft werden. Wichtig ist, ob das Speichern im Betrieb das laufende Bild stört und ob Herunterladen auf Android funktioniert.
- Zurückgestellt am 01.10.2026 ist eine weitere, externe Kamera. Besprochene Wege waren eine USB-Kamera, die auf Android 11 bei Samsung oft nicht erkannt wird und einen USB-C-Hub neben dem HDMI-Adapter bräuchte, ein zweites Handy als Funkkamera über WebRTC mit Kopplung per QR-Code, und eine allgemeine Kamerawahl über alle von `enumerateDevices` gemeldeten Kameras als ersten Schritt.
- `navigator.storage.persist()` ist nur in der Test-App eingebaut. Für die normale App ist es angeboten und noch nicht entschieden.
- Test in der Halle: Werden 30 Bilder pro Sekunde erreicht? Welche Belichtung passt? Gibt es Streifen durch das Hallenlicht?
- Prüfen, ob die Vorschau im Einstellungsbildschirm auf dem Tablet flüssig läuft. Der Nutzer hatte ein Hängen gemeldet. Das betraf wahrscheinlich die Vorschau im Claude-Desktop. Die möglichen Ursachen auf dem Tablet wurden in Version 12 behoben.
- Test über 3 Stunden, mit Blick auf Wärme und Stabilität. Falls das Tablet überhitzt, wieder 720p als Rückfall einbauen.
- Die Checkliste für das Tablet aus `PLAN.md` an den Nutzer übergeben. Sie betrifft „Nicht stören“, die Akkuoptimierung, die Helligkeit, das Ladekabel und die Wärme.
- Alte Symbole wie „Cam Delay“, „Turm Delay“, „Cam Time“, „Lag Time“ oder „LagCam“ auf dem Tablet entfernen und die App neu als „LagTime“ installieren.
