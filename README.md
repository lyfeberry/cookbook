# Cooking Journal PWA

Offline-first personal cooking journal web app built with vanilla HTML/CSS/JS and IndexedDB.

## Features
- 4-tab navigation: Home, Add Meal, Shopping, Settings
- Home: random meal cards, sort/search/filter, meal detail modal
- Add Meal: photo + name, simple/module ingredients, rating heatmap slider, note
- Shopping list: grouped day/meal, meal planning from history, manual add, check-off, clear list
- Settings: ingredient library management, export/import JSON, about section
- PWA: installable manifest + service worker cache for offline usage

## Local run
```bash
python -m http.server 8080
```
Open `http://localhost:8080`

## Android APK later (Capacitor)
```bash
npm init -y
npm install @capacitor/core @capacitor/cli
npx cap init cooking-journal com.example.cookingjournal
npx cap add android
npx cap copy
npx cap open android
```
Build signed APK/AAB from Android Studio.
