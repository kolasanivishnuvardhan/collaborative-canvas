/**
 * Room Management
 * Handles user management and room state
 */

const DrawingStateManager = require('./drawing-state');

class RoomManager {
    constructor() {
        this.users = new Map();
        this.userColors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', 
            '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
            '#F8B739', '#52B788', '#E63946', '#A8DADC'
        ];
        this.usedColors = new Set();
        this.userCounter = 1;
        
        // Initialize drawing state manager
        this.drawingState = new DrawingStateManager();
    }
    
    // Generate a unique color for a new user
    getAvailableColor() {
        // Find an unused color
        for (const color of this.userColors) {
            if (!this.usedColors.has(color)) {
                this.usedColors.add(color);
                return color;
            }
        }
        
        // If all colors are used, generate a random one
        return '#' + Math.floor(Math.random()*16777215).toString(16);
    }
    
    // Add a new user
    addUser(socketId) {
        const color = this.getAvailableColor();
        const user = {
            userId: socketId,
            name: `User ${this.userCounter++}`,
            color: color,
            connectedAt: new Date()
        };
        
        this.users.set(socketId, user);
        return user;
    }
    
    // Remove a user
    removeUser(socketId) {
        const user = this.users.get(socketId);
        if (user) {
            this.usedColors.delete(user.color);
            this.users.delete(socketId);
        }
    }
    
    // Get all connected users
    getUsers() {
        return Array.from(this.users.values()).map(user => ({
            userId: user.userId,
            name: user.name,
            color: user.color
        }));
    }
    
    // Get a specific user
    getUser(socketId) {
        return this.users.get(socketId);
    }
    
    // Add drawing to history
    addDrawingToHistory(action) {
        this.drawingState.addAction(action);
    }
    
    // Undo last action
    undo() {
        return this.drawingState.undo();
    }
    
    // Redo last undone action
    redo() {
        return this.drawingState.redo();
    }
    
    // Clear canvas and history
    clearCanvas() {
        this.drawingState.clearHistory();
    }
    
    // Get canvas state
    getCanvasState() {
        return this.drawingState.getState();
    }
}

module.exports = RoomManager;
