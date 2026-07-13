# Repository Guidelines

## Project Structure & Module Organization

ECOGO is a multi-client carpooling monorepo:

- `ecogo-backend/`: NestJS REST/WebSocket API. Domain modules live in `src/modules/`; PostGIS schema and migrations are in `db/`.
- `ecogo-dispatch/`: React, TypeScript, Vite, and Leaflet dispatcher console. UI code is under `src/components/`, API clients under `src/api/`.
- `ecogo-core/`: shared Flutter models, services, auth, realtime, and UI utilities used by both mobile apps.
- `ecogo-driver/` and `ecogo-passenger/`: Flutter applications with screens in `lib/screens/` and state in `lib/state/`.
- `e2e/`: live-stack smoke tests and dispatcher seed data. Planning documents belong in `ecogo_plan/`.

## Build, Test, and Development Commands

Run the backend stack from the repository root:

```bash
docker compose up -d --build --wait
node e2e/smoke.mjs
```

Backend commands, run in `ecogo-backend/`:

```bash
npm run typecheck   # TypeScript validation
npm test            # Jest unit tests
npm run build       # Nest production build
```

Run `npm run build` in `ecogo-dispatch/` for TypeScript and Vite checks. In each Flutter package, use `flutter pub get`, `flutter analyze`, and `flutter test`; build apps with `flutter build apk` or `flutter build web` as appropriate.

## Coding Style & Naming Conventions

Use two-space indentation in TypeScript, JavaScript, YAML, and Dart. Follow existing Nest patterns: one domain per module and pure domain logic in small testable files. Use `PascalCase` for classes/components, `camelCase` for functions and variables, and kebab-case endpoint paths. Dart files use `snake_case.dart`. Keep shared client logic in `ecogo-core`, not duplicated between apps. Run the compiler/analyzer before submitting.

## Testing Guidelines

Backend tests use Jest and are named `*.spec.ts`; Flutter tests live in each package's `test/` directory and end in `_test.dart`. Add focused unit tests for pricing, matching, scheduling, capacity, and state transformations. Any API or database change must also pass the live `e2e/smoke.mjs` flow against PostGIS and Redis.

## Commit & Pull Request Guidelines

Use Conventional Commit subjects seen in history, such as `fix: ...`, `feat(realtime): ...`, or `test(e2e): ...`. Keep commits scoped to one concern. Pull requests should explain behavior changes, list executed commands, link relevant issues, and include screenshots for Flutter or dispatch UI changes. Call out migrations, environment variables, compatibility risks, and known limitations.

## Security & Configuration Tips

Copy `.env.example` files locally; never commit credentials, OTP provider secrets, JWT secrets, or API keys. Use fake providers only for local development. Add schema changes as numbered, idempotent migrations rather than editing only `schema.sql`.
