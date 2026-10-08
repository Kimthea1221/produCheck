import { BrowserWindow, Menu, app } from "electron";
import { fileURLToPath } from "url";
import path from "path";
//#region src/electron/main.js
var __dirname = path.dirname(fileURLToPath(import.meta.url));
var mainWindow = null;
var mainWindowReady = false;
var pendingDeepLink = null;
function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, "preload.cjs")
		}
	});
	mainWindow.webContents.on("did-finish-load", () => {
		mainWindowReady = true;
		if (pendingDeepLink) {
			mainWindow.webContents.send("deep-link-token", pendingDeepLink);
			pendingDeepLink = null;
		}
	});
	if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
	else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
}
console.log("argv:", process.argv);
console.log("execPath:", process.execPath);
if (process.env.VITE_DEV_SERVER_URL) app.setAsDefaultProtocolClient("icmda", process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient("icmda");
if (!app.requestSingleInstanceLock()) app.quit();
else {
	app.on("second-instance", (event, argv) => {
		const url = argv.find((arg) => arg.startsWith("icmda://"));
		if (url) handleDeepLink(url);
	});
	app.whenReady().then(() => {
		Menu.setApplicationMenu(null);
		createWindow();
		const launchUrl = process.argv.find((arg) => arg.startsWith("icmda://"));
		if (launchUrl) handleDeepLink(launchUrl);
	});
}
app.on("open-url", (event, url) => {
	handleDeepLink(url);
});
function handleDeepLink(url) {
	const token = new URL(url).searchParams.get("token");
	if (mainWindow) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.show();
		mainWindow.focus();
	}
	if (mainWindow && mainWindowReady) mainWindow.webContents.send("deep-link-token", token);
	else pendingDeepLink = token;
}
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
//#endregion
export {};
