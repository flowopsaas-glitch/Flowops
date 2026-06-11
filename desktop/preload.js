const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("flowopsDesktop", {
  isDesktop: true
});