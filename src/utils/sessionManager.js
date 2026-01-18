const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');

class SessionManager {
    constructor() {
        this.baseDir = path.join(app.getPath('home'), 'Mr-Meeseeks', 'sessions');
        this.currentSession = null;
    }

    // Initialize session structure
    startNewSession() {
        // Create base Dir
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }

        const now = new Date();
        const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const dateDir = path.join(this.baseDir, dateStr);

        if (!fs.existsSync(dateDir)) {
            fs.mkdirSync(dateDir, { recursive: true });
        }

        // Find next numeric prefix
        const existing = fs.readdirSync(dateDir);
        let nextNum = 1;
        existing.forEach(name => {
            const num = parseInt(name);
            if (!isNaN(num) && num >= nextNum) nextNum = num + 1;
        });
        const prefix = String(nextNum).padStart(4, '0');

        const sessionPath = path.join(dateDir, prefix);
        fs.mkdirSync(sessionPath, { recursive: true });

        this.currentSession = {
            id: `${dateStr}_${prefix}`,
            path: sessionPath,
            startTime: now.toISOString(),
            messages: []
        };

        this.saveMetadata({ status: 'active' });
        return this.currentSession;
    }

    addMessage(msg) {
        if (this.currentSession) {
            this.currentSession.messages.push({
                timestamp: new Date().toISOString(),
                content: msg
            });
            this.saveMetadata({ status: 'active' });
        }
    }

    async stopSession(success = true) {
        if (this.currentSession) {
            const metadata = {
                status: success ? 'completed' : 'failed',
                endTime: new Date().toISOString(),
                duration: (new Date() - new Date(this.currentSession.startTime)) / 1000
            };
            this.saveMetadata(metadata);

            // Return path for notifications/UI
            const p = this.currentSession.path;
            this.currentSession = null;
            return p;
        }
        return null;
    }

    saveMetadata(update = {}) {
        if (!this.currentSession) return;

        const fullData = { ...this.currentSession, ...update };
        fs.writeFileSync(
            path.join(this.currentSession.path, 'metadata.json'),
            JSON.stringify(fullData, null, 2)
        );
    }

    getRecordingPath() {
        if (!this.currentSession) return null;
        return path.join(this.currentSession.path, 'recording.webm');
    }

    // Get all sessions for UI list
    getAllSessions() {
        if (!fs.existsSync(this.baseDir)) return [];

        const sessions = [];
        const dates = fs.readdirSync(this.baseDir).reverse(); // Newest dates first (naive)

        dates.forEach(date => {
            const datePath = path.join(this.baseDir, date);
            if (!fs.statSync(datePath).isDirectory()) return;

            const runs = fs.readdirSync(datePath).reverse();
            runs.forEach(run => {
                const runPath = path.join(datePath, run);
                const metaPath = path.join(runPath, 'metadata.json');
                if (fs.existsSync(metaPath)) {
                    try {
                        const meta = JSON.parse(fs.readFileSync(metaPath));
                        sessions.push(meta);
                    } catch (e) { }
                }
            });
        });
        return sessions.slice(0, 10); // Return top 10 recent
    }

    openSessionFolder(sessionPath) {
        shell.openPath(sessionPath);
    }
}

module.exports = new SessionManager();
