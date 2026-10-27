//#region src/electron/preload.cjs
var { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("electronAPI", { onDeepLinkToken: (callback) => {
	const listener = (event, token) => callback(token);
	ipcRenderer.on("deep-link-token", listener);
	return () => ipcRenderer.removeListener("deep-link-token", listener);
} });
//#endregion
