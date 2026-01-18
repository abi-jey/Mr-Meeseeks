const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getSources: () => ipcRenderer.invoke('get-sources'),
    simulateInput: (data) => ipcRenderer.send('simulate-input', data),
    showNotification: (message) => ipcRenderer.send('overlay-notification', message),
    saveRecording: (buffer) => ipcRenderer.invoke('save-recording', buffer),
    onShowNotification: (callback) => ipcRenderer.on('show-notification', (_event, value) => callback(value)),

    // Phase 2
    startSession: () => ipcRenderer.send('start-session'),
    stopSession: () => ipcRenderer.send('stop-session'),
    onUpdateMousePos: (callback) => ipcRenderer.on('update-mouse-pos', (_event, value) => callback(value)),

    // Session Management
    getSessions: () => ipcRenderer.invoke('get-sessions'),
    openSessionFolder: (path) => ipcRenderer.invoke('open-session-folder', path),

    // Message Box Control
    onToggleMessageBox: (callback) => ipcRenderer.on('toggle-message-box', (_event, shouldShow) => callback(shouldShow)),
    onTypeMessage: (callback) => ipcRenderer.on('type-message', (_event, text) => callback(text)),

    // File System
    showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path),

    // Config
    onRequestApiKey: (callback) => ipcRenderer.on('request-api-key', () => callback()),
    saveApiKey: (key) => ipcRenderer.invoke('save-api-key', key)
});
