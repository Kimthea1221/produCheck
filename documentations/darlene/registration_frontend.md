# E-VerifyMo — Deep-Link & Frontend Integration Documentation

This picks up where the first documentation left off (database setup
through the three registration backend endpoints). This part covers the
Electron deep-link work and connecting everything to the React frontend.

---

## 1. Why Deep-Linking Needs Special Handling

A deep link looks like `everifymo://complete-registration?token=abc123`.
Unlike a normal `https://` link, `everifymo://` isn't something a browser
already knows how to open — our own Electron app has to register itself
as the thing that handles links starting with `everifymo://`, and then
catch the click when it happens.

This involves two files that didn't exist before:
- `src/electron/main.js` (already existed, heavily modified)
- `src/electron/preload.cjs` (newly created)

---

## 2. `main.js` — What Was Added

### Registering the protocol
```javascript
if (process.env.VITE_DEV_SERVER_URL) {
  app.setAsDefaultProtocolClient('everifymo', process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient('everifymo')
}
```
This tells Windows/Mac "send `everifymo://` links to this app." Dev mode
needs extra arguments so Windows knows how to relaunch our specific dev
setup; a packaged, installed app doesn't need the extra info.

### Preventing duplicate windows
```javascript
const gotLock = app.requestSingleInstanceLock()
```
Only one copy of the app should run. If a link is clicked while the app
is already open, Windows tries to launch a second copy — this stops that
and instead fires a `second-instance` event we listen for.

### Two different events, for two operating systems
- **`second-instance`** (Windows/Linux) — fires when the app was already
  running and a link was clicked again.
- **`open-url`** (Mac) — fires for both "already running" and "just
  launched" cases, in one event.

We also added a check right when the app starts (`process.argv`), to
catch the case where the link itself is what launched the app in the
first place (cold start) — `second-instance` alone doesn't cover this,
since there's no "first instance" yet to signal.

### Extracting the token and delivering it to React
```javascript
function handleDeepLink(url) {
  const token = new URL(url).searchParams.get('token')
  if (mainWindow) {
    mainWindow.webContents.send('deep-link-token', token)
  } else {
    pendingDeepLink = token
  }
}
```
`new URL(url).searchParams.get('token')` pulls just the token value out
of the full link. If our window isn't ready yet, we stash the token in
`pendingDeepLink` and deliver it once `did-finish-load` fires (added
inside `createWindow()`), confirming React has actually loaded.

---

## 3. `preload.cjs` — The Bridge Between Electron and React

React runs in a security-sandboxed environment (`contextIsolation: true`
in `main.js`) and can't directly use Electron's tools like `ipcRenderer`.
A preload script is the one narrow, safe bridge allowed to cross that
boundary.

```javascript
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  onDeepLinkToken: (callback) => {
    ipcRenderer.on('deep-link-token', (event, token) => callback(token))
  }
})
```

This exposes exactly one function, `window.electronAPI.onDeepLinkToken`,
to React — nothing else from Electron leaks through. The string
`'deep-link-token'` here must exactly match the string used in
`main.js`'s `.send('deep-link-token', ...)` calls.

### A build problem we hit, and how it was fixed
This project uses `"type": "module"` (modern `import`/`export` style)
everywhere, but Electron preload scripts must always load as older-style
CommonJS (`require`), with no exceptions. Our bundler kept compiling the
preload file into the wrong format. The fix, in `vite.config.js`:

```javascript
electron([
  { entry: 'src/electron/main.js' },
  {
    entry: 'src/electron/preload.cjs',
    vite: {
      build: {
        lib: {
          entry: 'src/electron/preload.cjs',
          formats: ['cjs'],
          fileName: () => 'preload.cjs',
        },
        rollupOptions: { external: ['electron'] },
      },
    },
  },
]),
```
`lib` mode with `formats: ['cjs']` forces genuine CommonJS output, and
`fileName` makes sure the compiled file keeps the `.cjs` extension.
`external: ['electron']` tells the bundler not to try bundling Electron
itself into the file.

---

## 4. Testing Without Windows' Real Protocol Click

Windows' protocol registration behaves inconsistently while running
`npm run dev` (as opposed to a real, packaged, installed app) — this is
a known rough edge, not a bug in our own code. Chasing a perfectly
working real click in dev mode wasn't worth the time, so instead we
verify the same code path directly:

```javascript
app.whenReady().then(() => {
  createWindow()
  // TEMPORARY — simulates a deep link for testing
  setTimeout(() => {
    handleDeepLink('everifymo://complete-registration?token=SOME_TEST_TOKEN')
  }, 2000)
})
```

This calls the exact same `handleDeepLink` function a real click would
trigger — it only skips the "Windows launches the app" part, which is
expected to work correctly once the app is actually packaged (a real
installed app has one clear, direct `.exe`, unlike dev mode's indirect
launch through `node_modules`). **Remove this block before packaging.**

---

## 5. `App.jsx` — the `DeepLinkListener` Component

```javascript
function DeepLinkListener() {
  const navigate = useNavigate()

  useEffect(() => {
    window.electronAPI.onDeepLinkToken((token) => {
      fetch(`https://everify.store/registration/validate/${token}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.status === 'valid') {
            navigate('/user-registration', { state: { ...data, invite_token: token } })
          } else {
            navigate('/invitation-status', { state: { status: data.status, invite_token: token } })
          }
        })
    })
  }, [])

  return null
}
```

- `useEffect(..., [])` — runs this setup exactly once, when the app
  first loads (the empty `[]` means "no dependencies, never re-run").
- Listens for a token via the bridge from `preload.cjs`.
- Calls the backend's `validate` endpoint.
- If `valid`, navigates to the registration form, carrying the officer's
  data (email/role/region) plus the original token forward as page state.
- Otherwise, navigates to one shared status page, passing along which
  specific failure state it is.

This component is mounted once, inside `<BrowserRouter>`, alongside
`<Routes>` — it renders nothing visible itself, it just listens in the
background regardless of which page is currently showing.

### A CORS problem we hit
The React app (`localhost:5173`) and the backend (`localhost:8000`) are
different origins as far as the browser is concerned, even both being
"localhost." Browsers block a page from reading responses from a
different origin unless that origin explicitly allows it. Fixed in
`main.py`:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 6. `user-registration-form.jsx` — Reading Real Data

```javascript
const location = useLocation()
const officerData = location.state || {}
```
`useLocation()` reads whatever data `navigate(...)` carried over. The
form's read-only fields (`email`, `agency`, `region`) now display
`officerData.email`, `officerData.role`, `officerData.region_name`
directly — falling back to `''` to avoid a React warning about inputs
switching between "no value yet" and "a real value" partway through.

`handleSubmit` was updated to actually call the backend instead of just
showing the success screen immediately:
```javascript
fetch('https://everify.store/registration/complete', { ... })
  .then((res) => {
    if (!res.ok) throw new Error('Submission failed')
    return res.json()
  })
  .then(() => setSubmitted(true))
  .catch((error) => {
    console.error(error)
    alert('Something went wrong submitting your registration. Please try again.')
  })
```
Checking `res.ok` matters — `fetch` does **not** treat a `404`/`409`/
`400` response as a failure on its own; without this check, the success
screen would show even when the backend rejected the submission.

---

## 7. `invitation-status.jsx` — One Page, Three States

Originally built with a hardcoded local status for preview purposes.
Updated to receive the real status from `DeepLinkListener`:

```javascript
const location = useLocation()
const { status: linkStatus, invite_token } = location.state || {}
```

The three states shown are `expired`, `invalid`, and `used` (renamed
from an original `completed`, to match the backend's actual wording
exactly and avoid confusion between two different meanings of
"completed").

### The "Request New Invitation" flow — two separate actions
Originally, clicking this button was going to immediately generate a
new token. That was changed: the officer's click should only **flag** a
request — the SuperAdmin decides whether to actually send a new invite.
This needed a new column and a new endpoint:

**New column**, `account_invitation_tokens.resend_requested_at`
(nullable timestamp — `NULL` means no request made yet).

**New endpoint**, `POST /registration/request-resend` — checks the
token is expired and unused, then just sets `resend_requested_at = NOW()`.
No new token is generated here.

**The existing `POST /registration/resend-invite`** endpoint (built
earlier, generates a real new token) was *not* removed or changed — it's
still fully intact in the same file, but it's now called from the
**SuperAdmin's** side instead of the officer's page.

```javascript
buttonAction: () => {
    fetch('https://everify.store/registration/request-resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_token }),
    })
        .then((res) => {
            if (!res.ok) throw new Error('Request failed')
            return res.json()
        })
        .then(() => setRequested(true))
        .catch(() => alert('Something went wrong. Please contact your administrator directly.'))
},
```
Once `requested` becomes `true`, the button hides itself
(`showButton: !requested`) and a confirmation message shows in its place.

---

## 8. Manual Test Data Used Tonight

Since the SuperAdmin stub-creation endpoint isn't finished yet, testing
continued using manually inserted rows in pgAdmin:
- Multiple stub `users` rows with `status = 'invited'`
- Matching `account_invitation_tokens` rows — some valid, some
  deliberately backdated to already be expired, used to test each of
  the three status pages individually

---

## 9. Current End-to-End Status

**Fully working and tested, via the temporary `setTimeout` simulation:**
- Valid token → registration form loads, pre-filled correctly → submits
  successfully → `pending_approval` confirmed in the database
- Expired token → status page shows correctly → "Request New Invitation"
  → `resend_requested_at` confirmed set in the database
- (Used/invalid states wired the same way, sharing the same page)

**Deliberately deferred to packaging time:**
- Genuine OS-level click on a real `everifymo://` link, while running in
  dev mode — this is a known rough edge specific to how Windows handles
  protocol registration for apps not yet installed as a real, packaged
  application. The same code is expected to work normally once packaged.

---

## What's Next

- Pull in the SuperAdmin stub-creation + token-generation + email-sending
  work from the teammate handling that part
- Verify her token/column values match exactly what this side expects
  (status strings, role strings, token format, deep-link URL format)
- Full real integration test using an actual SuperAdmin-generated token,
  instead of manually inserted test data
- Eventually: remove the temporary `setTimeout` simulation from `main.js`
  before packaging