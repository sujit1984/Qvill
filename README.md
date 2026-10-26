# Qvill

Qvill is a local-first workspace for quick notes, daily journal entries, hierarchical knowledge pages, and PDF workflows. The product and architecture reference is [Qvill_System_Design.md](Qvill_System_Design.md).

## Workspace

- `apps/web` — responsive Next.js web client. Notes and imported PDFs are saved in browser IndexedDB as you edit.
- `apps/mobile` — Expo / React Native iOS and Android client scaffold with on-device SQLite notes, journal entries, and nested knowledge pages.
- `apps/api` — NestJS REST API and PostgreSQL notes store.
- `packages/shared` — shared note types and creation helpers.

## Start the web client

Install dependencies from the repository root, then start the web app:

```sh
npm install
npm run dev:web
```

Open `http://localhost:3000`. Data is stored in the browser on this device. The current web client does not yet sync with the API or another device.

## Start the API

Start local PostgreSQL with Docker Compose, copy `apps/api/.env.example` to `apps/api/.env`, install dependencies, and run the API:

```sh
docker compose up -d postgres
npm install
npm run dev:api
```

The first API version exposes `GET/POST /v1/notes`, `PATCH/DELETE /v1/notes/:id`, and initializes its notes table on startup. It is intended for local development: sign-in, workspace authorization, migrations, sync conflict handling, file upload, and production deployment are not implemented yet. Do not expose this API to the public internet.

## Start the mobile client

```sh
npm install
npm run dev:mobile
```

Use Expo Go or a development build to open the iOS / Android app. On-device notes use SQLite and remain after app restarts.

## Current scope

Knowledge pages use a five-level tree: Root → Trunk → Branch → Twig → Leaf. Leaf pages cannot have children. The web client currently supports quick notes, journal notes, hierarchical knowledge pages, local autosave, search, note sharing/export, browser print-to-PDF, and local PDF import/preview. The mobile client supports local notes, journals, and nested pages. Imported PDFs remain unchanged. PDF text extraction, annotations, true PDF editing, mobile PDF import, cross-device sync, authentication, and multi-user access remain follow-up work.

## Build the macOS desktop app

On an Apple Silicon Mac with Xcode command-line tools, build a self-contained Qvill DMG without installing npm packages:

```sh
npm run package:mac
```

The installer is written to `dist/mac/Qvill-0.1.0-arm64.dmg`. Open the DMG and drag Qvill to Applications. This native WKWebView build bundles a lightweight client for local notes, journals, nested pages, search, Markdown export, print-to-PDF, and imported PDF preview. Data is saved in the app’s persistent local WebKit storage. It does not need a web server or internet connection. The build is ad-hoc signed but not Developer ID-signed or notarized, and is intended for local development testing.
