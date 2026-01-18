const { app, BrowserWindow, ipcMain, desktopCapturer, Menu, screen, globalShortcut, shell } = require('electron');
const path = require('path');
const { mouse, keyboard, straightTo, Point } = require('@nut-tree-fork/nut-js');
const sessionManager = require('./src/utils/sessionManager');
const configManager = require('./src/utils/configManager');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Config
let genAI = null;
let model = null;

function initAI() {
    const apiKey = configManager.getApiKey();
    if (apiKey) {
        try {
            genAI = new GoogleGenerativeAI(apiKey);
            model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            console.log("Gemini AI Initialized");
        } catch (e) {
            console.error("Failed to init AI:", e);
        }
    }
}

// Reduce delay for real-time control
mouse.config.autoDelayMs = 0;
keyboard.config.autoDelayMs = 0;

let mainWindow;
let overlayWindow;
let mousePollInterval = null;

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'assets/icon.png')
    });

    Menu.setApplicationMenu(null);
    mainWindow.maximize();
    mainWindow.loadFile('src/ui/index.html');

    const { systemPreferences } = require('electron');

    // Auto-grant permissions
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            return callback(true);
        }
        callback(false);
    });

    // MacOS explicit permission check
    if (process.platform === 'darwin') {
        const checkPerms = async () => {
            const micStatus = systemPreferences.getMediaAccessStatus('microphone');
            if (micStatus === 'not-determined') {
                await systemPreferences.askForMediaAccess('microphone');
            }
        };
        checkPerms();
    }

    // Mouse polling logic
    startMousePolling = function () {
        if (mousePollInterval) clearInterval(mousePollInterval);
        mousePollInterval = setInterval(async () => {
            try {
                const pos = await mouse.getPosition();
                // ONLY send if overlay is actually visible to avoid overhead
                if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
                    overlayWindow.webContents.send('update-mouse-pos', pos);
                }
            } catch (e) { }
        }, 16);
    };

    stopMousePolling = function () {
        if (mousePollInterval) {
            clearInterval(mousePollInterval);
            mousePollInterval = null;
        }
    };

    mainWindow.on('closed', () => {
        mainWindow = null;
        app.quit();
    });
}

function createOverlayWindow() {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x, y, width, height } = primaryDisplay.bounds;

    overlayWindow = new BrowserWindow({
        x: 0,
        y: 0,
        width: width,
        height: height,
        transparent: true,
        frame: false,
        fullscreen: false, // DISABLED INITIAL FULLSCREEN
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        resizable: false,
        movable: false,
        focusable: false,
        type: 'splash', // 'splash' often covers everything including panels
        show: false, // DOUBLE CHECK: Hide on creation
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    overlayWindow.loadFile('src/overlay/overlay.html');
    overlayWindow.hide(); // Visual enforcement

    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    setInterval(() => {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
            overlayWindow.setIgnoreMouseEvents(true, { forward: true });
        }
    }, 1000);
}


app.whenReady().then(() => {
    createMainWindow();
    createOverlayWindow();

    globalShortcut.register('CommandOrControl+C', () => {
        console.log('Emergency Stop');
        if (sessionManager.currentSession) sessionManager.stopSession(false);
        app.quit();
    });

    ipcMain.handle('get-sources', async () => {
        try {
            const sources = await desktopCapturer.getSources({ types: ['screen'] });
            return sources;
        } catch (e) {
            console.error(e);
            return [];
        }
    });

    // Input simulation
    ipcMain.on('simulate-input', async (event, data) => {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.bounds;

        try {
            if (data.type === 'mousemove') {
                const x = Math.round(data.x * width);
                const y = Math.round(data.y * height);
                await mouse.setPosition(new Point(x, y));
            } else if (data.type === 'mousedown') {
                await mouse.pressButton(Button.LEFT);
            } else if (data.type === 'mouseup') {
                await mouse.releaseButton(Button.LEFT);
            } else if (data.type === 'keydown') {
                if (data.key.length === 1) await keyboard.type(data.key);
                else {
                    const map = { 'Enter': Key.Enter, 'Backspace': Key.Backspace, 'Space': Key.Space };
                    if (map[data.key]) await keyboard.pressKey(map[data.key]);
                }
            } else if (data.type === 'keyup') {
                if (data.key.length !== 1) {
                    const map = { 'Enter': Key.Enter, 'Backspace': Key.Backspace, 'Space': Key.Space };
                    if (map[data.key]) await keyboard.releaseKey(map[data.key]);
                }
            }
        } catch (err) { }
    });

    // Session Management
    ipcMain.handle('get-sessions', () => {
        return sessionManager.getAllSessions();
    });

    ipcMain.handle('open-session-folder', (event, path) => {
        sessionManager.openSessionFolder(path);
    });

    ipcMain.handle('show-item-in-folder', (event, filePath) => {
        if (filePath) shell.showItemInFolder(filePath);
    });

    ipcMain.handle('save-recording', async (event, buffer) => {
        const filePath = sessionManager.getRecordingPath();
        if (filePath) {
            const fs = require('fs');
            try {
                await fs.promises.writeFile(filePath, Buffer.from(buffer));
                console.log('Session recording saved:', filePath);
                return filePath;
            } catch (err) {
                console.error("Save failed:", err);
            }
        }
        return null;
    });

    ipcMain.on('overlay-notification', (event, message) => {
        if (overlayWindow) {
            overlayWindow.webContents.send('show-notification', message);
            sessionManager.addMessage(message); // Log message to metadata
        }
    });

    ipcMain.on('start-session', () => {
        sessionManager.startNewSession(); // Create folders
        if (overlayWindow) {
            console.log("Starting session: showing overlay");
            // Force Update
            overlayWindow.setFullScreen(true);
            overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
            overlayWindow.setAlwaysOnTop(true, 'screen-saver');
            overlayWindow.show();

            // Backend Initial Message (AI Powered)
            setTimeout(async () => {
                let greeting = "I'm Mr. Meeseeks! Look at me!";
                if (model) {
                    try {
                        const result = await model.generateContent("You are Mr. Meeseeks from Rick and Morty. Generate a short, enthusiastic, 1-sentence greeting to start a remote control task. Do not use quotes.");
                        const response = await result.response;
                        greeting = response.text().trim();
                    } catch (e) {
                        console.error("AI Generation failed:", e);
                    }
                }
                overlayWindow.webContents.send('type-message', greeting);
            }, 500);

            if (startMousePolling) startMousePolling();
        }
    });

    ipcMain.on('stop-session', () => {
        sessionManager.stopSession(true); // End metadata
        if (overlayWindow) {
            overlayWindow.hide();
            if (stopMousePolling) stopMousePolling();
            if (mainWindow) mainWindow.restore();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// IPC: Save API Key
ipcMain.handle('save-api-key', (event, key) => {
    if (!key || key.trim() === "") return false;
    const success = configManager.saveApiKey(key.trim());
    if (success) {
        initAI(); // Re-init
        return true;
    }
    return false;
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
