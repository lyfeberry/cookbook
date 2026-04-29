# cookbook

PWA starter for a cookbook web app.

## Files created
- `index.html` — app shell
- `styles.css` — basic UI styles
- `app.js` — install prompt + connectivity + SW registration
- `sw.js` — offline cache service worker
- `manifest.webmanifest` — PWA manifest
- `icons/icon.svg` — app icon

## Run locally
You need a local web server (service workers do not run from `file://`).

```bash
python -m http.server 8080
```

Then open: `http://localhost:8080`

## Later convert to Android APK
A common path is Capacitor:

```bash
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init cookbook com.example.cookbook
npx cap add android
npx cap copy
npx cap open android
```

From Android Studio, build signed APK/AAB.
