# The Red String Project

Firebase-native Next.js web app for preserving evidence sources, archiving allowed media, scoring
credibility with Gemini, and exploring connections on a D3 red-string board.

## What Is Implemented

- Next.js app router with a public landing page and authenticated `/app` workspace.
- D3 2D detective board with draggable evidence/case nodes and animated red strings.
- Evidence Locker with admin URL intake and Storage upload flow.
- Case Files and Oracle views.
- Firebase client config, Auth, Firestore, Storage, Functions, Hosting, rules, indexes, and emulators.
- Cloud Functions for URL preservation, upload registration, Gemini analysis, Google PSE scheduled
  discovery, Cloud Tasks analysis queue, and Oracle RAG.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run functions:build
npm run emulators
```

To seed starter records, authenticate with Application Default Credentials or set
`GOOGLE_APPLICATION_CREDENTIALS` to a local service-account key path, then run:

```bash
npm run seed:sample
```

## Important Security Note

The file `the-red-string-project-firebase-adminsdk-fbsvc-270705aae1.json` is a service-account key.
It is intentionally ignored by git and must never be imported into frontend code. Use Firebase/Google
server credentials and Functions secrets for deployment.

## Setup

See [docs/setup.md](docs/setup.md) and [docs/vector-indexes.md](docs/vector-indexes.md).
