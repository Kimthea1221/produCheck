import { app, BrowserWindow, Menu } from 'electron'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.name = 'ICMDA'

let mainWindow = null        // reference to our window, so other functions can reach it
let mainWindowReady = false  // ADDED - tracks whether the page has actually finished loading
let pendingDeepLink = null   // holds a token if it arrives before the window is ready

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'ICMDA',
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),   // This tells Electron "run this specific file as the bridge before loading React"
    }
  })

  // Open DevTools
  // mainWindow.webContents.openDevTools();

  // Stash the token here if it arrives before React has finished loading and
  // listening — we'll deliver it below, once did-finish-load confirms React is ready.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindowReady = true   // ADDED
    if (pendingDeepLink) {
      mainWindow.webContents.send('deep-link-token', pendingDeepLink)
      pendingDeepLink = null
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

// Register our custom protocol so the OS knows to send icmda:// links to us
// Tell the OS: send icmda:// links to this app
console.log('argv:', process.argv)
console.log('execPath:', process.execPath)

if (process.env.VITE_DEV_SERVER_URL) {
  // Dev mode needs extra info so Windows knows how to relaunch our dev setup
  app.setAsDefaultProtocolClient('icmda', process.execPath, [path.resolve(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient('icmda')
}

// Prevent a second copy of the app opening when a link is clicked while we're already running
// Only one copy of the app should ever run at once
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()  // Another copy is already running — quit this redundant one immediately
} else {
  // Windows/Linux: app was already running, link was clicked again
  app.on('second-instance', (event, argv) => {
    const url = argv.find((arg) => arg.startsWith('icmda://'))
    if (url) handleDeepLink(url)
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    createWindow()

    // Windows/Linux: app was fully closed, this link is what launched it
    const launchUrl = process.argv.find((arg) => arg.startsWith('icmda://'))
    if (launchUrl) handleDeepLink(launchUrl)
  })
}

// temporary testing TT remove before packaging or handing off
/* app.whenReady().then(() => {
  createWindow()

  setTimeout(() => {
    handleDeepLink('icmda://complete-registration?token=EcPq1fqtWgzsHGzoslG_71rue-OzKgkn9WBvrooQ2Ac')
  }, 2000)
}) */


// Mac: fires for both cold-start and already-running cases
// Mac: one event covers both "already open" and "just launched" cases
app.on('open-url', (event, url) => {
  handleDeepLink(url)
})

// Pulls the token out of the link, then sends it to React (or stashes it if too early)
function handleDeepLink(url) {
  const token = new URL(url).searchParams.get('token')

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }

  if (mainWindow && mainWindowReady) {
    mainWindow.webContents.send('deep-link-token', token)
  } else {
    pendingDeepLink = token
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})