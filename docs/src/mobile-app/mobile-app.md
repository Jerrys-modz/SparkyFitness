# Mobile App

The Mobile App is available for both iOS and Android devices. It allows you to sync your data from Apple Health or Android Health Connect. It also provides a convenient way to access Sparky Fitness on the go.

**Mobile App requires HTTPS**, though support for self-signed certificates has been added. Since the app handles health data, HTTPS is required for the app to be allowed to be published on the Google Play Store. See the [Google Play Policy Center](https://support.google.com/googleplay/android-developer/answer/10144311) for more information.

## iOS

The iOS version of the Sparky Fitness app is available on the App Store.

[Get it here](https://apps.apple.com/us/app/sparkyfitness/id6757314392)

### Testflight

Join the Testflight beta program to get early access to new features and updates:

[Join Testflight](https://testflight.apple.com/join/9Yz8PzpR)


## Android

### Install APK

You can download the latest APK from our [GitHub releases page](https://github.com/CodeWithCJ/SparkyFitness/releases). Look for the latest release and download the `SparkyFitnessMobile.apk` file. Then transfer it to your android device for installation.

### Google Play Beta

The Android version is available as a google play store beta. You can join the beta program to get early access to new features and updates:

1. First, join the [Google Play beta group](https://groups.google.com/g/sparkyfitness)
2. Then you will have access to closed testing and can [download the beta here](https://play.google.com/store/apps/details?id=com.SparkyApps.SparkyFitnessMobile)

## Screenshot (iOS)

![Mobile App](/appdashboard.png)

## Offline logging

The app talks to your own server, so away from home Wi-Fi or your VPN it can lose that connection. A few everyday entries keep working anyway: they are saved on the phone and sent to the server when it can be reached again.

**What works without a connection**

- Logging a food that is already in your library (from recent, favourites or a saved custom food), including its quantity, meal and time.
- Adding a drink with the water **+** button or a drink preset.
- Saving your weight and other body measurements.
- Deleting an entry that is still waiting to sync.

Your diary and dashboard show what you logged straight away, and the totals include it. Entries that have not reached the server yet are marked **Waiting to sync**.

**What needs a connection**

Searching for foods (the recent, frequent and favourite lists still show), scanning barcodes, estimating a food from a photo, foods from online providers, creating a new food, meals, copying entries, editing or deleting entries that are already on the server, removing a drink, and exercise. These explain that they need a connection rather than failing silently.

**Syncing**

A slim bar above the tab bar appears when you are offline or something is waiting, for example *Offline, 3 waiting to sync*. Tap it to see the list and press **Sync now**. Entries also sync by themselves when the app opens, when the phone or server comes back, and every minute or so while the app is open.

- **Nothing is logged twice.** Each entry carries a unique id, so if a request was cut off after the server had already saved it, sending it again does not add a second copy. This needs a server version that supports it; update your server before relying on offline logging.
- **Signed out?** If your session has expired, entries stay on the phone. Sign in again and they are sent.
- **Rejected entries are never dropped silently.** If the server refuses an entry (for example because the meal type was deleted), it moves to **Needs attention** with the reason, and you can discard it.
- **Switching accounts.** An entry made while signed in as one account is not sent to another; it appears under **Needs attention**.
- **Not the same as a local app.** Waiting entries live on the phone until they are sent. Uninstalling the app or clearing its data before they sync loses them. A weight saved offline replaces a weight saved elsewhere for the same day when it syncs.

For how it is built, see [Offline logging](/developer/offline-logging).

