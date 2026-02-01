/**
 * Express + Socket.io Server
 * Main server file handling HTTP and WebSocket connections
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const RoomManager = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files from client directory
app.use(express.static(path.join(__dirname, '../client')));

// Initialize room manager
const roomManager = new RoomManager();

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`New user connected: ${socket.id}`);
    
    // Initialize user with unique ID and color
    const userData = roomManager.addUser(socket.id);
    
    // Send user their initialization data
    socket.emit('init', userData);
    
    // Send current canvas state to new user
    const currentState = roomManager.getCanvasState();
    if (currentState.history.length > 0) {
        socket.emit('redrawCanvas', currentState.history);
    }
    
    // Send history update to new user
    socket.emit('historyUpdate', {
        historyCount: currentState.historyLength,
        redoCount: roomManager.drawingState.getRedoLength()
    });
    
    // Broadcast updated user list to all clients
    io.emit('userList', roomManager.getUsers());
    
    // Handle drawing events
    socket.on('drawing', (data) => {
        // Add drawing to history for undo/redo
        if (data.type === 'end') {
            roomManager.addDrawingToHistory({
                userId: socket.id,
                data: data
            });
            
            // Broadcast history update
            const state = roomManager.getCanvasState();
            io.emit('historyUpdate', {
                historyCount: state.historyLength,
                redoCount: roomManager.drawingState.getRedoLength()
            });
        }
        
        // Broadcast to all other users
        socket.broadcast.emit('drawing', {
            ...data,
            userId: socket.id,
            color: userData.color
        });
    });
    
    // Handle cursor movement
    socket.on('cursorMove', (position) => {
        socket.broadcast.emit('cursorMove', {
            userId: socket.id,
            x: position.x,
            y: position.y,
            color: userData.color,
            userName: userData.name
        });
    });
    
    // Handle clear canvas
    socket.on('clearCanvas', () => {
        roomManager.clearCanvas();
        io.emit('clearCanvas');
        io.emit('historyUpdate', {
            historyCount: 0,
            redoCount: 0
        });
    });
    
    // Handle undo
    socket.on('undo', () => {
        const undoneAction = roomManager.undo();
        if (undoneAction) {
            // Send updated canvas state to all clients
            const state = roomManager.getCanvasState();
            io.emit('redrawCanvas', state.history);
            io.emit('historyUpdate', {
                historyCount: state.historyLength,
                redoCount: roomManager.drawingState.getRedoLength()
            });
        }
    });
    
    // Handle redo
    socket.on('redo', () => {
        const redoneAction = roomManager.redo();
        if (redoneAction) {
            // Send updated canvas state to all clients
            const state = roomManager.getCanvasState();
            io.emit('redrawCanvas', state.history);
            io.emit('historyUpdate', {
                historyCount: state.historyLength,
                redoCount: roomManager.drawingState.getRedoLength()
            });
        }
    });
    
    // Handle canvas state request (for new users)
    socket.on('requestCanvasState', () => {
        const state = roomManager.getCanvasState();
        socket.emit('canvasState', state);
    });
    
    // Handle latency ping
    socket.on('ping', () => {
        socket.emit('pong');
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        roomManager.removeUser(socket.id);
        
        // Broadcast updated user list
        io.emit('userList', roomManager.getUsers());
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 WebSocket server is ready`);
});
