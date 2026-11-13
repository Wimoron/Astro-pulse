> Publishing to Google Play? See **PLAY_STORE.md** for signing, the .aab build and the Console checklist.

# Get the APK

1. Put this project on GitHub (new repo, push everything).
2. Open the repo > Actions > "Build Android APK" > Run workflow. Wait about 5 minutes.
3. Open the finished run and download the artifact "AstroPulse-apk". Unzip it to get app-debug.apk.
4. Copy the APK to your phone and open it. Allow "install unknown apps" when Android asks.

## Live NASA data in the app
The app needs the website's server routes for live data. Without them it shows its built-in sample of 87 stars.
1. Deploy this project to Vercel (import the repo, no settings needed).
2. In GitHub: Settings > Secrets and variables > Actions > Variables > New variable. Name `API_BASE`, value your Vercel address (like https://astropulse.vercel.app).
3. Run the workflow again.

## Build it yourself instead
Needs Android Studio (or JDK 21 and the Android SDK): `npm install`, `npm run android:sync`, `cd android && ./gradlew assembleDebug`. The APK is at android/app/build/outputs/apk/debug/.
