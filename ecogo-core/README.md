# ecogo_core

Shared core for the ECOGO passenger and driver apps:

- **Networking** — `ApiClient` with transparent access-token **refresh** (single retry on 401),
  `TokenStore` (access + refresh + uid), `AuthService` (OTP login, refresh, logout).
- **Realtime** — `RealtimeService` (socket.io: ride tracking, GPS broadcast, chat).
- **Domain services** — matching, bookings, rides, vehicles, chat.
- **Models** — Stop, Candidate, Booking, Ride, RideBooking, Vehicle, Message.
- **UI kit** — `ecogoTheme()`, `FadeInSlide`, `EmptyState`, `ErrorView`, `LoadingView`,
  `StatusChip`, `showSnack`.

Used via a path dependency: `ecogo_core: { path: ../ecogo-core }`.
