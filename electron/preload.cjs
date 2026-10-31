const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  selectPdf: () => ipcRenderer.invoke("pdf:select"),
  registerDroppedPdf: (file) =>
    ipcRenderer.invoke("pdf:register-drop", webUtils.getPathForFile(file)),
  convertPdf: (options) => ipcRenderer.invoke("audio:convert", options),
  readAudio: (audioId) => ipcRenderer.invoke("audio:read", audioId),
  revealAudio: (audioId) => ipcRenderer.invoke("audio:reveal", audioId),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("audio:progress", listener);
    return () => ipcRenderer.removeListener("audio:progress", listener);
  },
});
