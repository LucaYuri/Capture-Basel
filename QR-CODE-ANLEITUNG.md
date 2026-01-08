# QR-Code für mobile Upload-Seite

## Zugriff auf die Upload-Seite

Die mobile Upload-Seite ist unter folgender URL erreichbar:

```
http://localhost:3000/upload.html
```

Für die Ausstellung müssen Sie die lokale URL durch Ihre öffentliche URL ersetzen (siehe unten).

## QR-Code generieren

### Option 1: Online QR-Code Generator

1. Besuchen Sie einen QR-Code Generator wie:
   - https://www.qr-code-generator.com/
   - https://www.qrcode-monkey.com/
   - https://goqr.me/

2. Geben Sie Ihre URL ein (z.B. `http://your-server-ip:3000/upload.html`)

3. Passen Sie Design und Grösse nach Bedarf an

4. Laden Sie den QR-Code als PNG oder SVG herunter

### Option 2: Mit Node.js generieren

Installieren Sie das `qrcode` Paket:

```bash
npm install qrcode
```

Erstellen Sie eine Datei `generate-qr.js`:

```javascript
import QRCode from 'qrcode';

const url = 'http://your-server-ip:3000/upload.html';

// Als PNG speichern
QRCode.toFile('upload-qr.png', url, {
  width: 500,
  margin: 2,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
}, (err) => {
  if (err) throw err;
  console.log('QR-Code wurde erstellt: upload-qr.png');
});

// Als SVG speichern
QRCode.toString(url, { type: 'svg' }, (err, svg) => {
  if (err) throw err;
  require('fs').writeFileSync('upload-qr.svg', svg);
  console.log('QR-Code wurde erstellt: upload-qr.svg');
});
```

Führen Sie aus:

```bash
node generate-qr.js
```

## Server für die Ausstellung zugänglich machen

### Wichtig: Ihre aktuelle Konfiguration läuft nur lokal!

Für eine Ausstellung gibt es mehrere Optionen:

### Option 1: Lokales Netzwerk (einfachste Lösung)

1. Finden Sie die IP-Adresse Ihres Computers im lokalen Netzwerk:

   **Mac/Linux:**
   ```bash
   ifconfig | grep "inet "
   ```

   **Windows:**
   ```bash
   ipconfig
   ```

2. Stellen Sie sicher, dass Besucher-Smartphones im gleichen WLAN sind

3. Verwenden Sie die IP in der URL: `http://192.168.1.xxx:3000/upload.html`

4. Generieren Sie einen QR-Code mit dieser URL

**Vorteile:** Einfach, keine externe Konfiguration nötig
**Nachteile:** Alle müssen im gleichen WLAN sein

### Option 2: ngrok (für temporäre öffentliche URL)

1. Installieren Sie ngrok: https://ngrok.com/download

2. Starten Sie Ihren Server:
   ```bash
   npm start
   ```

3. In einem neuen Terminal:
   ```bash
   ngrok http 3000
   ```

4. ngrok gibt Ihnen eine öffentliche URL wie: `https://abcd1234.ngrok.io`

5. Verwenden Sie: `https://abcd1234.ngrok.io/upload.html`

**Vorteile:** Funktioniert überall mit Internet
**Nachteile:** Kostenlose Version hat Limits, URL ändert sich bei jedem Neustart

### Option 3: Dedicated Server / VPS (für professionelle Lösung)

Deployen Sie auf einem Server wie:
- Railway.app
- Render.com
- DigitalOcean
- AWS / Google Cloud

## Empfohlene Schritte für die Ausstellung

1. **Testen Sie zuerst lokal:**
   - Server starten: `npm start`
   - Öffnen Sie am Smartphone: `http://your-local-ip:3000/upload.html`
   - Testen Sie den Upload

2. **Entscheiden Sie sich für eine der Optionen oben**

3. **Generieren Sie den QR-Code mit der finalen URL**

4. **Drucken oder zeigen Sie den QR-Code an:**
   - Als Poster ausdrucken (mindestens A5)
   - Auf einem Tablet/Display anzeigen
   - Mit Anleitung: "Scannen Sie den QR-Code, um ein Bild hochzuladen"

## Sicherheitshinweise

- Die Upload-Seite hat keine Authentifizierung
- Jeder mit dem QR-Code kann Bilder hochladen
- Setzen Sie eventuell Rate-Limiting für die API ein
- Überwachen Sie den Speicherplatz für hochgeladene Bilder

## Troubleshooting

**Problem:** QR-Code führt zu "Seite nicht gefunden"
- Prüfen Sie, ob der Server läuft
- Prüfen Sie die URL im QR-Code
- Testen Sie die URL manuell im Browser

**Problem:** Upload funktioniert nicht
- Prüfen Sie die Browser-Konsole (F12)
- Prüfen Sie die Server-Logs
- Stellen Sie sicher, dass CORS aktiviert ist (bereits in server.js konfiguriert)

**Problem:** Bilder erscheinen nicht auf der Hauptansicht
- Die Upload-Seite verwendet den gleichen `/api/generate` Endpoint
- Generierte Bilder sollten automatisch im Grid erscheinen
- Aktualisieren Sie die Hauptseite falls nötig
