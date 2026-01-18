const startSetupBtn = document.getElementById('startSetupBtn');
const allowScreenBtn = document.getElementById('allowScreenBtn');
const allowMicBtn = document.getElementById('allowMicBtn');
const skipMicBtn = document.getElementById('skipMicBtn');
const recordBtn = document.getElementById('recordBtn');
const endSessionBtn = document.getElementById('endSessionBtn');
const video = document.getElementById('screenVideo');

const views = {
    welcome: document.getElementById('welcomeView'),
    permScreen: document.getElementById('permScreenView'),
    permMic: document.getElementById('permMicView'),
    config: document.getElementById('configView'),
    session: document.getElementById('sessionView')
};

let mediaStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

function showView(name) {
    Object.values(views).forEach(el => el.classList.remove('active'));
    views[name].classList.add('active');
}

// flow
startSetupBtn.addEventListener('click', () => {
    showView('permScreen');
});

allowScreenBtn.addEventListener('click', async () => {
    try {
        const sources = await window.electronAPI.getSources();
        const source = sources[0]; // Simplified for MVP

        if (!source) throw new Error("No source");

        const constraints = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id
                }
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        mediaStream = stream;
        video.srcObject = stream;

        showView('permMic');
    } catch (e) {
        console.error("Screen perm failed:", e);
        // Retry or alert
        alert("Failed to get screen permission.");
    }
});

allowMicBtn.addEventListener('click', async () => {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        startSessionAndRecord();
    } catch (err) {
        console.warn("Microphone access failed:", err);
        // Only show alert if it's a permission issue that determines functionality
        // user seems annoyed by it, so let's log it to metadata instead of blocking alert if possible
        // but we need to tell them voice won't work.
        // Let's make the alert more informative or auto-dismiss.
        // Or just change the text as user requested.
        let msg = "Microphone access denied or not found.";
        if (err.name === 'NotFoundError') msg = "No microphone found.";
        else if (err.name === 'NotAllowedError') msg = "Microphone permission denied.";

        await showCustomAlert(`${msg} Continuing without voice.`);
        // Proceed without audio
        startSessionAndRecord();
    }
});

skipMicBtn.addEventListener('click', () => {
    startSessionAndRecord();
});

// Config Logic
window.electronAPI.onRequestApiKey(() => {
    // If key is missing, show config view instead of welcome or after setup
    // Ideally check this before enabling start.
    // For now, if we get this on load, switch to it.
    console.log("API Key requested");
    showView('config');
});

const saveKeyBtn = document.getElementById('saveApiKeyBtn');
const apiKeyInput = document.getElementById('apiKeyInput');
const aiStudioLink = document.getElementById('openAiStudioLink');

if (aiStudioLink) {
    aiStudioLink.addEventListener('click', (e) => {
        e.preventDefault();
        // Open browser
        // We need an openExternal exposed or just use standard window.open if allowed?
        // Electron renderer usually blocks new windows.
        // Let's rely on standard anchor if target blank?
        // Actually best to use shell.popenExternal from main or similar.
        // Since we didn't expose openExternal, let's assume user can copy paste or we use the `openSessionFolder` hack? No.
        // Just let them type it.
        // Or if we want to be helpful:
        window.open('https://aistudio.google.com/app/apikey', '_blank');
    });
}

if (saveKeyBtn) {
    saveKeyBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value;
        if (!key) return alert("Please enter a key!");

        saveKeyBtn.innerText = "Verifying...";
        saveKeyBtn.disabled = true;

        const success = await window.electronAPI.saveApiKey(key);
        if (success) {
            // Key saved, go back to welcome
            showView('welcome');
            alert("Configuration Saved!");
        } else {
            alert("Failed to save key. Please try again.");
            saveKeyBtn.innerText = "Save Configuration";
            saveKeyBtn.disabled = false;
        }
    });
}

function startSessionAndRecord() {
    startSession();
    // Auto-record
    if (mediaStream && !isRecording) {
        startRecording();
        recordBtn.innerText = "Stop Recording";
        recordBtn.style.color = "#ef4444";
    }
}

function startSession() {
    showView('session');
    if (mediaStream) video.play();
    window.electronAPI.startSession(); // Show overlay
}

// End Session
endSessionBtn.addEventListener('click', async () => {
    // 1. Stop Recording (triggers save via onstop)
    if (isRecording) {
        endSessionBtn.innerText = "Finishing...";
        endSessionBtn.style.opacity = "0.7";
        stopRecording();
    } else {
        // Fallback if not recording
        window.electronAPI.stopSession();
        showView('welcome');
    }

    // 2. Stop Stream
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
    window.electronAPI.stopSession(); // Hide overlay
    showView('welcome');
});

// Session Management Setup
const mockTasks = [
    { title: "Daily Report Generation", time: "Tomorrow, 09:00 AM", status: "pending" },
    { title: "System Cleanup", time: "Friday, 11:00 PM", status: "pending" }
];

async function loadSessions() {
    const list = document.getElementById('sessionList');
    if (!list) return;
    list.innerHTML = ''; // Clear

    try {
        constsessions = await window.electronAPI.getSessions();
        if (!sessions || sessions.length === 0) {
            list.innerHTML = '<div style="color: var(--text-muted); padding: 2rem; text-align: center;">No recorded sessions</div>';
        } else {
            sessions.forEach(sess => {
                const item = document.createElement('div');
                item.className = 'list-item';

                // Formats
                const dateObj = new Date(sess.startTime);
                const dateStr = dateObj.toLocaleDateString();
                const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const statusClass = sess.status === 'completed' ? 'status-completed' : 'status-failed';

                item.innerHTML = `
                    <div class="item-info">
                        <div class="item-title">${dateStr}</div>
                        <div class="item-meta">
                            ${timeStr}
                            <span class="status-dot ${statusClass}"></span>
                            ${sess.status}
                        </div>
                    </div>
                    <button class="action-sm-btn open-folder-btn" data-path="${sess.path.replace(/\\/g, '\\\\')}">Open</button>
                `;
                list.appendChild(item);
            });
        }

        // Add listeners
        document.querySelectorAll('.open-folder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                window.electronAPI.openSessionFolder(e.target.dataset.path);
            });
        });

    } catch (e) {
        console.error("Failed to load sessions", e);
        list.innerHTML = '<div style="color: #ef4444; padding: 1rem; text-align: center;">Error loading history</div>';
    }
}

// Mock Load Tasks
function loadTasks() {
    const taskList = document.getElementById('scheduledTaskList');
    if (!taskList) return;
    taskList.innerHTML = '';

    mockTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
             <div class="item-info">
                <div class="item-title">${task.title}</div>
                <div class="item-meta">
                    <span class="status-dot status-pending"></span>
                    ${task.time}
                </div>
            </div>
            <button class="action-sm-btn">Edit</button>
        `;
        taskList.appendChild(item);
    });
}

// Initial Load
loadSessions();
loadTasks();

// Recording Logic
recordBtn.addEventListener('click', () => {
    if (!mediaStream) return;

    if (!isRecording) {
        startRecording();
        recordBtn.innerText = "Stop Recording";
        recordBtn.style.color = "#ef4444";
    } else {
        stopRecording();
        recordBtn.innerText = "Record";
        recordBtn.style.color = "white";
    }
});

function startRecording() {
    recordedChunks = [];
    const mimeTypes = ['video/webm; codecs=vp9', 'video/webm; codecs=vp8', 'video/webm'];
    let mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'video/webm';

    mediaRecorder = new MediaRecorder(mediaStream, { mimeType });
    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm; codecs=vp9' });
        const buffer = await blob.arrayBuffer();

        // Disable button while saving
        const endBtn = document.getElementById('endSessionBtn');
        if (endBtn) {
            endBtn.disabled = true;
            endBtn.innerText = "Saving...";
        }

        const filePath = await window.electronAPI.saveRecording(buffer);

        if (filePath) {
            // Open the folder where it was saved
            // We can assume session folder is parent of filePath
            // or just use the session ID if we had it. 
            // Actually openSessionFolder takes a path to the folder. 
            // sessionManager.getRecordingPath() returns full file path.
            // Let's assume we can pass the file or parent dir.
            // But openSessionFolder in main.js calls shell.openPath(path).
            // Opening the file itself might play it. Opening folder is better.
            // Let's construct folder path or ask backend.
            // Actually, let's just use the exposed openSessionFolder with the directory.
            // We don't have the directory explicitly here, but we can assume it's valid to pass the file and shell.showItemInFolder is better, 
            // BUT we only exposed `openSessionFolder` which uses `openPath`.
            // Let's stick to `loadSessions` relying on backend.
            // Wait, use a new IPC or just rely on the user finding it? 
            // user request: "show where it is".
            // I'll add a specific `showItemInFolder` or similar.
            // For now, let's just reload sessions.
            await loadSessions();

            // hack: get the path of the last session? 
            // Or just use the fact that we know where we saved it.
            // Actually, let's update preload/main to support showing the file.
        }

        // Show file location
        await window.electronAPI.showItemInFolder(filePath);

        showView('welcome');

        if (endBtn) {
            endBtn.disabled = false;
            endBtn.innerText = "End Session";
        }
    };
    mediaRecorder.start();
    isRecording = true;
    window.electronAPI.showNotification('Recording Started');
}

function stopRecording() {
    if (mediaRecorder) {
        mediaRecorder.stop();
    }
    isRecording = false;
}

// Input Mapping (Existing)
video.addEventListener('mousemove', (e) => {
    if (!mediaStream) return;
    const rect = video.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const normX = x / rect.width;
    const normY = y / rect.height;

    if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
        window.electronAPI.simulateInput({ type: 'mousemove', x: normX, y: normY });
    }
});

video.addEventListener('mousedown', () => window.electronAPI.simulateInput({ type: 'mousedown' }));
video.addEventListener('mouseup', () => window.electronAPI.simulateInput({ type: 'mouseup' }));
window.addEventListener('keydown', (e) => {
    if (views.session.classList.contains('active')) {
        window.electronAPI.simulateInput({ type: 'keydown', key: e.key });
    }
});
window.addEventListener('keyup', (e) => {
    if (views.session.classList.contains('active')) {
        window.electronAPI.simulateInput({ type: 'keyup', key: e.key });
    }
});
