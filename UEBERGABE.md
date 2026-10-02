# Übergabe LagLab

Stand 02.10.2026. Normale App v2 unter `app/`, inhaltlich gleich mit Test-App Stand 10. Test-App Stand 36 unter `test/` hat zusätzlich die Kamerawahl „USB“ und die Brücke `native.js` für die Android-App. Git-Tags `v2`, `stand-10`, `stand-11`, `usbtest-1`. Neu sind die Android-Apps im Ordner `android/`, der Machbarkeitstest „LagLab USB-Test“ und die Android-Test-App „LagLab Test“ Stand 36, siehe Abschnitt „Android“. Seit dem 02.10.2026 heißen die Apps „LagLab“ und „LagLab Test“, vorher „LagTime“, Startseite im Hauptordner. Test-App Stand 2 ist lokal committet und noch nicht übernommen. Die Git-Tags `v0`, `v1` und `stand-1` gibt es nur lokal, GitHub Desktop lädt sie nicht mit hoch.

Diese Datei dient als Einstieg in einen neuen Chat. Lies zuerst diese Datei und danach `PLAN.md`. `PLAN.md` enthält die vollständige, abgestimmte Planung, die Testergebnisse des Tablets und die Regeln für die Kommunikation mit dem Nutzer.

## Kurzfassung

LagLab ist eine Progressive Web App für das Training im Turmspringen. Ein Samsung Galaxy Tab Active Pro (SM-T545, Android 11, Chrome 154) filmt den Sprung. Die App zeigt das Bild mit einstellbarer Verzögerung. Die Ausgabe geht per USB-C auf HDMI an einen 22-Zoll-Fernseher. Der Springer sieht seinen Sprung, nachdem er aus dem Becken gestiegen ist.

## Zusammenarbeit

- Antworten auf Deutsch, sachlich und ohne Floskeln. Die genauen Stilregeln stehen in `PLAN.md` unter „Kommunikation mit dem Nutzer“.
- Der Nutzer programmiert nicht. Claude schreibt den gesamten Code, der Nutzer testet auf dem Tablet und schickt Fotos.
- Claude committet lokal im Projektordner. Der Nutzer lädt mit GitHub Desktop über „Push origin“ hoch. „Fetch origin“ reicht dafür nicht.
- Ob eine Version online ist, prüft Claude selbst, indem es `app/app.js` und `test/app.js` von GitHub Pages abruft und `APP_VERSION` liest.
- Anleitungen für GitHub oder Android brauchen genaue Klickwege.

## Orte

- Projektordner: `C:\Users\Hilde\Desktop\Cload_Projekte\DelayAnwendung`
- Repository: `tiefenrausch4711-stack/turm-delay`, öffentlich, Branch `main`
- Startseite mit zwei Knöpfen zu beiden Apps: `https://tiefenrausch4711-stack.github.io/turm-delay/`
- App: `https://tiefenrausch4711-stack.github.io/turm-delay/app/`
- Test-App: `https://tiefenrausch4711-stack.github.io/turm-delay/test/`
- Testseite für die Fähigkeiten des Tablets: `https://tiefenrausch4711-stack.github.io/turm-delay/test.html`
- Testseite für USB-Kameras in Chrome: `https://tiefenrausch4711-stack.github.io/turm-delay/usb.html`
- Android-App „LagLab USB-Test“ zum Herunterladen: `https://tiefenrausch4711-stack.github.io/turm-delay/apk/laglab-usbtest.apk`
- Android-Test-App „LagLab Test“ zum Herunterladen: `https://tiefenrausch4711-stack.github.io/turm-delay/apk/laglab-test.apk`

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite mit Knöpfen zu `app/` und `test/`, meldet den alten Service Worker ab |
| `sw.js` | Aufräum-Worker, ersetzt den alten Worker der früher hier liegenden App, meldet sich selbst ab |
| `app/` | Normale App mit `index.html`, `app.js`, `analysis.js`, `draw.js`, `style.css`, `sw.js`, `manifest.webmanifest` und Symbolen |
| `icon-192.png`, `icon-512.png` | Symbol, seit Version 24 und Stand 36 weiß gefüllte Kamera mit runden Ecken und weichen Übergängen am Aufsatz, verkleinert und mittig. Die Uhr als Objektiv ist innen in der Hintergrundfarbe mit weißem Ring und weißen Zeigern. Seit v1.3 und Stand 3 ist das Objektiv größer, ohne weißen Ring und ohne Blitzpunkt, nur mit weißen Zeigern. Normale App blaugrau `#455a6f`, Test-App orange `#c2570c`, das Objektiv jeweils in der Hintergrundfarbe. Erzeugt mit `python icon.py app 455a6f` und `python icon.py test c2570c` |
| `icon.py` | Erzeugt beide Symbole, Aufruf `python icon.py .` im Projektordner, braucht Pillow |
| `test/` | Test-App „LagLab Test“, vollständige Kopie der App mit eigenen Änderungen |
| `test.html` | Testseite für die Fähigkeiten des Tablets |
| `usb.html` | Testseite, listet alle Kameras, die Chrome sieht, und misst sie |
| `android/` | Gradle-Projekt für Android-Apps, Module `usbtest` und `laglab` |
| `test/native.js` | Brücke zur Android-App, im Browser ohne Wirkung |
| `apk/` | Fertige Android-Apps zum Herunterladen über GitHub Pages |
| `PLAN.md` | Vollständige Planung und Testergebnisse |
| `.claude/launch.json` | Lokaler Vorschau-Server mit `python -m http.server 8765` |

## Normale App und Test-App

Seit dem 30.09.2026 gibt es zwei Apps nebeneinander.

- Die normale App „LagLab“ liegt seit v1.2 im Ordner `app/`, vorher im Hauptordner. Am 01.10.2026 wurde der Inhalt der Test-App Stand 1 übernommen und als `v1` veröffentlicht, Git-Tag `v1`. Der alte Stand ist unter `v0` gesichert. Sie wird im Training genutzt und nur bei Fehlern oder bei einer neuen Übernahme aus der Test-App geändert.
- Unterschiede der normalen App zur Test-App: Titel und Logo ohne „Test“, Anzeige `v` + `APP_VERSION`, `STORE_KEY` `turmdelay.settings.v1` ohne Übernahme anderer Einstellungen, IndexedDB `lagtime` statt `lagcam-test`, Offline-Speicher `turm-delay-r1` mit Zählung `r1`, `r2` und so fort, blaues Symbol, Manifest mit Bereich `./index.html`.
- Die Test-App „LagLab Test“ liegt im Ordner `test/`. Neue Funktionen kommen nur dorthin. Sie hat ein oranges Symbol und in der App ein oranges Schild „Test“. Oben rechts steht „Stand“ mit ihrer Nummer.
- Beide teilen sich die Adresse von GitHub Pages, sind aber getrennt installiert. Die Test-App speichert ihre Einstellungen unter `lagcam.test.settings` und übernimmt beim ersten Start die Einstellungen der normalen App. Ihr Offline-Speicher heißt `lagcam-test-vN`, der der normalen App `turm-delay-vN`. Jeder Service Worker löscht nur Speicher mit dem eigenen Präfix.
- Bei Änderungen an der Test-App `APP_VERSION` in `test/app.js` und `VERSION` in `test/sw.js` erhöhen. Am 01.10.2026 wurde die Zählung nach Stand 36 auf „Stand 1“ zurückgesetzt und mit dem Git-Tag `stand-1` gesichert. Der Offline-Speicher heißt seitdem `lagcam-test-s1`, weiter mit `s2`, `s3` und so fort, damit keine Verwechslung mit den alten Namen `v1` bis `v36` entsteht.
- Hat sich die Test-App bewährt, werden ihre Änderungen nach `app/` übernommen. Dabei `STORE_KEY`, `MAIN_STORE_KEY`, Präfix, Namen, Schild und Symbol der normalen App beibehalten. Danach den neuen Stand mit einem Tag wie `v1` sichern.
- Symbol der Test-App mit `python icon.py test c2570c` erzeugen.
- Beide Apps liegen seit v1.2 und Test-App Stand 2 als Geschwister in `app/` und `test/`, jede mit Bereich und `id` `./` im eigenen Ordner. Vorher lag die normale App im Hauptordner, ihr Bereich umfasste `test/`, und Chrome meldete die Test-App als schon installiert. Die Begrenzung auf `./index.html` ab Version 18 hat das auf dem Tablet nicht zuverlässig gelöst. Nach dem Umzug müssen beide Apps einmal deinstalliert und neu installiert werden. Einstellungen und Videos bleiben erhalten, weil sie an den Ursprung `tiefenrausch4711-stack.github.io` gebunden sind.

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

Einstellungen seit Stand 29. Seit Stand 32 ohne Knopf „Fertig“, geschlossen wird durch Tippen neben das Fenster oder die Zurück-Geste. Seit Stand 34 nummerierte Überschriften wie auf Live, also 01 Farbe, 02 Modus, 03 Videos. Videos ist ein Raster `.vidGrid` mit dezentem Text links und rechts einer Spalte von 190 Pixeln, in der die Tasten für die Tage und „Videos löschen …“ bündig abschließen. Das Zahnrad öffnet das Fenster „Einstellungen“ mit den Abschnitten Darstellung, also Farbe und Modus, und Videos, also Aufbewahrung ohne Stern, „Belegt … MB“ und „Videos löschen …“. Löschen läuft seit Stand 31 in drei Schritten. Nach „Videos löschen …“ folgt die Auswahl „Ohne Stern löschen (n)“, „Alle löschen (n)“ oder „Abbrechen“, danach die Rückfrage mit Anzahl und „Ja, löschen“ in Rot. Gelöscht wird in einer Transaktion. Die Aufbewahrung unten in der Liste und „Videos … MB“ oben in der Liste sind entfallen. Die Versionsnummer bleibt oben rechts auf Live. Seit Stand 30 gibt es keinen Hinweistext unter „Start“ mehr. Ein Hilfefenster mit „i“-Knopf hat der Nutzer abgelehnt, die App soll selbsterklärend sein. Einen Abschnitt „Über die App“ wollte der Nutzer nicht.

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
- Der Speicherknopf ist seit Stand 33 gestaltet wie der Kreis zum Zurückkehren. Seit Stand 35 hat er ein Viertel der Fläche, also den halben Durchmesser, mit einem unsichtbaren Rand zum leichteren Treffen. Innen ist er durchsichtig, nur der graue Ring ist zu sehen. Beim Drücken wird er innen dunkel getönt. Beim Halten füllt sich der Ring in 1 Sekunde in der Akzentfarbe, voll heißt gespeichert. Vorher war er von Stand 8 bis 32 ein schwarzer Ring ohne Füllung, seit Stand 12 mit dünner Linie unten links im 16:9-Bereich. Er muss 1 Sekunde gehalten werden. Dabei verschwindet der Ring von oben im Uhrzeigersinn. Ist er weg, kommt die Meldung „Gespeichert“, danach erscheint der Ring wieder.
- Die Sekundenanzeige oben rechts steht seit Version 22 und Stand 8 frei, ohne Hintergrund und Rahmen, nur mit weichem Textschatten. In der Test-App ist sie seit Stand 35 kleiner, 6 statt 8 Prozent der Bildhöhe.
- Gespeichert wird der Teil des Puffers, der noch gezeigt wird, also vom Bild auf dem Fernseher bis zum Moment des Drückens. Der Trainer drückt direkt nach dem Eintauchen.
- Videos werden nach Datum gruppiert und pro Tag durchnummeriert. Seit Stand 11 steht nur die Zahl, ohne „Nr.“.

Technik in `test/analysis.js`
- Die Videos liegen in IndexedDB `lagcam-test`. Der Speicher `clips` hält die Angaben für die Liste mit Vorschaubild, `data` die H.264-Daten als Blob mit einer Bildtabelle und der Decoder-Konfiguration.
- Gespeichert wird ohne neu zu kodieren. Beginn ist der Keyframe vor dem gezeigten Bild.
- Vorschaubilder entstehen erst in der Liste, etwa 2 Sekunden vor dem Ende.
- Die Wiedergabe dekodiert mit `VideoDecoder`. Ein Sprung auf ein Bild dekodiert ab dem Keyframe davor und endet mit `flush()`.
- Der Export verpackt die Daten mit einem eigenen kleinen MP4-Muxer. Dateiname `LagLab_<Datum>_<Nr>_<Name>.mp4`.
- `navigator.storage.persist()` wird beim Start angefordert.
- Zeichnen, Winkel und Zoom stehen in `test/draw.js`. Formen liegen in Bildpunkten des Videos. Die Zeichenfläche `pDraw` liegt deckungsgleich über `pOut` in `pView`, das per CSS-Transform gezoomt wird. Zwei Finger zoomen und verschieben in jedem Werkzeug. Im Werkzeug „Ansehen“ verschiebt ein Finger, Doppeltippen setzt den Zoom zurück. Punkte von Linien und Winkeln lassen sich nachträglich verschieben. `onPlayerFrameShown()` löscht die Zeichnung bei jedem neuen Bild. Der Zoom bleibt.
- Die Schleife setzt mit dem ersten Druck den Anfang, mit dem zweiten das Ende, mit dem dritten wird sie aufgehoben. Bei aktiver Schleife springt die Wiedergabe am Ende über `startFeed(loopA)` zurück.
- In der Vorschau im Claude-Desktop läuft `requestAnimationFrame` nicht, wenn das Fenster im Hintergrund liegt. Die Wiedergabe lässt sich dann durch direkte Aufrufe von `playerTick(performance.now())` prüfen.

## Test-App Stand 2 bis 4, seit v1.4 auch in der normalen App

Gearbeitet wird nur an der Test-App. Übertragen in die normale App wird erst, wenn der Nutzer nach dem Testen Bescheid gibt.

- Einstellungen. Tage in derselben dezenten Schrift wie „Belegter Speicher“. „Belegt“ heißt jetzt „Belegter Speicher“. Sechs Farbkreise, nämlich Farbwähler, vier mildere Vorschläge `#4fbfb3`, `#5b8fd6`, `#4caf7d`, `#e9edf0` und als sechster Kreis die eigene Farbe in `settings.ui.custom`. Der sechste Kreis ist gestrichelt leer, bis im Farbwähler eine Farbe gezogen wird. Frühere kräftige Werte werden beim Start auf die milderen umgestellt.
- Analyse. Der Sternfilter zeigt nur „★“, die Namensauswahl heißt „Filter“. In der Wiedergabe stehen „‹“ und „›“ rechts neben der Aufnahmezeit. „‹ Liste“ ist größer. Das Löschen eines einzelnen Videos fragt mit „Ja, löschen“.
- Das Schild „TEST“ bleibt in der Test-App.
- In die normale App übernommen mit v1.4 am 01.10.2026, Git-Tag `v1.4`. Der Startbildschirm ist dort blaugrau `#455a6f`.
- Seit Stand 4 ein eigener Startbildschirm `#splash` in der Symbolfarbe mit dem Symbol in der Mitte. Das Symbol ist seit Stand 9 128 Pixel groß wie bei Chromes eigenem Startbildschirm, vorher sprang es beim Übergang auf eine größere Fläche. Er steht ab dem Öffnen mindestens `SPLASH_MS` 1,3 Sekunden und blendet dann in 0,45 Sekunden aus, mit Sicherheitsabschaltung nach 6 Sekunden. Das Manifest hat dafür `background_color` in der Symbolfarbe, damit der Startbildschirm von Android ohne Farbsprung übergeht. Wirkt bei Android erst nach Aktualisierung oder Neuinstallation der App.

## Test-App Stand 5 bis 10, seit v2 auch in der normalen App

Abgestimmt am 02.10.2026. Am selben Tag mit Stand 10 als v2 in die normale App übernommen. Beim ersten Start von v2 wird die Videoablage `lagtime` von Version 1 auf 2 erweitert, vorhandene Videos bleiben erhalten, geprüft in der Vorschau.

- Jedes Video hat neben Name eine Eigenschaft `prop`, zum Beispiel „Kopfsprung“. Bereits vergebene Namen und Eigenschaften erscheinen beim Eintippen als Auswahl.
- Übersicht. Ganz links „Videos | Bilder“, entweder oder, nie gemischt. Daneben ★, „Name“ und „Eigenschaft“ als Filter, sie wirken zusammen und auch auf Bilder. Videokacheln zeigen die Zahl ihrer Bilder. Der leere Hinweis lautet nur „Noch keine Videos gespeichert.“
- Bilder. Neuer Speicher `images` in IndexedDB, Datenbankversion 2, Index `clipId`. Ein Bild hat `clipId`, Nummer `n`, Grundbild `base` als JPG ohne Zeichnung, die Zeichnung `shapes` getrennt, damit sie später bearbeitbar bleibt, und ein Vorschaubild `thumb`. Bilder gehören zu ihrem Video und werden mit ihm gelöscht.
- Werkzeugleiste in drei Gruppen ohne Linie, also Werkzeuge, dann „Rückgängig“ und „Leeren“, dann „Speichern“. „Speichern“ ist im Video nur aktiv, wenn gezeichnet wurde oder eine Bildfolge zu sehen ist. Bild, Zeichnung und Nummer werden im Moment des Tippens festgehalten.
- Fenster. Kopfzeile in drei Bereichen, links „‹ Übersicht“ und Titel, Mitte „Video | Bilder“, rechts ★, Name, Eigenschaft, „Herunterladen“, „Löschen“. Die Pfeile liegen oben links auf dem Bild. Unter „Video“ blättern sie durch die Videos der Übersicht mit Filter, unter „Bilder“ durch die Bilder dieses Videos. Ein Bild aus der Übersicht öffnet das Fenster direkt unter „Bilder“. Unter „Bilder“ gibt es keine Abspielleiste, kein Schneiden und keine Bildfolge. „Herunterladen“ lädt dort nur das Bild mit Zeichnung, „Löschen“ löscht nur das Bild.
- Dateinamen ohne „LagLab“, mit Eigenschaft, also `2026-10-02-Teo_Kopfsprung_V3.mp4` und `2026-10-02-Teo_Kopfsprung_V3_B1.jpg`. Fehlende Teile entfallen. In der Übersicht steht „V3“ und „V3_B1“, die Meldung im Betrieb lautet „Gespeichert · V3“.
- Die Schleife ist entfallen. „Ansehen“ heißt „Zoom“, „‹ Liste“ heißt „‹ Übersicht“.
- Zweiter großer Nutzertest Stand 8 am 02.10.2026. Ohne Befund: leere Zustände, Zoom, Belichtung und Fokus pro Kamera, Kameraausfall mit Speichern, Zusammenführen von Namen mit doppelten Leerzeichen, Bilder aus geschnittenen Videos, Bildfolge mit Zeichnung, automatisches Speichern, Stern-Filter für Bilder, Löschen von Bildern und Videos, Offline-Speicher mit allen neun Dateien. Behoben: „Wird gespeichert …“ erscheint sofort beim Tippen auf „Speichern“, `playerMsg` mit `keep`. Die Rückfrage beim Löschen lautet jetzt zum Beispiel „3 Videos ohne Stern mit 1 Bild wirklich löschen?“, bei einem einzigen Video ohne „alle“.
- Seit Stand 7 fordert die App als installierte App keinen zusätzlichen Vollbildmodus mehr an, siehe `installedApp`. Vorher zeigte Chrome beim ersten Wechsel zur Analyse und zurück den Hinweis zum Herauswischen aus dem Vollbild.
- Nutzertest Stand 6 am 02.10.2026, behoben: Name und Eigenschaft übernehmen eine vorhandene Schreibweise unabhängig von Groß- und Kleinschreibung. Änderungen an einem gespeicherten Bild werden beim Verlassen automatisch gespeichert, siehe `flushImageEdits`. „Speichern“ bleibt grau, solange sich seit dem letzten Speichern nichts geändert hat, siehe `saveSig`. Bild, Zeichnung und Nummer werden beim Tippen sofort erfasst, wer ein Bild öffnet, wartet auf ein laufendes Speichern. Videonummern eines Tages werden nie wieder vergeben, gemerkt in `settings.lastNr`. Bilder eines Videos stehen aufsteigend. Nach dem Löschen eines Bildes folgt das nächste Bild desselben Videos, ohne weitere Bilder das Video. Die Rückfrage beim Löschen in den Einstellungen nennt auch die Zahl der Bilder.

## Test-App Stand 14, Videoseite direkt aus dem Betrieb

- Die Meldung „Gespeichert · V7“ im Betrieb ist kleiner und dünner, `#toast` mit `400 3.2cqh`.
- Nach dem Speichern bleibt der Speicher-Knopf grau (`#saveBtn.recent`), 5 Sekunden ab dem fertigen Speichern (`RECENT_MS`). Ein Tippen darauf öffnet sofort die Videoseite des eben gespeicherten Videos (`enterReview` in `analysis.js`).
- Auf dieser Videoseite gibt es alle üblichen Funktionen, aber keine Pfeile (`#aPlayer.review .clipNav`). Der Knopf heißt „‹ Wiedergabe“. Er, die Zurück-Geste und das Löschen führen zurück in die verzögerte Wiedergabe (`leaveReview`).
- Dabei bleibt `mode` gleich `run`, nur `reviewing` ist wahr. Die Kamera kodiert weiter in den Puffer. `tick` kürzt dann nur den Puffer und zeigt nichts. Beim Wechsel setzt `restartRunPlayback` den Decoder zurück, der Puffer bleibt, und die Wiedergabe setzt am passenden Keyframe wieder ein.
- Fehler gefunden und behoben: `writeClip` gab das Video ohne `id` zurück. Jetzt setzt es `meta.id`.
- Ergebnis Tablet mit Stand 13: Live-Bild nach Wechseln, Belichtung und Fokus bei USB funktionieren. Mit manueller Belichtung liefert die C920 29,3 B/s. Die Bildqualität der C920 ist sichtbar schlechter als die der Rückkamera.

## Test-App Stand 15

- Speicher-Knopf im Betrieb kleiner, `10.5cqh` statt `13.2cqh`. Zurück-Ring kleiner, 104 px statt 132 px. Die Meldung sitzt passend daneben.
- Name und Eigenschaft im Videofenster 160 px breit statt 112 px, damit etwa „Auerbach“ ganz zu sehen ist. Dafür ist „Herunterladen“ ein Symbol mit Pfeil nach unten (`.tool.icon`). „Video | Bilder“ bleibt genau mittig.

## Test-App Stand 16

- In den Einstellungen heißt es jetzt „Videos ohne Stern löschen nach“ statt „Ohne Stern löschen nach“. Das Fenster ist dafür 510 px breit statt 460 px, damit der Text in eine Zeile passt.

## Test-App Stand 17

- Farbkreise in den Einstellungen: Farbwähler, gleich daneben die eigene Farbe (`accSaved`), danach die vier festen Farben.

## Test-App Stand 18

- Bilder lassen sich im Videofenster jetzt immer speichern, auch ohne Zeichnung und ohne Bildfolge. Gesperrt ist nur dasselbe Bild ein zweites Mal. `updatePlayerUi` ruft dafür `renderSaveBtn` auf.
- „Wird gespeichert …“ erscheint nur, wenn das Speichern länger als 400 ms dauert. „Gespeichert als V4_B4“ steht 1,2 s statt 2,2 s. Großes Bild und Vorschau werden gleichzeitig umgewandelt.

## Test-App Stand 19

- Beim Öffnen der Analyse setzt `enterAnalysis` alle Filter zurück: „Videos“, kein Stern, kein Name, keine Eigenschaft, Liste oben. Innerhalb der Analyse bleiben die Filter erhalten, auch beim Öffnen eines Videos und der Rückkehr zur Übersicht.

## Test-App Stand 20

- Die Sekundenanzeige oben rechts im Betrieb ist kleiner und dünn, `#badge` mit `400 4.5cqh` statt `700 6cqh`.

## Test-App Stand 21

- Fehler vom Tablet: Die Videoseite direkt aus dem Betrieb blieb schwarz. Vermutete Ursache: zu wenige Hardware-Decoder, weil Aufnahme-Encoder und der ruhende Decoder der Wiedergabe belegt sind. In der Vorschau nicht nachstellbar.
- Abhilfe 1: `releaseRunDecoder` schließt beim Öffnen der Videoseite den Decoder der Wiedergabe ganz. `tick` legt beim Zurückkehren einen neuen an.
- Abhilfe 2: Der Decoder des Videofensters weicht auf Software aus (`pSoft`, `hardwareAcceleration: 'prefer-software'`), wenn er einen Fehler meldet oder nach 1,5 s kein Bild liefert. Jedes neu geöffnete Video versucht es zuerst wieder mit der Hardware. In der Vorschau mit nachgestelltem Fehler und nachgestelltem Hängen geprüft.

## Test-App Stand 22, Größe der Bedienung

- Neue Einstellung „03 Größe“ mit „Normal | Groß | Sehr groß“ (`settings.ui.size` 0, 1, 2), „Videos“ ist jetzt „04“. `applyUi` setzt `html[data-size]`, CSS-Variable `--z` ist 1, 1,25 oder 1,5.
- Umsetzung mit CSS `zoom: var(--z)` auf den Bedienteilen: `.bar`, `.filters`, `.delay`, `#panel`, `.dlg`, `#aGrid`, `#aEmpty`, `.pbar`, `.pctl`, `#pRange`, `#pTools`, `.clipNav`, `#pMsg`, `#pStill`, `#camMsg`. `.hud` wächst höchstens auf 1,15. Nicht vergrößert werden Bild- und Zeichenflächen und der Betrieb. Die rechte Spalte der Live-Seite wächst über `grid-template-columns` mit.
- Anpassungen ab „Groß“: Belichtung und Fokus nebeneinander in der rechten Spalte. Im Videofenster rücken Name und Eigenschaft in eine zweite Zeile rechts (`.pR::after` als Zeilenumbruch). Die Werkzeugleiste ist zweispaltig, Rückgängig und Speichern beginnen eine neue Reihe. Bei „Sehr groß“ sind Werkzeuge und Gruppenabstände etwas flacher und das Farbfeld im Farbwähler flacher.
- Für alle Stufen: Start bleibt unten sichtbar (`position: sticky`). Einträge der Infozeile im Kamerabild brechen nicht in sich um. Farbkreise höchstens 64 px. Das Einstellungsfenster rollt notfalls. Beim Schneiden und bei der Bildfolge sind die Werkzeugknöpfe flacher, das behebt auch ein Überlaufen bei „Normal“.
- Geprüft in 1280 × 800 mit einem Skript, das herausragende, abgeschnittene und überlappende Teile meldet: Live mit manueller Belichtung und manuellem Fokus, Einstellungsfenster mit Farbwähler und Löschen, Übersicht mit Videos und Bildern, Videofenster mit Video, Bild, Schneiden, Bildfolge und „‹ Wiedergabe“. Alle drei Stufen ohne Befund. Der Farbwähler trifft auch mit Zoom die richtige Stelle.

## Test-App Stand 23

- Nach dem Tablet-Test reicht 125 %. Die Stufen sind jetzt „Normal“ 100 %, „Groß“ 112,5 %, „Sehr groß“ 125 %. Die Sonderregeln, die nur für 150 % nötig waren, sind entfernt: flachere Werkzeuge, kleinere Gruppenabstände und flacheres Farbfeld. Alles andere aus Stand 22 gilt weiter, also ab „Groß“ zweite Zeile für Name und Eigenschaft, zwei Werkzeugspalten und Belichtung neben Fokus.
- Erneut mit dem Prüfskript in 1280 × 800 geprüft, alle Seiten und alle drei Stufen ohne Befund.

## Test-App Stand 24, Vorschläge für Name und Eigenschaft

- Die `datalist` ist weg, weil Chrome damit schon beim Antippen alle Namen zeigt. Stattdessen eigene Liste `#pSuggest` in `.pbar`, weiß mit dunkler Schrift, rechtsbündig unter dem Feld.
- Sie erscheint erst ab dem ersten Buchstaben. Zuerst Begriffe, die so beginnen, dann Begriffe mit einem Wort, das so beginnt, ohne Unterschied von Groß und Klein, höchstens 8. Jeder weitere Buchstabe schränkt ein. Antippen übernimmt den Begriff und speichert ihn.
- Gemerkt werden alle je eingetragenen Begriffe in `settings.terms.name` und `settings.terms.prop`, auch nach dem Löschen des Videos. Beim Laden der Übersicht kommen die vorhandenen Werte dazu. Die bestehende Regel bleibt: Eine vorhandene Schreibweise wird übernommen, aus „teo“ wird „Teo“.
- Noch offen: Es gibt keinen Weg, einen falsch gemerkten Begriff wieder zu entfernen.

## Test-App Stand 25, Größe als Schieberegler

- Statt „Normal | Groß | Sehr groß“ gibt es unter „03 Größe“ einen Schieberegler `#uiSize` mit vier Rastpunkten, links „klein“, rechts „groß“ im Stil von „Belegter Speicher“. Gestaltet wie alle Regler der App, dazu vier kleine Punkte als Rastmarken (`.sizeTicks`). Die Größe wechselt erst beim Loslassen (`change`), damit der Regler nicht unter dem Finger wächst.
- Stufen 0 bis 3 für 100 %, 116,7 %, 133,3 % und 150 %. `settings.ui.size` behält die Nummer, aus dem früheren 125 % wird damit 133 %.
- `applyUi` setzt `html[data-size]` und ab Stufe 1 die Klasse `big`. Alle Anordnungsregeln ab „Groß“ hängen an `html.big`. Für 150 % gelten zusätzlich flachere Werkzeuge, ein flacheres Farbfeld und knappere Abstände in der rechten Spalte der Live-Seite.
- Mit dem Prüfskript in 1280 × 800 alle Seiten in allen vier Stufen geprüft, ohne Befund.

## Test-App Stand 26

- Logo oben links: „LAG“ und „LAB“ enger zusammen, `.mark b` mit `margin-left: 0.06em` statt `0.35em`. Die Startseite im Hauptordner ist unverändert.

## Test-App Stand 27

- Start sitzt auf der Live-Seite in jeder Größe ganz unten. Ab Stufe 1 hat das Raster der rechten Spalte vier Zeilen, die letzte füllt den Rest, Start steht darin unten (`align-self: end`). Der Innenabstand oben an `.actions` aus Stand 22 ist entfernt.
- Hinweis für Prüfungen in der Vorschau: Die Einblend-Bewegung `rise` der Live-Seite bleibt im gedrosselten Vorschaufenster am Anfang stehen. Das verschiebt die Gruppen um 8 px und täuscht ein Überlaufen vor. Vor dem Messen mit `getAnimations().forEach(a => a.finish())` beenden.

## Test-App Stand 28, Fernseher anpassen

- Grund: Tablet 16:10, Video und Fernseher 16:9. Im Betrieb entstehen dadurch oben und unten Balken auf dem Tablet, die HDMI mitspiegelt. Mit Zoom am Fernseher verschwinden sie, aber der Fernseher schneidet zu viel ab.
- Neuer Abschnitt „05 Fernseher“ im Einstellungsfenster: Umschalter „Normal | Angepasst“ und Knopf „Anpassen …“. „Angepasst“ ohne frühere Einstellung öffnet gleich das Prüfbild.
- Prüfbild `#tvCal`: Rahmen `#tvFrame` mit Gitter, farbigen Eckwinkeln, Kreuz und halbdurchsichtigem Live-Bild. Regler mit „−“ und „+“ für Breite und Höhe (40 bis 100 % des Bildschirms) und für die Lage der Mitte waagerecht und senkrecht (−30 bis +30 %), Schritt 0,5. „Zurücksetzen“ stellt 16:9 über die volle Breite her, „Fertig“ schaltet auf „Angepasst“. Zurück-Geste schließt das Prüfbild.
- Werte in `settings.tv` = `{ on, set, w, h, x, y }`. `applyTv` setzt bei „Angepasst“ `#stage` auf diese Fläche, das Canvas füllt sie mit `object-fit: fill`. Sekundenanzeige und Speicher-Knopf sitzen in `#stage` und rücken mit.
- Damit das Fenster bei den Stufen 2 und 3 nicht rollt, stehen dort „Modus“ und „Größe“ nebeneinander (`.dlgPair`).
- Geprüft in 1280 × 800: Prüfbild, Werte, Fertig, Fläche im Betrieb genau gleich dem Rahmen, Fenster und Prüfbild in allen vier Größen ohne Befund.

## Test-App Stand 29

- Beim Start, nach einem Kamerawechsel (`restartCamera`) und nach einem Abbruch (`cameraLost`) zeigt die Live-Seite 10 s lang „Kamera wird verbunden …“ mit dem Zustand „Verbinde“ (`CONNECT_GRACE_MS`, `startConnecting`). Erst danach erscheint der Grund aus `failText`: keine USB-Kamera, kein erlaubter Zugriff mit Hinweis auf die Android- oder Chrome-Einstellungen, oder „Keine Verbindung zur Kamera. Die App versucht es weiter.“ Die frühere Anzeige „Start“ ohne Kamera entfällt.

## Test-App Stand 30, ganze App im Fernseher-Rahmen

- Wunsch des Nutzers: Bei „Angepasst“ liegt nicht nur der Betrieb, sondern die ganze App im eingestellten Rahmen, rundherum schwarz. Auf dem Fernseher füllt sie dann mit seinem Zoom genau den Bildschirm.
- Umsetzung: `#app` umschließt `#settings`, `#run`, `#analysis` und `#uiDlg`. Startbild und Prüfbild liegen außerhalb und nutzen den ganzen Bildschirm. `#app` hat `contain: layout paint` und ist damit Bezug für alle `position: fixed` darin, dazu `container-type: size` mit dem Namen `app`. Maße, die vorher `vw` und `vh` nutzten, nutzen jetzt `cqw` und `cqh`. `applyTv` setzt bei „Angepasst“ die Klasse `tvfit` und Lage und Größe von `#app`. Dann füllt `#stage` im Betrieb den ganzen Rahmen mit `object-fit: fill`. Der Haltekreis rechnet die Lage der App heraus.
- Für niedrige Rahmen gibt es `@container app (max-height: 760px)`: Belichtung und Fokus nebeneinander, Modus und Größe nebeneinander, knappere Abstände, flacheres Farbfeld, Werkzeuge in zwei Spalten und bei Stufe 2 und 3 in drei. Bei Stufe 3 sind die Beschriftungen der Werkzeuge während Schneiden und Bildfolge ausgeblendet.
- Ab „Groß“ teilen sich Name und Eigenschaft die zweite Zeile der Kopfzeile, auch bei wenig Platz.
- Geprüft in 1280 × 800 mit einem Rahmen 1203 × 676 und ohne Rahmen, alle vier Größen: Live mit Auto und Manuell, Fenster, Farbwähler, Löschen, Übersicht, Videofenster mit Video, Bild, Schneiden und Bildfolge, Betrieb, Haltekreis, Prüfbild. Ohne Befund.

## Test-App Stand 31, Zauberstab, in Stand 34 wieder entfernt

- Stand 31 hatte einen Zauberstab mit MediaPipe Pose Landmarker, der Hüftwinkel und Lot zeigte. Der Nutzer wollte ihn nicht und ließ ihn in Stand 34 vollständig entfernen: `pose.js`, Ordner `mp`, Werkzeug, Zeichnungsart `pose`, Speicher im Service Worker, Dateiarten in `MainActivity` und die Anpassungen der Werkzeugleiste für 13 Werkzeuge. Der Service Worker löscht auf den Geräten zusätzlich den alten Speicher `laglab-mp-…`. Die APK ist wieder etwa 11 MB groß.
- Erkenntnis aus dem Test, falls die Idee wiederkommt: Auf 22 Wettkampffotos fand die Erkennung den Körper in allen Fällen, gedrehte Versuche brachten nichts, mehrere Personen erfordern die Wahl der angetippten Person.

## Test-App Stand 32

- Speicher-Knopf im Betrieb halb so groß, `5.25cqh` mit Innenabstand `0.9cqh`, sichtbarer Kreis etwa 25 px auf dem Tablet. Beim Drücken (`.go`) wächst er mit `scale(4.2)` auf etwa 104 px, die Größe des Kreises beim Verlassen, und schrumpft beim Loslassen. Er sitzt bei `6cqh` von links und unten, damit der große Kreis ganz im Bild bleibt. Eine unsichtbare Fläche `::before` macht die Tippfläche größer. Die Meldung „Gespeichert“ sitzt daneben bei `13cqh`.

## Test-App Stand 33

- Im Einstellungsfenster heißt der Abschnitt jetzt „04 Bildschirm“ und steht unter „03 Größe“, „Videos“ ist „05“. Das Prüfbild heißt „Bildschirm anpassen“.
- Im Prüfbild gibt es „Abbrechen“ zwischen „Zurücksetzen“ und „Fertig“. `openTvCal` merkt sich den Stand beim Öffnen (`tvBefore`). Abbrechen und die Zurück-Geste stellen ihn wieder her, nur Fertig übernimmt (`tvKeep`).

## Test-App Stand 34

- Zauberstab vollständig entfernt, siehe oben.

## Test-App Stand 35, Review aus Anwendersicht

Durchgang mit nachgestellter Kamera durch Start, Live, Einstellungen, Betrieb, Videoseite aus dem Betrieb, Übersicht, Videofenster, Bilder, Herunterladen, Löschen und hellen Modus. Gefunden und behoben:
- „−“ und „+“ der Verzögerung waren bei 1 und 30 aktiv, ohne etwas zu bewirken. Jetzt grau (`renderDelayButtons`).
- Die Zurück-Geste im Farbwähler und in der Rückfrage zum Löschen schloss das ganze Einstellungsfenster. Jetzt führt sie zurück in die Einstellungen.
- Eine sehr helle Akzentfarbe machte im hellen Modus Start, Regler und gewählte Knöpfe unsichtbar, eine sehr dunkle im dunklen Modus ebenso. Das betraf auch die feste hellgraue Farbe. `readableAcc` nutzt dann eine dunklere oder hellere Abstufung, gespeichert bleibt die gewählte Farbe.
- Ein Bild herunterzuladen dauert etwa eine Sekunde ohne Rückmeldung, und Löschen oder Wechseln in dieser Zeit führte zu einem Fehler. Jetzt „Bild wird vorbereitet …“, Name und Bild werden sofort festgehalten, doppeltes Tippen wird ignoriert.
Ohne Befund: Countdown, Speichern zu früh, Zurück-Geste im Betrieb, Videoseite ohne zweites Video, Kameraausfall im Betrieb, Verlassen per Halten, Filter, Stern, Bildschritte, Tempo, Suchen, Schneiden, Bildfolge, Bildmodus, Löschen in zwei Schritten, Schreibweise von Namen, Dateinamen mit Umlauten, Rückfragen beim Löschen mit Zahl der Bilder, heller Modus auf allen Seiten.

## Test-App Stand 36

- „Eigenschaft“ heißt jetzt „Stichwort“, im Feld des Videofensters und im Filter der Übersicht. Intern bleibt der Schlüssel `prop`, gespeicherte Werte bleiben erhalten.

## Neue Version veröffentlichen

1. `APP_VERSION` in `app/app.js` oder `test/app.js` und `VERSION` im zugehörigen `sw.js` erhöhen. Das ist bei jeder Änderung Pflicht, sonst bleibt das Tablet auf der alten Version.
2. Committen, mit der Attribution `Co-Authored-By` aus den Systemhinweisen.
3. Der Nutzer klickt in GitHub Desktop auf „Push origin“.
4. Auf dem Tablet die App einmal öffnen. Die neue Version wird dabei im Hintergrund geladen. Beim nächsten Öffnen ist sie aktiv. Die Versionsnummer steht oben rechts im Einstellungsbildschirm.

## Aktueller Funktionsumfang

- Der Name ist „LagLab“ ohne Leerzeichen, für die Test-App „LagLab Test“. In der App steht oben links in Großbuchstaben LAG LAB mit Leerzeichen, „LAG“ grau und „LAB“ weiß und fett.

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

## Android

Am 02.10.2026 ergab der Test mit einer Logitech C920 am USB-C-Hub, dass Chrome die Webcam nicht sieht. Android 11 auf dem Samsung-Tablet meldet USB-Kameras nicht als normale Kamera. WebUSB sperrt die Geräteklasse Video. Eine Android-App wie „USB Kamera“ aus dem Play Store kann die Webcam dagegen direkt über USB öffnen. Deshalb ist der Plan, LagLab in eine Android-App einzupacken.

Vereinbarter Ablauf: Erst der Machbarkeitstest, dann eine Android-Test-App „LagLab Test“ aus dem Code in `test/`, dann nach Freigabe die normale Android-App „LagLab“ aus `app/`. Beide mit eigener Paketkennung, also nebeneinander installierbar mit getrennten Daten. Die Web-Versionen laufen weiter. Play Store ist für später angedacht.

Machbarkeitstest `android/usbtest`, Paket `de.laglab.usbtest`, Java, Bibliothek `com.herohan:UVCAndroid:1.0.13` von Maven Central mit fertigen nativen Bibliotheken.
- `MainActivity` öffnet die Webcam über `USBMonitor` und `UVCCamera` in einem eigenen `HandlerThread`. Bevorzugt MJPEG 1920x1080 mit 30 B/s. Die Bibliothek startet die Vorschau nur mit einer Fläche, daher liegt unten rechts ein kleines `SurfaceView` als Direktbild.
- Die Bilder kommen als NV12 über `IFrameCallback`, werden in `MediaCodec` zu H.264 kodiert, jedes Schlüsselbild bekommt SPS und PPS vorangestellt.
- Die H.264-Stücke gehen per `addWebMessageListener` als ArrayBuffer an `assets/index.html`, geladen über `WebViewAssetLoader` von `https://appassets.androidplatform.net`. Die Seite dekodiert mit `VideoDecoder` und misst Bildraten und Verzögerung.
- Bauen auf dem PC mit Android Studio, JDK aus `C:\Program Files\Android\Android Studio\jbr`, Gradle 9.0 über den Wrapper, AGP 8.13.2: `JAVA_HOME=... ./gradlew :usbtest:assembleDebug` im Ordner `android`, danach die APK nach `apk/laglab-usbtest.apk` kopieren. Bisher mit dem Debug-Schlüssel signiert.
- In der Vorschau getestet ist nur die Webseite mit nachgestelltem Kamerastrom. Auf dem PC gibt es kein Android-Abbild für den Emulator.
- Ergebnis Fassung 1 am 02.10.2026 auf dem Tablet: Webcam öffnet über USB, MJPEG 1920x1080 kommt als H.264 in der Webseite an, Verzögerung 21 ms. Aber nur 14 B/s schon von der Kamera, Umwandlung 26 ms je Bild. Encoder `OMX.qcom.video.encoder.avc`. Die C920 meldet sich als 046d:08e5 und bietet kein H.264, nur YUV und MJPEG.
- Fassung 2 hat Schalter für 1080p und 720p und für die Belichtungspriorität der Kamera (UVC AE Priority, 0 hält die Bildrate). Dazu eine schnelle Zeilenkopie, wenn der Encoder NV12 erwartet. Ziel ist zu klären, ob Licht oder Rechenleistung die Bildrate begrenzt.
- Ergebnis: Im hellen Licht liefert die C920 etwa 30 B/s in 1080p. Die 14 B/s kamen vom schwachen Licht im Wohnzimmer, nicht von der Rechenleistung. Der Machbarkeitstest gilt damit als bestanden. Nächster Schritt ist die Android-Test-App.

### Android-App LagLab

Modul `android/laglab`, Paket `de.laglab`, zwei Varianten. Die Namen dürfen nicht mit „test“ beginnen, daher `labtest` und `normal`.
- `labtest`: Paket `de.laglab.test`, Name „LagLab Test“, Symbol und Farbe orange, Web-Dateien direkt aus `test/` als Assets. Bauen mit `./gradlew :laglab:assembleLabtestRelease`, dann `laglab/build/outputs/apk/labtest/release/laglab-labtest-release.apk` nach `apk/laglab-test.apk` kopieren.
- `normal`: Paket `de.laglab.app`, Name „LagLab“, blaugrau, Web-Dateien aus `app/`. Wird erst nach einer Übernahme gebaut, nach `apk/laglab.apk`.
- Versionsnummer liest Gradle aus `APP_VERSION` der jeweiligen `app.js`. In der Android-App zeigt die Web-App „Stand 12 · Android“.
- Schlüssel: `C:\Users\Hilde\LagLab-Schluessel\laglab-release.jks`, Alias `laglab`, Passwort in `LIESMICH.txt` daneben und in `~/.gradle/gradle.properties` (`LAGLAB_KEYSTORE` und so fort). Liegt bewusst nicht im Repository. Der Nutzer soll den Ordner sichern.
- `MainActivity`: WebView lädt `https://appassets.androidplatform.net/app/index.html` über `WebViewAssetLoader`. Vollbild ohne Systemleisten, Bildschirm bleibt an, Querformat. Kamera-Berechtigung beim Start, `onPermissionRequest` gibt getUserMedia frei. Zurück-Geste geht in der WebView zurück. Brücke `laglab` per `addWebMessageListener`.
- `UsbCam`: wie im Machbarkeitstest, aber nur auf Anforderung der Web-App. Belichtungspriorität fest 0, also 30 B/s auch bei wenig Licht. 12 Mbit/s, weil die Web-App noch einmal kodiert. Eine 2x2-Pixel-SurfaceView hinter der WebView ist die Pflichtfläche der Bibliothek. Im Hintergrund ruht die Kamera und meldet „lost“.
- Manifest mit `USB_DEVICE_ATTACHED` und Filter für Klasse 14. Android bietet beim Anstecken an, LagLab Test zu öffnen. Mit „Immer“ entfällt die Freigabe-Frage.
- `test/native.js`: Ist `window.laglab` vorhanden, gilt `NATIVE`. `native.usbStream()` dekodiert die H.264-Stücke mit `VideoDecoder` und gibt sie über `MediaStreamTrackGenerator` als normale Kameraspur an die App. Ohne Zoom, Belichtung und Fokus. Zustände der App: none, denied, error, lost. `native.save(file)` schickt die Datei in 1-MB-Stücken, Android legt sie per MediaStore in Download ab. Kein Service Worker in der Android-App, `installedApp()` gilt als wahr.
- Stand 13 nach dem ersten Tablet-Test: Die WebView zeigte nach Kamerawechsel und Rückkehr aus der Analyse ihr graues Wiedergabe-Symbol statt des Live-Bildes. Abhilfe ist `showLive()` mit ausdrücklichem `video.play()` und ein leeres `poster`. Die USB-Spur meldet jetzt Belichtung, ISO und Fokus. `native.js` übersetzt sie in UVC-Befehle (`t: 'ctl'`). Belichtungszeit in 100 µs wie bei Chrome, höchstens 330, Verstärkung erscheint als ISO 100 bis 800, Fokus als ungefähre Entfernung 0,1 bis 3 m, wobei bei der Webcam ein großer Wert nah bedeutet. Die Bereiche schickt `UsbCam` beim Start als `t: 'caps'`.
- In der Vorschau mit nachgestellter Brücke getestet: USB-Bild mit 30 B/s, Betrieb, Puffer, Abziehen und Wiederanstecken im Betrieb, Speichern und Herunterladen. Die echte Hülle ist nur auf dem Tablet prüfbar.

## Wichtige Erkenntnisse

- Chrome bietet auf dem Tablet höchstens 30 Bilder pro Sekunde an. 60 sind nicht möglich.
- Bei schwachem Licht senkt die Automatik die Bildrate. Im Wohnzimmer wurden nur 16,6 Bilder pro Sekunde gemessen. Eine kurze manuelle Belichtung hält 30.
- Hardware-Kodierung läuft stabil. Im Lasttest gingen keine Bilder verloren, und 30 Sekunden Puffer brauchen bei 1080p nur etwa 25 MB.
- Das Tablet hat 16:10, der Fernseher 16:9. Die Ränder lassen sich eventuell über eine Zoom-Einstellung am Fernseher (BSL-22112V) entfernen.
- Die Vorschau im Claude-Desktop hat keinen Kamerazugriff. Zum Testen wird per JavaScript eine künstliche Kamera eingespeist, ein Canvas mit `captureStream`, das `navigator.mediaDevices.getUserMedia` ersetzt. Vor jedem Test Service Worker und Caches löschen, sonst lädt die Vorschau eine alte Version. Werkzeugaufrufe mit langen `await` blockieren `requestAnimationFrame`, deshalb die Wiedergabe in getrennten Aufrufen prüfen.
- Test am 30.09.2026 mit Version 14. Bild, Zoom und Fokusregler funktionieren, die Richtung des Fokusreglers stimmt. Im Automatikmodus meldet Chrome über `getSettings()` nur die zuletzt manuell gesetzten Werte für Belichtung und Fokus. Seit Version 15 steht bei Automatik deshalb nur „Auto“ ohne Zahlen.
- Am 29.09.2026 gelöster Update-Fehler: Der Service Worker speichert Dateien mit `cache: 'reload'`, sonst landen alte Dateien aus dem Browser-Zwischenspeicher im Offline-Speicher.

## Offen und als Nächstes
- Entschieden am 02.10.2026: Es bleibt bei 30 B/s. Die C920 kann höchstens 30, Chrome bietet für die Rückkamera höchstens 30. Mehr wäre nur über eine eigene Camera2-Anbindung der Rückkamera in der Android-App denkbar, ob das Tablet 60 kann, ist ungeprüft. Der Nutzer will das nicht verfolgen.

- Test-App Stand 2 muss noch hochgeladen werden. Beide Apps auf dem Tablet prüfen. Wichtig ist, ob das Speichern im Betrieb das laufende Bild stört und ob Herunterladen auf Android funktioniert.
- Android-Test-App „LagLab Test“ Stand 12 auf dem Tablet testen, vor allem USB-Kamera, eingebaute Kameras, Herunterladen, Zurück-Geste und Vollbild.
- Früherer Stand vom 01.10.2026 zur externen Kamera: Besprochene Wege waren eine USB-Kamera, die auf Android 11 bei Samsung oft nicht erkannt wird und einen USB-C-Hub neben dem HDMI-Adapter bräuchte, ein zweites Handy als Funkkamera über WebRTC mit Kopplung per QR-Code, und eine allgemeine Kamerawahl über alle von `enumerateDevices` gemeldeten Kameras als ersten Schritt.
- `navigator.storage.persist()` steht in `analysis.js` und gilt seit v1 für beide Apps.
- Test in der Halle: Werden 30 Bilder pro Sekunde erreicht? Welche Belichtung passt? Gibt es Streifen durch das Hallenlicht?
- Prüfen, ob die Vorschau im Einstellungsbildschirm auf dem Tablet flüssig läuft. Der Nutzer hatte ein Hängen gemeldet. Das betraf wahrscheinlich die Vorschau im Claude-Desktop. Die möglichen Ursachen auf dem Tablet wurden in Version 12 behoben.
- Test über 3 Stunden, mit Blick auf Wärme und Stabilität. Falls das Tablet überhitzt, wieder 720p als Rückfall einbauen.
- Die Checkliste für das Tablet aus `PLAN.md` an den Nutzer übergeben. Sie betrifft „Nicht stören“, die Akkuoptimierung, die Helligkeit, das Ladekabel und die Wärme.
- Alte Symbole wie „Cam Delay“, „Turm Delay“, „Cam Time“, „Lag Time“, „LagCam“ oder „LagTime“ auf dem Tablet entfernen und die App neu als „LagLab“ installieren.
