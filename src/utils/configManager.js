const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), 'Mr-Meeseeks');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

// Ensure directory exists
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

const ConfigManager = {
    getConfigPath() {
        return CONFIG_PATH;
    },

    saveApiKey(key) {
        let config = {};
        if (fs.existsSync(CONFIG_PATH)) {
            try {
                config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            } catch (e) {
                console.error("Failed to read config:", e);
            }
        }
        config.apiKey = key;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        return true;
    },

    getApiKey() {
        if (!fs.existsSync(CONFIG_PATH)) return null;
        try {
            const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
            return config.apiKey || null;
        } catch (e) {
            console.error("Failed to read config:", e);
            return null;
        }
    },

    hasApiKey() {
        return !!this.getApiKey();
    }
};

module.exports = ConfigManager;
