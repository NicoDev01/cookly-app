# Cookly Release Workflow

Dieser Guide erklärt, wie du Updates für deine Cookly App erstellst und veröffentlichst.

---

## 🚀 Schnellstart

```bash
# Bugfix (1.0.0 → 1.0.1)
npm run release:patch

# Neues Feature (1.0.0 → 1.1.0)
npm run release:minor

# Breaking Change (1.0.0 → 2.0.0)
npm run release:major
```

**Das Skript macht automatisch:**
1. ✅ Version in `android/app/build.gradle` erhöhen
2. ✅ CHANGELOG.md mit neuem Eintrag aktualisieren
3. ✅ Frontend builden
4. ✅ Capacitor syncen
5. ✅ Release AAB erstellen

**Danach musst du nur:**
1. CHANGELOG.md ausfüllen
2. App testen
3. In Google Play Console hochladen

---

## 📋 Vollständiger Release-Prozess

### Schritt 1: Code ändern

Mache deine Änderungen am Code:
- Bugfixes
- Neue Features
- Design-Anpassungen

Teste lokal mit `npm run dev`

---

### Schritt 2: Release erstellen

```bash
# wähle den passenden Befehl:
npm run release:patch  # für Bugfixes
npm run release:minor  # für neue Features
npm run release:major  # für Breaking Changes
```

**Beispiel-Output:**
```
╔════════════════════════════════════════════════╗
║   Cookly Auto-Version & Build Script          ║
╚════════════════════════════════════════════════╝

Version Type: PATCH

📦 Updating build.gradle...
   versionCode: 1 → 2
   versionName: 1.0.0 → 1.0.1

📝 Updating CHANGELOG.md...
   ✅ Added version 1.0.1 to CHANGELOG.md
   ⚠️  Remember to fill in the details!

🔨 Building app...
   → npm run build
   → npx cap sync android
   → cd android && ./gradlew bundleRelease
   ✅ Build successful!

╔════════════════════════════════════════════════╗
║   ✅ SUCCESS!                                   ║
╚════════════════════════════════════════════════╝

📦 New Version:
   versionCode: 2
   versionName: 1.0.1

📝 Next Steps:
   1. Edit CHANGELOG.md to add release notes
   2. Test the app locally
   3. Upload to Google Play Console:
      android/app/build/outputs/bundle/release/app-release.aab
```

---

### Schritt 3: CHANGELOG ausfüllen

Öffne `CHANGELOG.md` und fülle die TODOs aus:

```markdown
## [1.0.1] - 26.01.2026

### 🔧 Bugfixes
- ✅ ~~TODO: Beschreibe die Bugfixes~~
- Crash beim Scrollen in der Rezept-Liste behoben
- Performance-Problem beim Laden von Kategorien behoben

### ✨ Neue Features
- ✅ ~~TODO: Beschreibe die neuen Features~~
- Keine neuen Features in diesem Release

### 🚀 Verbesserungen
- ✅ ~~TODO: Beschreibe die Verbesserungen~~
- Ladezeit der Rezept-Liste um 50% verbessert
```

---

### Schritt 4: App testen

```bash
# Auf Android Gerät installieren
npm run cap:run

# Oder APK manuell installieren
cd android
.\gradlew assembleDebug
adb install app\build\outputs\apk\debug\app-debug.apk
```

**Wichtige Tests:**
- [ ] Login funktioniert (Clerk)
- [ ] Rezept speichern
- [ ] URL-Import funktioniert
- [ ] Foto-Scan funktioniert
- [ ] Wochenplaner
- [ ] Einkaufsliste
- [ ] Stripe Checkout

---

### Schritt 5: In Google Play Console hochladen

**⚠️ DIESER SCHRITT IST MANUELL - KEINE AUTOMATISIERUNG MÖGLICH**

Warum? Google Play hat **keine öffentliche API** für Releases (außer über komplexe OAuth + Service Accounts Setup).

**Schritte:**

1. Öffne [Google Play Console](https://play.google.com/console)
2. Wähle deine App: **Cookly**
3. Gehe zu: **Produktion** (oder *Geschlossener Test*)
4. Klicke: **Neuen Release erstellen**

5. **Release-Details:**
   ```
   Versionsname: 1.0.1
   ```

6. **Versionshinweise:**
   Kopiere den Inhalt aus CHANGELOG.md:

   ```markdown
   ### 🔧 Bugfixes
   - Crash beim Scrollen in der Rezept-Liste behoben
   - Performance-Problem beim Laden von Kategorien behoben

   ### 🚀 Verbesserungen
   - Ladezeit der Rezept-Liste um 50% verbessert
   ```

7. **App-Bundles:**
   - Klicke "App bundle erstellen"
   - Wähle: `android/app/build/outputs/bundle/release/app-release.aab`
   - Warte bis Upload fertig ist

8. **Vorschau** → **Bestätigen**

9. **Rollout:**
   - Internes Testing: Sofort verfügbar
   - Geschlossener Test: Tester bekommen Benachrichtigung
   - Produktion: Stufenweiser Rollout (1% → 5% → 50% → 100%)

---

## 🎯 Versionierungs-Strategie

| Typ | Befehl | Beispiel | Wann verwenden? |
|-----|--------|----------|-----------------|
| **PATCH** | `npm run release:patch` | 1.0.0 → 1.0.1 | Bugfixes, kleine Verbesserungen |
| **MINOR** | `npm run release:minor` | 1.0.0 → 1.1.0 | Neue Features (backward compatible) |
| **MAJOR** | `npm run release:major` | 1.0.0 → 2.0.0 | Breaking Changes, großes Redesign |

**Beispiele:**

```
1.0.0 → 1.0.1 (patch)  - Bugfix: Crash behoben
1.0.1 → 1.1.0 (minor)  - Feature: Rezept-Sharing hinzugefügt
1.1.0 → 2.0.0 (major)  - Breaking: Alte Rezept-Datenstruktur geändert
```

---

## 📁 Dateien die das Skript verändert

| Datei | Änderung |
|-------|----------|
| `android/app/build.gradle` | `versionCode` +1, `versionName` neu |
| `CHANGELOG.md` | Neuer Versionseintrag hinzugefügt |
| `dist/` | Frontend gebuildet |
| `android/app/src/main/assets/` | Web-Assets kopiert |
| `android/app/build/outputs/bundle/release/` | Neue AAB erstellt |

---

## ⚠️ Häufige Fehler & Lösungen

### Fehler: "versionCode nicht erhöht"

**Problem:** Du hast vergessen, das Skript auszuführen

**Lösung:**
```bash
npm run release:patch
```

---

### Fehler: "Keystore Passwort falsch"

**Problem:** `android/gradle.properties` hat falsches Passwort

**Lösung:**
```properties
KEYSTORE_PASSWORD=dein-richtiges-passwort
KEYSTORE_ALIAS=cookly-release
```

---

### Fehler: "Google Play lehnt ab"

**Mögliche Gründe:**
1. `versionCode` zu niedrig (nicht erhöht)
2. Signaturen unterschiedlich (falscher Keystore)
3. Berechtigungen nicht deklariert

**Lösung:**
- Immer das Skript verwenden!
- Keystore sicher aufbewahren!
- In Console: "Richtlinien" → "Berechtigungen" ausfüllen

---

## 🔐 Sicherheitshinweise

### NIE committen:

```gitignore
# Bereits in .gitignore:
*.keystore
android/gradle.properties
.env.local
.env.production
```

### Immer sichern:

- Keystore-Passwörter im Passwort-Manager
- Keystore-Datei an 3 sicheren Orten
- Notfall-Wiederherstellungsplan dokumentieren

---

## 📊 Release-Checklist

```
☐ Code getestet (lokal)
☐ CHANGELOG.md ausgefüllt
☐ npm run release:patch/minor/major ausgeführt
☐ App auf Android-Gerät getestet
☐ Alle kritischen Flows getestet:
  ☐ Login
  ☐ Rezept speichern
  ☐ URL-Import
  ☐ Foto-Scan
  ☐ Zahlung
☐ Google Play Console:
  ☐ Neue Release erstellt
  ☐ Versionshinweise kopiert
  ☐ AAB hochgeladen
  ☐ Vorschau geprüft
  ☐ Rollout bestätigt
```

---

## 🆘 Support

Bei Problemen:
- Skript ansehen: `scripts/version-upgrade.js`
- CHANGELOG: `CHANGELOG.md`
- Build-Output prüfen: `android/build/reports/`

Viel Erfolg beim Releasen! 🚀
