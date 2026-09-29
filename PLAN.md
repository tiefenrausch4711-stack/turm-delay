# Cam Delay, verzögerte Videowiedergabe für Turmspringen

Diese Datei fasst die gesamte Planung zusammen. Alle hier aufgeführten Entscheidungen sind mit dem Nutzer abgestimmt. Offene Punkte stehen gesondert am Ende.

## Kommunikation mit dem Nutzer

Antworte auf Deutsch, sachlich, direkt und präzise. Keine Floskeln, kein unnötiges Lob, keine Emojis. Erfinde keine Fakten und frage nach, wenn etwas unklar ist. Kurze, vollständige Sätze. Keine Gedankenstriche, Doppelpunkte oder Semikolons zur Gliederung innerhalb von Sätzen. Aufzählungen nur, wenn der Inhalt sie erfordert. Der Nutzer programmiert nicht selbst. Claude schreibt den gesamten Code, der Nutzer testet auf dem Tablet.

## Ziel

Eine Anwendung, die das Kamerabild eines Tablets mit einstellbarer Verzögerung wiedergibt. Einsatz im Training für Turmspringen. Der Springer taucht auf, steigt aus dem Becken und sieht seinen Sprung verzögert auf einem Fernseher.

## Zielgerät und Umgebung

- Samsung Galaxy Tab Active Pro, Modell SM-T545
- Android 11, One UI 3.1, Browser Chrome
- 4 GB Arbeitsspeicher laut Herstellerangaben
- Rück- und Frontkamera
- Ausgabe per Bildschirmspiegelung über USB-C auf HDMI an einen Fernseher. Der Adapter lädt das Tablet gleichzeitig.
- Einsatz in einer Schwimmhalle mit Wassertropfen und nassen Fingern auf dem Display
- Laufzeit am Stück etwa 3 Stunden
- Das Tablet wird nach dem Start nicht mehr bedient
- Kein Ton

## Plattform und Verteilung

- Progressive Web App in reinem HTML, CSS und JavaScript ohne Build-Werkzeuge und ohne externe Abhängigkeiten
- Hosting über GitHub Pages, da Chrome den Kamerazugriff nur über HTTPS oder localhost erlaubt. Der Nutzer hat ein GitHub-Konto.
- Einmalige Installation mit Internet über „Zum Startbildschirm hinzufügen“, danach vollständiger Offline-Betrieb
- Service Worker cacht alle Dateien und umgeht dabei den Browser-Zwischenspeicher. Eine neue Version wird im Hintergrund geladen, während die App läuft, und beim nächsten Start ohne Wartezeit übernommen. Während des Betriebs wird nie neu geladen. Ohne Internet startet die App ohne Wartezeit mit der gespeicherten Version.
- Web App Manifest mit `display: fullscreen` und `orientation: landscape`. Damit startet die App im Vollbild und im Querformat ohne Benutzergeste.

## Funktionen

### Einstellungsbildschirm

- Live-Vorschau der gewählten Kamera
- Kamerawahl Rückkamera oder Frontkamera
- Keine Spiegelung. Das Bild wird immer so gezeigt, wie die Kamera filmt.
- Zoomregler mit Live-Vorschau, gespeichert pro Kamera. Standard ist 1.
- Belichtung Auto oder Manuell, gespeichert pro Kamera. Bei Manuell ein Helligkeitsregler von stockdunkel bis weiß. Er verteilt die Helligkeit auf Belichtungszeit und ISO, wobei die Zeit möglichst kurz bleibt. Die aktuelle Belichtung steht unten in der Vorschau.
- Verzögerung von 1 bis 30 Sekunden in Sekundenschritten, als Schieberegler plus Tasten für plus und minus
- Auflösung fest 1080p, passend zum Fernseher. Falls das Tablet über 3 Stunden überhitzt, wird 720p als Rückfall nachgerüstet. Die Bildrate ist fest 30, weil Chrome auf dem Tablet höchstens 30 anbietet und 25 keinen sichtbaren Vorteil bringt. Streifen durch Hallenlicht werden über die Belichtungszeit 1/100 vermieden.
- Die App berechnet für die gewählte Kombination die maximal mögliche Verzögerung und begrenzt den Regler entsprechend
- Anzeige der tatsächlich gelieferten Auflösung und gemessenen Bildrate unter der Vorschau
- Startknopf

### Voreinstellungen beim allerersten Start

Rückkamera, 1080p, 30 Bilder pro Sekunde, 20 Sekunden Verzögerung, Zoom 1, Belichtung automatisch.

### Darstellung auf dem Fernseher

Das Tablet hat 16:10, der Fernseher 16:9. Die App zeigt das 16:9-Kamerabild über die volle Breite mit schmalen Streifen oben und unten. Die Anzeige mit den Sekunden liegt innerhalb des 16:9-Bereichs. Mit der Zoom-Einstellung des Fernsehers lässt sich das Bild dann randlos und ohne Verzerrung darstellen.

### Start und Speicherung

- Alle Einstellungen werden lokal gespeichert
- Beim Öffnen der App startet der Betrieb direkt mit den zuletzt verwendeten Einstellungen

### Betrieb

- Vollbild mit dem verzögerten Kamerabild, keine Bedienelemente
- Bildschirm bleibt wach über die Wake Lock API. Die Sperre wird nach `visibilitychange` neu angefordert.
- Oben rechts eine kleine Anzeige wie „20 s“, weiße Schrift auf halbtransparentem dunklem Hintergrund, auf einem Fernseher vom Beckenrand lesbar
- Beim Start zeigt dieselbe Anzeige in Weiß einen Countdown, bis der Puffer gefüllt ist. Danach steht dort die Verzögerung.
- Farbcodes der Anzeige
  - Weiß bedeutet Normalbetrieb
  - Gelb bedeutet Überlast, also verlorene Bilder oder ein Encoder oder Decoder, der nicht hinterherkommt
  - Rot bedeutet, dass die Kamera ausgefallen ist und neu verbunden wird
- Zurück zu den Einstellungen durch langes Drücken von 3 Sekunden an beliebiger Stelle. Während des Drückens füllt sich ein kleiner Kreis. Loslassen vor Ablauf bricht ab. Kurzes Tippen und Doppeltippen lösen nichts aus, damit Wassertropfen keine Aktion auslösen.
- Beim Wechsel in die Einstellungen läuft die Kamera weiter. Nach erneutem Start wird der Puffer neu gefüllt.

### Fehlerbehandlung

- Die App erkennt, wenn länger als etwa 2 Sekunden keine neuen Bilder kommen, oder wenn der Kamera-Track endet
- Dann versucht sie alle paar Sekunden, die Kamera neu zu verbinden. Die Anzeige ist währenddessen rot.
- Nach erfolgreicher Verbindung füllt sich der Puffer neu, Countdown in Weiß, danach Normalbetrieb
- Der Betrieb läuft ohne Eingriff des Nutzers weiter

## Technischer Ansatz

### Bevorzugter Weg mit WebCodecs

- Kamerazugriff über `getUserMedia` mit Constraints für Kamera, Auflösung, Bildrate und Zoom
- Bilder abgreifen über `MediaStreamTrackProcessor`, falls verfügbar, sonst über `requestVideoFrameCallback` und Canvas
- Kodieren mit `VideoEncoder` in H.264, möglichst mit Hardwarebeschleunigung
- Regelmäßige Keyframes, etwa jede Sekunde, damit der Puffer an Keyframe-Grenzen gekürzt werden kann und die Wiedergabe schnell einsteigen kann
- Ringpuffer aus `EncodedVideoChunk` mit Zeitstempeln. Alte Daten werden immer ab einem Keyframe verworfen.
- Wiedergabe über `VideoDecoder` auf ein Canvas. Angezeigt wird jeweils das Bild, dessen Aufnahmezeit der aktuellen Zeit minus Verzögerung entspricht.
- Speicherbedarf grob Bitrate mal Verzögerung. Bei 1080p30 mit 6 Mbit/s und 30 Sekunden etwa 25 MB.

### Kein Rückfallweg mit JPEG

WebCodecs läuft laut Testseite mit Hardwarebeschleunigung. Der JPEG-Rückfallweg entfällt.

### Zoom

- Über `track.applyConstraints` mit `zoom`, falls `getCapabilities()` den Zoom meldet
- Sonst digitaler Ausschnitt beim Zeichnen auf das Canvas

### Belichtung und Fokus

- Fokus Auto oder Manuell, gespeichert pro Kamera. Bei Manuell ein Regler von nah bis fern, linear über den gemeldeten Bereich von `focusDistance`. Der Wert steht unten in der Vorschau. Ein fester Fokus vermeidet Pumpen beim Eintauchen. Ob der gemeldete Bereich von 0,1 bis 3,1 wirklich Meter sind, ist auf dem Tablet zu prüfen.

- Standard automatisch. Manuelle Belichtungszeit und ISO über `applyConstraints`, da beide Kameras `exposureMode manual`, `exposureTime` und `iso` melden. `exposureTime` ist in Einheiten von 100 Mikrosekunden angegeben.
- Bei wenig Licht senkt die Automatik die Bildrate. Eine kurze manuelle Belichtung hält 30 Bilder pro Sekunde und verringert die Bewegungsunschärfe.

### Überlasterkennung

- Verworfene Bilder zählen
- Warteschlangen von Encoder und Decoder beobachten (`encodeQueueSize`, `decodeQueueSize`)
- Verzögerung der tatsächlichen Anzeige gegenüber dem Soll messen

## Vorgehen

### Schritt 1 Testseite

Eine einzelne Seite, die über GitHub Pages auf dem Tablet geöffnet wird und folgende Punkte prüft und als gut lesbare Liste anzeigt.

- Sicherer Kontext vorhanden
- Kamerazugriff auf Rück- und Frontkamera
- Unterstützte Auflösungen und Bildraten je Kamera, insbesondere 720p60 und 1080p60, mit tatsächlich gemessener Bildrate
- Zoom verfügbar, mit Bereich
- Belichtungs- und Fokusoptionen aus `getCapabilities()`
- WebCodecs verfügbar, `VideoEncoder.isConfigSupported` und `VideoDecoder.isConfigSupported` für H.264 in 720p und 1080p bei 30 und 60 Bildern pro Sekunde, möglichst mit `hardwareAcceleration: prefer-hardware`
- `MediaStreamTrackProcessor` verfügbar
- Wake Lock API verfügbar
- Kurzer Lasttest, der 10 Sekunden kodiert und dekodiert und die erreichte Bildrate misst

Der Nutzer schickt ein Foto oder Bildschirmfoto der Ergebnisse.

### Schritt 2 Eigentliche App

Aufbau anhand der Testergebnisse. Funktionen, die das Tablet nicht unterstützt, werden über die Rückfallwege gelöst oder aus der Oberfläche entfernt.

## Veröffentlichung über GitHub Pages

1. Neues öffentliches Repository anlegen
2. Dateien über die Weboberfläche hochladen
3. In den Repository-Einstellungen unter Pages die Veröffentlichung aus dem Hauptzweig einschalten
4. Nach ein bis zwei Minuten ist die Seite unter `https://<benutzername>.github.io/<repository>/` erreichbar
5. Auf dem Tablet in Chrome öffnen, Kamerazugriff erlauben und über das Menü „Zum Startbildschirm hinzufügen“ wählen

## Testergebnisse vom 29.09.2026

Gemessen zuhause bei schwachem Licht, Chrome 154.0.8037.57, Bildschirm 1920 x 1200.

- WebCodecs H.264 mit Hardwarebeschleunigung für Kodieren und Dekodieren in allen Kombinationen verfügbar
- Lasttest ohne verworfene Bilder, Latenz im Schnitt 30 bis 60 ms, Datenrate 3 bis 5 Mbit/s
- Beide Kameras melden höchstens 30 Bilder pro Sekunde
- Gemessen wurden nur 16,6 Bilder pro Sekunde bei der Rückkamera und 8,3 bei der Frontkamera, vermutlich wegen des schwachen Lichts
- Zoom 1 bis 8 bei beiden Kameras, funktioniert
- Manuelle Belichtungszeit funktioniert bei beiden Kameras
- Frontkamera hat nur manuellen Fokus
- MediaStreamTrackProcessor, Wake Lock und Service Worker verfügbar

## Checkliste für das Tablet

Diese Checkliste soll mit der fertigen App an den Nutzer gehen.

- Modus „Nicht stören“ während des Trainings einschalten
- Chrome in den Akkueinstellungen von der Optimierung ausnehmen, damit Samsung die App nicht drosselt
- Helligkeit des Tablets senken, um Wärme zu reduzieren. Im Test prüfen, ob das Bild auf dem Fernseher davon unberührt bleibt.
- Adapter mit Ladefunktion verwenden
- Tablet nicht in direkte Sonne oder neben Wärmequellen stellen

## Offene Punkte und Testfragen

- Ob in der Halle 30 Bilder pro Sekunde erreicht werden
- Welche Belichtungszeit und ISO in der Halle ein gutes Bild ergeben
- Ob der Fernseher eine Zoom-Einstellung hat, die die Ränder entfernt
- Ob WebCodecs über 3 Stunden stabil läuft
- Ob die Hallenbeleuchtung bei bestimmten Bildraten Flackern oder Streifen erzeugt
- Wie sich das Tablet thermisch über 3 Stunden verhält
- Ob die Helligkeit des Tablets die HDMI-Ausgabe beeinflusst
