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
client/       Vite + React + TypeScript + Tailwind (single-page app) → GitHub Pages
functions/    Express API (TypeScript) → Vercel serverless functions
              — the only thing that talks to Firestore and Google Drive
firestore.rules        Denies ALL direct client access (see Security below)
firestore.indexes.json Composite indexes for the QR Bank's filters
firebase.json           Firestore rules/indexes deploy config + local emulators
                        (Firestore + Auth only — no Hosting, no Cloud Functions)
```

**Why Vercel instead of Firebase Cloud Functions?** Firebase Cloud Functions (any
generation) can only be deployed on the paid "Blaze" plan — it requires a billing
account attached even if actual usage stays within the free quota. Firestore and
Firebase Auth, by contrast, are fully free on the "Spark" plan. So this project keeps
Firestore + Auth on Firebase, and runs the actual server code (`functions/src/app.ts`,
a plain Express app) on Vercel's free tier instead, which needs no card on file.

The client never talks to Firestore or Google Drive directly. Every read and write —
including the customer's own "save memory" request — goes through that Express app,
which validates input server-side and uses the Firebase Admin SDK. This is what makes
it safe to deny all client-side Firestore access, and it's true no matter which of the
two hosting options below serves the frontend.

## 1. Prerequisites

- Node.js 20+
- A Firebase project, Spark (free) plan is enough — create one at
  https://console.firebase.google.com
- A Vercel account (free "Hobby" tier, no credit card) — https://vercel.com
- A Google account to own the uploaded Drive files (personal Gmail or Workspace)

## 2. Firebase project setup

1. Create a Firebase project in the console (Spark/free plan).
2. Enable **Authentication** → Sign-in method → **Email/Password**.
3. Enable **Cloud Firestore** (production mode — the rules in `firestore.rules`
   already lock it down).
4. Under Project Settings → General → "Your apps", add a **Web app** and copy the
   config values into `client/.env` (see `client/.env.example`).
5. Update `.firebaserc` with your project ID:
   ```json
   { "projects": { "default": "your-project-id" } }
   ```
6. Install the Firebase CLI (locally, no need for a global install) and log in — only
   needed for deploying Firestore rules/indexes and running local emulators, nothing
   Cloud-Functions-related:
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
>
> **Why the `drive.file` scope specifically?** The browser itself uploads photos/videos
> directly to Google Drive (see "How uploads work" below) using a short-lived access
> token our API hands out. That token is scoped to `drive.file`, which Google Drive
> limits to files/folders *this app itself created* — never anything else in the
> account. Even if that temporary token were somehow intercepted, it couldn't be used
> to read or touch anything outside this app's own QR-MEMORIES folder tree.

1. In [Google Cloud Console](https://console.cloud.google.com), enable the **Google
   Drive API** for your project (can be the same project as Firebase, or a separate one).
2. Go to "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth client ID"
   → Application type **Desktop app**. Copy the Client ID and Client Secret.
3. Run the token helper locally — it also creates the root "QR-MEMORIES" Drive folder
   for you (see the `drive.file` note above for why it can't just be created by hand
   in the regular Drive website):
   ```
   cd functions
   set GOOGLE_DRIVE_CLIENT_ID=...          (PowerShell: $env:GOOGLE_DRIVE_CLIENT_ID="...")
   set GOOGLE_DRIVE_CLIENT_SECRET=...
   npm run get-drive-token
   ```
   This opens a browser, asks you to sign in with the Google account that should own
   the files, and prints a `GOOGLE_DRIVE_REFRESH_TOKEN` and `GOOGLE_DRIVE_ROOT_FOLDER_ID`.
4. Put all four values (`GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`,
   `GOOGLE_DRIVE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`) into `functions/.env`
   (copy from `functions/.env.example`) for local dev, and into the Vercel project's
   environment variables for production (Vercel dashboard → Settings → Environment
   Variables).

Uploaded files are shared as "anyone with the link can view" so the giver/receiver can
see them without a Google account. Nothing else in Drive is touched.

### How uploads actually work

The browser never sends photo/video bytes to our own server — only to Google, and only
our server ever sees the Drive refresh token:

1. Browser calls `POST /qr/:qrId/upload-init` → server claims the QR (see Concurrency
   below), mints a ~1 hour Drive access token, returns it plus the target folder ID(s).
2. Browser uploads the file(s) straight to `googleapis.com` using that token
   (`client/src/services/driveUpload.ts`) — this is what keeps everything working
   within Vercel's small request-body limit, since the file never touches our function.
3. Browser calls `POST /qr/:qrId/finalize` with the resulting Drive file ID(s) — the
   server re-downloads/re-checks what actually landed in Drive (file type, size, and
   for video, duration via `ffprobe`) before accepting it, exactly mirroring the checks
   the browser UI already does, so a request that skips the UI can't sneak past them.

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

## 5. Environment variables

Copy the example files and fill them in locally:

```
cp client/.env.example client/.env
cp functions/.env.example functions/.env
```

See each file for the full list. Never commit `.env`, `serviceAccountKey.json`, or any
credentials — they're already in `.gitignore`. The same values (minus anything
Firebase-emulator-specific) need to also be set in Vercel's and GitHub's own
environment/secrets UIs for production — see the deploy sections below.

## 6. Local development

```
# Terminal 1 — the API, as a plain local server (no Vercel/Firebase Functions needed)
cd functions
npm install
npm run dev

# Terminal 2 — Firestore + Auth emulators (no Cloud Functions emulator — unused now)
npx firebase-tools emulators:start --only firestore,auth

# Terminal 3 — the frontend
cd client
npm install
npm run dev
```

Vite proxies `/api/**` to `http://127.0.0.1:3001` (see `client/vite.config.ts`), which
is where `functions/src/localServer.ts` listens — the exact same Express app that runs
on Vercel in production, just invoked directly instead of through Vercel's function
runtime. Open `http://localhost:5173/#/admin/login`.

## 7. Deploying the backend (Vercel)

1. Push this repo to GitHub (if you haven't already).
2. In the Vercel dashboard: **Add New Project** → import the repo.
3. Set **Root Directory** to `functions` (Vercel auto-detects the `api/` folder as
   serverless functions from there — see `functions/vercel.json`).
4. Add all the `functions/.env.example` values as Vercel **Environment Variables**
   (Settings → Environment Variables) — the Google Drive credentials, in particular.
5. Deploy. Vercel gives you a URL like `https://your-project.vercel.app` — the actual
   API lives at `https://your-project.vercel.app/api`.

Firestore rules/indexes still deploy through Firebase (no billing needed for this part):
```
npx firebase-tools deploy --only firestore:rules,firestore:indexes
```

## 8. Hosting the frontend

Two options — pick one:

**Option A: Firebase Hosting.** Simplest if you're on the Blaze plan and want
same-origin `/api/**` requests. Not covered in depth here since this project defaults
to the Blaze-free path below, but `firebase.json` can have a `hosting` block added back
with a rewrite to wherever the API is deployed.

**Option B: GitHub Pages** (what this project ships with — free, no card, deploys
straight from the repo). The workflow in `.github/workflows/deploy-pages.yml` builds
`client/` and publishes it on every push to `main`. To enable it:
1. Repo Settings → Pages → Source → **GitHub Actions**.
2. Repo Settings → Secrets and variables → Actions → add the `VITE_FIREBASE_*`
   values as **secrets**, and `VITE_APP_BASE_URL` (your
   `https://<user>.github.io/<repo>` URL) + `VITE_API_BASE_URL`
   (`https://your-project.vercel.app/api`, from step 7 above) as **variables**.
3. Push to `main` — the Actions tab shows the build/deploy run.

Because GitHub Pages can't rewrite `/api/**` to a function, the client calls
`VITE_API_BASE_URL` directly instead — CORS is already enabled on the Express app
(`functions/src/app.ts`) to allow this. And because GitHub Pages can't rewrite
arbitrary paths to `index.html` for client-side routing either, the app uses
`HashRouter` — every route (`/#/admin`, `/#/m/QR-000001`) lives in the fragment, which
the browser never sends to the server, so no server-side rewrite is needed at all.

## 9. QR code generation

Admin → **QR Generator**: pick a quantity (default 10 for testing, supports up to
100,000 at once) and generate. IDs are allocated from an atomic Firestore counter
(`counters/qrCounter`), so concurrent generate requests never collide or reuse an ID —
if `QR-000001..QR-000010` exist, the next batch always starts at `QR-000011`.

Each QR code encodes only `https://your-domain.com/#/m/QR-000001` — never the media
itself. QR PNG/PDF generation happens entirely client-side (the `qrcode` and `jspdf`
packages) since there's nothing sensitive to protect in that URL.

## 10. Customer flow

`/#/m/:qrId` reads the QR document through the API and shows one of five states:

| Firestore status | What the customer sees |
|---|---|
| `empty` | "Create a Special Memory" form (photo/video/message/from/to) |
| `content_added` | The saved memory, read-only |
| `disabled` | "QR Code Unavailable" |
| *(no document)* | "QR Code Not Found" |
| `pending_upload` | "Saving in progress" — a transient state (see Concurrency below) |

Videos longer than 60 seconds are trimmed **in the browser** (ffmpeg.wasm, loaded from
`client/public/ffmpeg/` on first use) before upload — the original long file is never
uploaded anywhere. The server independently re-verifies the final video's duration with
`ffprobe` in the finalize step, so a request that bypasses the browser UI still can't
sneak in an over-length video.

## 11. Testing

Admin → **Test / Preview** always has a `TEST-QR-0001` record, excluded from all
dashboard stats and QR Bank listings (`isTest: true`). It embeds the real customer page
in an iframe and offers a one-click "Reset test QR" that clears its content and Drive
files without touching any real QR code.

## 12. Security model

- **Firestore rules deny all direct client access** (`firestore.rules`). Every read and
  write goes through the API, which is what lets the server enforce all the business
  rules below instead of relying on rules alone.
- Admin routes (`/api/admin/**`) require a Firebase ID token whose custom claims
  include `admin: true`, checked in `functions/src/middleware/auth.ts`.
- Customers never get an auth token at all — the public `/api/qr/**` routes are
  reachable by anyone, but only ever expose or mutate the single QR document named in
  the URL, and only according to its current status.
- The Google Drive refresh token and the Firebase service account credentials only
  ever exist in the server's environment variables — never in client code or a
  response body. The browser only ever holds a short-lived, narrowly-scoped
  (`drive.file`) access token during an active upload.

## 13. Concurrency ("two people scan the same empty QR at once")

Saving a memory is three steps (`functions/src/routes/customerQr.ts`):

1. **`upload-init`**: a Firestore transaction reads the QR doc and, only if
   `status === 'empty'`, flips it to `status: 'pending_upload'`. A second request
   arriving milliseconds later sees `pending_upload` and is rejected with a friendly
   "someone is already saving a memory to this QR" error — it never reaches the upload
   step. This is also where the short-lived Drive access token is minted.
2. The browser uploads directly to Drive (see "How uploads actually work" above).
3. **`finalize`**: re-validates what landed in Drive, then sets
   `status: 'content_added'` with the final URLs. If validation fails for any reason,
   the QR reverts to `empty` (and anything it uploaded is deleted) so it never gets
   stuck — no broken/half-created record is ever left as `content_added`.

If a request abandons the flow between steps 1 and 3 (closed tab, crashed upload), the
QR would stay `pending_upload` forever; `GET /api/qr/:qrId` auto-recovers it back to
`empty` once `PENDING_UPLOAD_TIMEOUT_MS` (default 8 minutes — generous enough to cover
a slow mobile upload) has passed since the claim. The browser also proactively calls
`POST /qr/:qrId/cancel-upload` on its own upload failures, so it doesn't have to wait
out that timeout to retry.

## 14. Storage architecture

```
Firestore
  counters/qrCounter        { lastNumber }          — atomic QR ID allocation
  counters/batchCounter     { lastNumber }          — atomic batch ID allocation
  qrCodes/{qrId}            status, from/to/message, photoUrl, videoUrl,
                             photoDriveId, videoDriveId, scanCount, lastScannedAt, ...
  batches/{batchId}         quantity, label, startQrId, endQrId, createdAt

Google Drive
  QR-MEMORIES/ (created for you by scripts/getGoogleDriveToken.ts)
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
