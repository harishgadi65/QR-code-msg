# QR Digital Gift, Memory & Wish Platform

A QR code is printed once and attached to a physical gift. The first scan lets the
giver attach a photo, video and/or message. Every scan after that shows the saved
memory — the physical QR code never changes.

- **Admin**: `/#/admin` — generate/print QR codes, manage content, view analytics.
- **Customer**: `/#/m/:qrId` — no login required.

(The client uses `HashRouter`, so every route lives after a `#` — see "Hosting the
frontend" below for why.)

## Architecture

```
client/       Vite + React + TypeScript + Tailwind (single-page app)
functions/    Firebase Cloud Functions (TypeScript) — the only thing that talks
              to Firestore and Google Drive
firestore.rules        Denies ALL direct client access (see Security below)
firestore.indexes.json Composite indexes for the QR Bank's filters
firebase.json           Optional: Hosting rewrites /api/** to Cloud Functions,
                        serves client/dist — only needed if you deploy the
                        frontend to Firebase Hosting instead of GitHub Pages
```

The client never talks to Firestore or Google Drive directly. Every read and write —
including the customer's own "save memory" request — goes through the Express app in
`functions/src/index.ts`, which validates input server-side and uses the Firebase
Admin SDK. This is what makes it safe to deny all client-side Firestore access.
Firestore and Google Drive always live in Cloud Functions regardless of where the
frontend itself is hosted — moving the frontend to GitHub Pages doesn't remove the
need for either.

## 1. Prerequisites

- Node.js 20+
- A Firebase project (create one at https://console.firebase.google.com)
- A Google account to own the uploaded Drive files (personal Gmail or Workspace)

## 2. Firebase project setup

1. Create a Firebase project in the console.
2. Enable **Authentication** → Sign-in method → **Email/Password**.
3. Enable **Cloud Firestore** (production mode — the rules in `firestore.rules`
   already lock it down).
4. Under Project Settings → General → "Your apps", add a **Web app** and copy the
   config values into `client/.env` (see `client/.env.example`).
5. Update `.firebaserc` with your project ID:
   ```json
   { "projects": { "default": "your-project-id" } }
   ```
6. Install the Firebase CLI (locally, no need for a global install) and log in:
   ```
   npx firebase-tools login
   ```

## 3. Google Drive setup (media storage)

Actual photos/videos are stored in Google Drive, never in Firestore and never inside
the QR code. Firestore only stores the Drive file ID and a display URL.

> **Why OAuth2 instead of a plain service account?** A bare Google service account has
> **no Drive storage quota of its own** (Google removed this in 2021). It can only write
> files if you either (a) use a Google Workspace **Shared Drive** with the service
> account added as a member, or (b) authenticate as a real Google account via OAuth2.
> Option (b) works for both personal Gmail and Workspace accounts, so that's what this
> project uses.

1. In [Google Cloud Console](https://console.cloud.google.com), enable the **Google
   Drive API** for your project (can be the same project as Firebase, or a separate one).
2. Go to "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth client ID"
   → Application type **Desktop app**. Copy the Client ID and Client Secret.
3. In Google Drive, create a folder (e.g. "QR-MEMORIES") that will hold everything.
   Copy its folder ID from the URL (`https://drive.google.com/drive/folders/<ID>`).
4. Run the token helper locally:
   ```
   cd functions
   set GOOGLE_DRIVE_CLIENT_ID=...          (PowerShell: $env:GOOGLE_DRIVE_CLIENT_ID="...")
   set GOOGLE_DRIVE_CLIENT_SECRET=...
   npm run get-drive-token
   ```
   This opens a browser, asks you to sign in with the Google account that should own
   the files, and prints a `GOOGLE_DRIVE_REFRESH_TOKEN`.
5. Put all four values (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`,
   `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`) into `functions/.env`
   (copy from `functions/.env.example`).

Uploaded files are shared as "anyone with the link can view" so the giver/receiver can
see them without a Google account. Nothing else in Drive is touched.

## 4. Admin authentication

There is no public sign-up page — admin accounts are created directly with the
Firebase Admin SDK so random visitors can never register themselves as admin.

1. Download a service account key: Firebase Console → Project Settings → Service
   Accounts → "Generate new private key". Save it locally, e.g. `serviceAccountKey.json`
   (it's git-ignored).
2. Create your first admin:
   ```
   cd functions
   set GOOGLE_APPLICATION_CREDENTIALS=../serviceAccountKey.json
   npm run create-admin -- admin@example.com "StrongPassword123!"
   ```
   This creates the Firebase Auth user (or updates the password if it already exists)
   and grants the `admin: true` custom claim that every admin API route requires.
3. Optionally set `ADMIN_EMAILS` in `functions/.env` to a comma-separated allowlist —
   any of those emails that sign up later automatically get the admin claim too.

## 5. Environment variables

Copy the example files and fill them in:

```
cp client/.env.example client/.env
cp functions/.env.example functions/.env
```

See each file for the full list. Never commit `.env`, `serviceAccountKey.json`, or any
credentials — they're already in `.gitignore`.

## 6. Local development

```
# Terminal 1 — Cloud Functions + Firestore + Auth emulators
cd functions
npm install
npm run serve

# Terminal 2 — the frontend
cd client
npm install
npm run dev
```

Vite proxies `/api/**` to `http://127.0.0.1:5001` (see `client/vite.config.ts`), which
is where the Functions emulator listens, so the app works the same locally as in
production. Open `http://localhost:5173/admin/login`.

## 7. Deploying

The backend (Firestore rules/indexes + Cloud Functions) always deploys through
Firebase, no matter where the frontend ends up:

```
npx firebase-tools deploy --only firestore:rules,firestore:indexes,functions
```

The `functions` deploy config in `firebase.json` runs `npm run build` first. Cloud
Functions read `functions/.env` automatically when deployed (or use
`functions/.env.<project-id>` for environment-specific values).

### Hosting the frontend

Two options — pick one:

**Option A: Firebase Hosting** (simplest — one extra deploy target, same origin as
the API, no CORS/env-URL configuration needed):
```
npx firebase-tools deploy --only hosting
```
Leave `VITE_API_BASE_URL` unset; `firebase.json`'s `/api/**` rewrite handles routing
requests to the function on the same domain.

**Option B: GitHub Pages** (free, no Firebase Hosting quota, deploys straight from
the repo): the workflow in `.github/workflows/deploy-pages.yml` builds `client/` and
publishes it on every push to `main`. To enable it:
1. Repo Settings → Pages → Source → **GitHub Actions**.
2. Repo Settings → Secrets and variables → Actions → add the `VITE_FIREBASE_*`
   values as **secrets**, and `VITE_APP_BASE_URL` (your `https://<user>.github.io/<repo>`
   URL) + `VITE_API_BASE_URL` (`https://us-central1-<project-id>.cloudfunctions.net/api`)
   as **variables**.
3. Push to `main` — the Actions tab shows the build/deploy run.

Because GitHub Pages can't rewrite `/api/**` to a function the way Firebase Hosting
can, the client calls `VITE_API_BASE_URL` directly instead — CORS is already enabled
on the Express app (`functions/src/index.ts`) to allow this. And because GitHub Pages
can't rewrite arbitrary paths to `index.html` for client-side routing either, the app
uses `HashRouter` — every route (`/#/admin`, `/#/m/QR-000001`) lives in the fragment,
which the browser never sends to the server, so no server-side rewrite is needed at
all. This works identically on Firebase Hosting too; it's just not required there.

## 8. QR code generation

Admin → **QR Generator**: pick a quantity (default 10 for testing, supports up to
100,000 at once) and generate. IDs are allocated from an atomic Firestore counter
(`counters/qrCounter`), so concurrent generate requests never collide or reuse an ID —
if `QR-000001..QR-000010` exist, the next batch always starts at `QR-000011`.

Each QR code encodes only `https://your-domain.com/#/m/QR-000001` — never the media
itself. QR PNG/PDF generation happens entirely client-side (the `qrcode` and `jspdf`
packages) since there's nothing sensitive to protect in that URL.

## 9. Customer flow

`/#/m/:qrId` reads the QR document through the API and shows one of five states:

| Firestore status | What the customer sees |
|---|---|
| `empty` | "Create a Special Memory" form (photo/video/message/from/to) |
| `content_added` | The saved memory, read-only |
| `disabled` | "QR Code Unavailable" |
| *(no document)* | "QR Code Not Found" |
| `pending_upload` | "Saving in progress" — a transient state (see Concurrency below) |

Videos longer than 60 seconds are trimmed **in the browser** (ffmpeg.wasm, loaded from
`client/public/ffmpeg/` on first use, no server round-trip) before upload — the original
long file is never sent anywhere. The server independently re-verifies the final
video's duration with `ffprobe` before accepting it, so a request that bypasses the
browser UI still can't sneak in an over-length video.

## 10. Testing

Admin → **Test / Preview** always has a `TEST-QR-0001` record, excluded from all
dashboard stats and QR Bank listings (`isTest: true`). It embeds the real customer page
in an iframe and offers a one-click "Reset test QR" that clears its content and Drive
files without touching any real QR code.

## 11. Security model

- **Firestore rules deny all direct client access** (`firestore.rules`). Every read and
  write goes through Cloud Functions, which is what lets the server enforce all the
  business rules below instead of relying on rules alone.
- Admin routes (`/api/admin/**`) require a Firebase ID token whose custom claims
  include `admin: true`, checked in `functions/src/middleware/auth.ts`.
- Customers never get an auth token at all — the public `/api/qr/**` routes are
  reachable by anyone, but only ever expose or mutate the single QR document named in
  the URL, and only according to its current status.
- Google Drive credentials and the Firebase service account only ever exist in Cloud
  Functions' server environment — never in client code or a response body.

## 12. Concurrency ("two people scan the same empty QR at once")

Saving a memory is two phases:

1. **Claim** (`functions/src/routes/customerQr.ts`): a Firestore transaction reads the
   QR doc and, only if `status === 'empty'`, flips it to `status: 'pending_upload'`.
   A second request arriving milliseconds later sees `pending_upload` and is rejected
   with a friendly "someone is already saving a memory to this QR" error — it never
   reaches the upload step.
2. **Upload & finalize**: media is uploaded to Drive, then a second write sets
   `status: 'content_added'` with the final URLs. If the upload throws for any reason,
   the QR is reverted to `empty` (and any partially-uploaded Drive files are deleted) so
   it never gets stuck — no broken/half-created record is ever left as `content_added`.

If a request crashes between steps 1 and 2, the QR would stay `pending_upload` forever;
`GET /api/qr/:qrId` auto-recovers it back to `empty` once `PENDING_UPLOAD_TIMEOUT_MS`
(default 2 minutes) has passed since the claim, so a QR can never be permanently
bricked by a dropped connection.

## 13. Storage architecture

```
Firestore
  counters/qrCounter        { lastNumber }          — atomic QR ID allocation
  counters/batchCounter     { lastNumber }          — atomic batch ID allocation
  qrCodes/{qrId}            status, from/to/message, photoUrl, videoUrl,
                             photoDriveId, videoDriveId, scanCount, lastScannedAt, ...
  batches/{batchId}         quantity, label, startQrId, endQrId, createdAt

Google Drive
  QR-MEMORIES/ (your configured root folder)
    QR-000001/
      photo/photo.jpg
      video/video.mp4
    QR-000002/
      ...
```

Firestore never stores raw media — only the Drive file ID and a public display URL
(`photoUrl` uses `lh3.googleusercontent.com`, `videoUrl` uses the Drive embedded
preview player so Play/Pause/Mute/Fullscreen work the same on Android Chrome and
iPhone Safari without a custom video pipeline).

## Scaling beyond 10 QR codes

Every list/count query in `functions/src/routes/adminStats.ts` and `adminQr.ts` uses
Firestore's `count()`/`sum()` aggregation queries and cursor-based pagination, so the
admin dashboard and QR Bank stay fast whether there are 10 or 100,000 QR codes — they
never load the full collection into memory. The one manual limit is the client-side
"download whole batch as one PDF" action, which is capped at 2,000 QR codes per PDF to
avoid freezing the browser tab; larger batches should be downloaded from the QR Bank in
smaller filtered chunks.
