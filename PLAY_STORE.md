# Publishing AstroPulse on Google Play

Everything the repo can do for you is done: signed-bundle workflow, target API 36, privacy policy, store assets, listing text. This file is the rest, in order.

## 0. Before anything: fill in three placeholders
1. `src/lib/app.ts` → `SUPPORT_EMAIL` (shown in the privacy policy and in Me → Contact). Use an address you are happy to make public. Also check `DEVELOPER`.
2. Confirm you have the rights to the planet picture `public/hero-planet.jpg` (it came from your Stitch export). If unsure, replace it. It is used in the feature graphic and on desktop.
3. Deploy the website to Vercel (import the repo). Then set the GitHub **variable** `API_BASE` = your Vercel URL (no trailing slash). Your privacy policy URL is `https://YOUR-VERCEL-URL/privacy`.

## 1. Play Console account
- Create a developer account at play.google.com/console (one-time US$25 fee, ID verification).
- Personal accounts created after 13 Nov 2023 must run a **closed test with at least 12 testers opted in for 14 consecutive days** before they can apply for production access (Google's requirement as I read it from their help page; re-check it in the Console when you start). Start collecting 12+ testers' Gmail addresses early. Organization accounts are exempt.

## 2. Create the upload key (once, keep it forever)
```
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```
Back up `upload.jks` and its passwords somewhere safe (not in git). With Play App Signing, Google holds the real app-signing key, and this is only your upload key, which you can reset through Play support if lost.

Add four GitHub secrets (repo → Settings → Secrets and variables → Actions → Secrets):
| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | output of `base64 -w0 upload.jks` (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.jks"))`) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | key password |

## 3. Build the bundle
Push to `main` (or run the workflow by hand). The run produces two artifacts:
- `AstroPulse-apk`: debug APK, to test on your own phone.
- `AstroPulse-aab`: signed release **.aab**, the file you upload to Play. The version code is the workflow run number, so it rises on every build as Play requires.

Install the APK on a real phone and test it before uploading: back button, rotating, offline (airplane mode), a fresh install showing the intro, Me → Reset.

## 4. Play Console: create the app
App name, default language, App (not game), Free. Accept the declarations.

**Store listing**: paste from `store/listing.md`. Upload:
- App icon: `store/icon-512.png`
- Feature graphic: `store/feature-graphic-1024x500.png`
- Phone screenshots: `store/screenshots/*.png` (1080×2100). They use the built-in sample data with a demo profile; replace them with your own captures if you prefer.

**App content** (all required):
- Privacy policy: your `/privacy` URL.
- Ads: No.
- App access: all functionality available without login.
- Content rating (IARC questionnaire): answer No to violence, sexual content, language, gambling, drugs, user-generated content, location sharing. Expected result: Everyone.
- Target audience: 13+ or "all ages" are both fine; do **not** pick "children under 13" as the target unless you want the Families policy requirements.
- News app: No. Government app: No. Health: No. Financial features: none.
- Data safety (answers match the privacy policy, but confirm against Google's current form):
  - Does the app collect or share any of the required user data types? **No.** The only data leaving the device is the star name or position you open, sent over HTTPS to the data server, processed to answer the request and not stored or linked to you (the Play form treats data processed ephemerally as not collected). If you later add logging, analytics or accounts, this answer must change.
  - Is all data encrypted in transit? Yes.
  - Can users request data deletion? Not applicable (no account; data is on-device, erased via Me → Reset or uninstall).
- Permissions: only INTERNET. No sensitive permissions to declare.

## 5. Test, then release
1. Testing → **Closed testing** → create a track, upload the `.aab`, add your testers (email list), roll out. Share the opt-in link.
2. After 14 days with 12+ testers, Dashboard → **Apply for production** and summarize feedback.
3. Production → create release → upload the same or newer `.aab` → review → roll out. First review usually takes a few days.
4. For every update: push to `main`, upload the new `AstroPulse-aab`. Never reuse a version code.

## 6. What the app does on its own
- Works offline with a built-in sample of 87 stars; live catalog, real light curves and real candidates need `API_BASE` and a connection (an offline banner explains).
- Android back button: closes a dialog, steps back, goes home, then exits.
- Progress is saved on-device only; Me → Reset erases it.
- Target SDK 36, min SDK 24. Release build is signed by CI only when the four secrets exist.

## 7. Known limits (be honest with yourself and testers)
- The APK and AAB have been built by the CI recipe I wrote, not run by me on a phone. Test on hardware first.
- The live NASA, MAST and OGLE paths were tested against a mock of those services, not the real ones.
- The Vercel free plan is meant for non-commercial use and has usage limits; if the app grows, move the data server to a paid plan or another host.
