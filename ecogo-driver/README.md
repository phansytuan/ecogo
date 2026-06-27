# ECOGO Driver App — Step 6

Flutter app for drivers: phone-OTP login, register a vehicle, post a ride, see and
confirm matched passengers, broadcast live GPS, and chat. Talks to the ECOGO backend.

## First-time setup
This project ships `lib/` + `pubspec.yaml`. Generate the platform folders once:
```bash
flutter create --platforms=android,ios .
flutter pub get
```

GPS needs permissions:
- Android `android/app/src/main/AndroidManifest.xml`: add
  `<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>`
- iOS `ios/Runner/Info.plist`: add `NSLocationWhenInUseUsageDescription`.

## Run
```bash
flutter run --dart-define=API_BASE=http://10.0.2.2:3000/api \
            --dart-define=WS_BASE=http://10.0.2.2:3000
```

## Flow
1. **Login** — phone + OTP.
2. **Vehicle** — register your car (`POST /vehicles`, also grants the `driver` role).
3. **Post ride** — origin/destination + time + seats + price (`POST /rides`; the backend
   fetches and stores the route geometry).
4. **Active ride** — see matched passengers (`GET /rides/:id/bookings`), **confirm** them
   (`POST /bookings/:id/confirm`), **share GPS** (streams `driver:location` over the socket
   so passengers and dispatch see you live), and chat per booking.

## Notes
- GPS sharing here is **foreground** (while the screen is open). A real background
  service (`flutter_background_geolocation` / a foreground service) is a Step 7 hardening item.
- Shares most plumbing with the passenger app; extracting a shared `ecogo_core` package
  is the right next refactor.
