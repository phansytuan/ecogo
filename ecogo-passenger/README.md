# ECOGO Passenger App — Step 5

Flutter app for passengers: phone-OTP login, corridor search, booking, live
tracking, and in-app chat. Talks to the ECOGO backend (Steps 1–3).

## Run
```bash
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:3000/api \
            --dart-define=WS_BASE=http://10.0.2.2:3000
```
`10.0.2.2` is the Android emulator alias for your host machine's localhost. On an
iOS simulator use `http://localhost:3000`; on a real device use your LAN IP.

## Flow
1. **Login** — phone + OTP (dev OTP is shown by the backend response).
2. **Search** — pick origin/destination from the corridor stops + a time window →
   `POST /matching/search` (corridor matching).
3. **Results** — ranked rides; tap to book (`POST /bookings`). If none match, create a
   request (`POST /requests`) which auto-matches or escalates to dispatch after 15 min.
4. **Trip** — live driver position on the map (socket `ride:location`) + chat.
5. **Chat** — `GET/POST /chat/:bookingId/messages`, live via socket `chat:message`.

## Notes
- Map uses `flutter_map` + OpenStreetMap tiles (swap the tile URL for Goong later).
- Token is in `shared_preferences`; move to `flutter_secure_storage` for production.
- Built to be analysed/run with the Flutter SDK locally (not bundled here).
