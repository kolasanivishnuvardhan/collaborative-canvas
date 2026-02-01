/**
 * WebSocket Client
 * Handles all real-time communication with the server
 */

class WebSocketManager {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.userId = null;
        this.userColor = null;
        
        // Latency tracking
        this.lastPingTime = 0;
        this.latency = 0;
    }
    
    connect() {
        // Connect to Socket.io server
        this.socket = io();
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.connected = true;
            this.updateConnectionStatus(true);
            
            // Start latency tracking
            this.startLatencyTracking();
        });
        
        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.connected = false;
            this.updateConnectionStatus(false);
        });
        
        // User initialization
        this.socket.on('init', (data) => {
            console.log('Initialized with user data:', data);
            this.userId = data.userId;
            this.userColor = data.color;
            
            // Callback for initialization
            this.onInit && this.onInit(data);
        });
        
        // User list updates
        this.socket.on('userList', (users) => {
            console.log('User list updated:', users);
            this.onUserListUpdate && this.onUserListUpdate(users);
        });
        
        // Drawing events from other users
        this.socket.on('drawing', (data) => {
            this.onRemoteDrawing && this.onRemoteDrawing(data);
        });
        
        // Cursor position from other users
        this.socket.on('cursorMove', (data) => {
            this.onRemoteCursor && this.onRemoteCursor(data);
        });
        
        // Clear canvas event
        this.socket.on('clearCanvas', () => {
            this.onClearCanvas && this.onClearCanvas();
        });
        
        // Undo event
        this.socket.on('undo', (data) => {
            console.log('Undo action received:', data);
            this.onUndo && this.onUndo(data);
        });
        
        // Redo event
        this.socket.on('redo', (data) => {
            console.log('Redo action received:', data);
            this.onRedo && this.onRedo(data);
        });
        
        // Full canvas redraw event (for undo/redo)
        this.socket.on('redrawCanvas', (actions) => {
            console.log('Redrawing canvas with', actions.length, 'actions');
            this.onRedrawCanvas && this.onRedrawCanvas(actions);
        });
        
        // History update event (for button states)
        this.socket.on('historyUpdate', (data) => {
            this.onHistoryUpdate && this.onHistoryUpdate(data);
        });
        
        // Canvas state sync (for new users)
        this.socket.on('canvasState', (data) => {
            this.onCanvasState && this.onCanvasState(data);
        });
        
        // Latency response
        this.socket.on('pong', () => {
            this.latency = Date.now() - this.lastPingTime;
            this.updateLatencyDisplay();
        });
    }
    
    // Emit drawing data to server
    emitDrawing(data) {
        if (this.connected) {
            this.socket.emit('drawing', data);
        }
    }
    
    // Emit cursor position
    emitCursorMove(position) {
        if (this.connected) {
            this.socket.emit('cursorMove', position);
        }
    }
    
    // Emit clear canvas
    emitClearCanvas() {
        if (this.connected) {
            this.socket.emit('clearCanvas');
        }
    }
    
    // Emit undo
    emitUndo() {
        if (this.connected) {
            this.socket.emit('undo');
        }
    }
    
    // Emit redo
    emitRedo() {
        if (this.connected) {
            this.socket.emit('redo');
        }
    }
    
    // Request current canvas state
    requestCanvasState() {
        if (this.connected) {
            this.socket.emit('requestCanvasState');
        }
    }
    
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            if (connected) {
                statusElement.textContent = '🟢 Connected';
                statusElement.classList.add('connected');
            } else {
                statusElement.textContent = '🔴 Disconnected';
                statusElement.classList.remove('connected');
            }
        }
    }
    
    startLatencyTracking() {
        setInterval(() => {
            if (this.connected) {
                this.lastPingTime = Date.now();
                this.socket.emit('ping');
            }
        }, 3000); // Ping every 3 seconds
    }
    
    updateLatencyDisplay() {
        const latencyElement = document.getElementById('latencyInfo');
        if (latencyElement) {
            latencyElement.textContent = `Latency: ${this.latency}ms`;
        }
    }
}
