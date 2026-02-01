/**
 * Main Application
 * Initializes and coordinates all components
 */

// Global instances
let canvasManager;
let wsManager;
let remoteCursors = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing Collaborative Canvas Application...');
    
    // Initialize canvas
    canvasManager = new CanvasManager('drawingCanvas');
    
    // Initialize WebSocket
    wsManager = new WebSocketManager();
    
    // Connect canvas events to WebSocket
    setupCanvasWebSocketIntegration();
    
    // Setup UI controls
    setupUIControls();
    
    // Setup WebSocket callbacks
    setupWebSocketCallbacks();
    
    // Connect to server
    wsManager.connect();
    
    console.log('Application initialized successfully!');
});

// Integrate canvas drawing with WebSocket
function setupCanvasWebSocketIntegration() {
    // When user draws, emit to server
    canvasManager.onDraw = (data) => {
        wsManager.emitDrawing(data);
    };
    
    canvasManager.onDrawStart = (data) => {
        wsManager.emitDrawing({ ...data, type: 'start' });
    };
    
    canvasManager.onDrawEnd = (data) => {
        wsManager.emitDrawing({ ...data, type: 'end' });
    };
    
    // When user moves cursor, emit to server (throttled)
    let lastCursorEmit = 0;
    canvasManager.onCursorMove = (position) => {
        const now = Date.now();
        if (now - lastCursorEmit > 50) { // Throttle to 20 times per second
            wsManager.emitCursorMove(position);
            lastCursorEmit = now;
        }
    };
}

// Setup WebSocket event callbacks
function setupWebSocketCallbacks() {
    // Handle remote drawing
    wsManager.onRemoteDrawing = (data) => {
        if (data.fromX !== undefined) {
            canvasManager.drawRemoteStroke(data);
        }
    };
    
    // Handle remote cursor movement
    wsManager.onRemoteCursor = (data) => {
        updateRemoteCursor(data.userId, data.x, data.y, data.color, data.userName);
    };
    
    // Handle user list updates
    wsManager.onUserListUpdate = (users) => {
        const previousCount = document.getElementById('onlineUsers').children.length;
        updateOnlineUsers(users);
        
        // Show notification for user join/leave
        if (users.length > previousCount) {
            showToast('A new user joined the canvas!', 'success');
        } else if (users.length < previousCount) {
            showToast('A user left the canvas', 'info');
        }
    };
    
    // Handle clear canvas
    wsManager.onClearCanvas = () => {
        canvasManager.clearCanvas();
        showToast('Canvas cleared', 'info');
    };
    
    // Handle initialization
    wsManager.onInit = (data) => {
        showToast(`Welcome! You are ${data.name}`, 'success');
        console.log('User initialized:', data.userId);
    };
    
    // Handle canvas redraw (for undo/redo)
    wsManager.onRedrawCanvas = (actions) => {
        // Clear canvas
        canvasManager.clearCanvas();
        
        // Redraw all actions from history
        actions.forEach(action => {
            if (action.data && action.data.path) {
                canvasManager.drawPath(
                    action.data.path,
                    action.data.color,
                    action.data.width,
                    action.data.tool
                );
            }
        });
    };
    
    // Handle history updates
    wsManager.onHistoryUpdate = (data) => {
        updateHistoryButtons(data.historyCount, data.redoCount);
    };
}

// Setup UI controls (buttons, inputs, etc.)
function setupUIControls() {
    // Tool buttons
    const brushBtn = document.getElementById('brushBtn');
    const eraserBtn = document.getElementById('eraserBtn');
    
    brushBtn.addEventListener('click', () => {
        canvasManager.setTool('brush');
        brushBtn.classList.add('active');
        eraserBtn.classList.remove('active');
    });
    
    eraserBtn.addEventListener('click', () => {
        canvasManager.setTool('eraser');
        eraserBtn.classList.add('active');
        brushBtn.classList.remove('active');
    });
    
    // Color picker
    const colorPicker = document.getElementById('colorPicker');
    colorPicker.addEventListener('change', (e) => {
        canvasManager.setColor(e.target.value);
    });
    
    // Stroke width
    const strokeWidth = document.getElementById('strokeWidth');
    const strokeWidthValue = document.getElementById('strokeWidthValue');
    
    strokeWidth.addEventListener('input', (e) => {
        const width = parseInt(e.target.value);
        canvasManager.setStrokeWidth(width);
        strokeWidthValue.textContent = width;
    });
    
    // Clear button
    const clearBtn = document.getElementById('clearBtn');
    clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the canvas for everyone?')) {
            canvasManager.clearCanvas();
            wsManager.emitClearCanvas();
        }
    });
    
    // Undo button
    const undoBtn = document.getElementById('undoBtn');
    undoBtn.addEventListener('click', () => {
        wsManager.emitUndo();
    });
    
    // Redo button
    const redoBtn = document.getElementById('redoBtn');
    redoBtn.addEventListener('click', () => {
        wsManager.emitRedo();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+Z or Cmd+Z for undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            wsManager.emitUndo();
        }
        
        // Ctrl+Y or Cmd+Y or Ctrl+Shift+Z for redo
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            wsManager.emitRedo();
        }
    });
}

// Update online users display
function updateOnlineUsers(users) {
    const container = document.getElementById('onlineUsers');
    container.innerHTML = '';
    
    users.forEach(user => {
        const badge = document.createElement('div');
        badge.className = 'user-badge';
        badge.innerHTML = `
            <div class="user-color" style="background-color: ${user.color}"></div>
            <span>${user.name}</span>
        `;
        container.appendChild(badge);
    });
}

// Update or create remote cursor
function updateRemoteCursor(userId, x, y, color, userName) {
    let cursor = remoteCursors[userId];
    
    if (!cursor) {
        // Create new cursor element
        cursor = document.createElement('div');
        cursor.className = 'remote-cursor';
        cursor.setAttribute('data-user', userName);
        cursor.style.backgroundColor = color;
        document.getElementById('cursors').appendChild(cursor);
        remoteCursors[userId] = cursor;
    }
    
    // Update cursor position
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
    
    // Remove cursor after 3 seconds of inactivity
    clearTimeout(cursor.hideTimeout);
    cursor.style.display = 'block';
    cursor.hideTimeout = setTimeout(() => {
        cursor.style.display = 'none';
    }, 3000);
}

// Update history button states
function updateHistoryButtons(historyCount, redoCount) {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const undoCountBadge = document.getElementById('undoCount');
    const redoCountBadge = document.getElementById('redoCount');
    
    // Update counts
    undoCountBadge.textContent = historyCount;
    redoCountBadge.textContent = redoCount;
    
    // Enable/disable buttons
    undoBtn.disabled = historyCount === 0;
    redoBtn.disabled = redoCount === 0;
}

// Show toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            container.removeChild(toast);
        }, 300);
    }, 3000);
}
