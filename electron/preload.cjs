const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('englishClipDesktop', {
  isDesktop: true,
})
