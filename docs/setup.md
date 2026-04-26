# The Red String Project Setup

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the public Firebase example env if you want to override the built-in client config:
   ```bash
   cp .env.local.example .env.local
   ```

3. Start the Next.js app:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:3000/app` and sign in with Google.

## Server Secrets

The Firebase web config is client-safe. The Admin SDK JSON is not. Keep
`the-red-string-project-firebase-adminsdk-fbsvc-270705aae1.json` local only, and prefer Application
Default Credentials or Firebase deploy-time service identity for Functions.

Set Functions parameters/secrets:

```bash
firebase functions:secrets:set GOOGLE_GENAI_API_KEY
firebase functions:secrets:set GOOGLE_PSE_API_KEY
firebase functions:config:set redstring.placeholder=true
firebase deploy --only functions
```

Set string params with a local Functions env file before deploy:

```bash
cat > functions/.env.the-red-string-project <<'EOF'
ADMIN_EMAILS=you@example.com
GOOGLE_PSE_CX=your-programmable-search-engine-id
DEFAULT_SEARCH_QUERIES=site:.gov declassified intelligence documents,uap testimony documents
EOF
```

`NEXT_PUBLIC_ADMIN_EMAILS` is only a client hint. The server-side `ADMIN_EMAILS` parameter is the real
write gate for callable Functions.

## Admin Custom Claims

Firestore and Storage rules use `request.auth.token.admin == true` for direct client writes. Callable
Functions also allow emails listed in `ADMIN_EMAILS`.

For Storage uploads from the browser, set the custom claim once with the Admin SDK:

```js
await getAuth().setCustomUserClaims(uid, { admin: true });
```

After changing claims, sign out and sign in again so the ID token refreshes.

## Firebase Emulators

```bash
npm run emulators
```

The UI runs at `http://localhost:4000`. Hosting runs at `http://localhost:5000`.
