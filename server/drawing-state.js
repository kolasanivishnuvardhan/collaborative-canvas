/**
 * Canvas State Management
 * Handles drawing history, undo/redo operations
 */

class DrawingStateManager {
    constructor() {
        // History stack for undo/redo
        this.history = [];
        this.redoStack = [];
        this.maxHistorySize = 100; // Limit history to prevent memory issues
    }
    
    // Add a drawing action to history
    addAction(action) {
        this.history.push({
            ...action,
            timestamp: Date.now()
        });
        
        // Clear redo stack when new action is added
        this.redoStack = [];
        
        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }
    
    // Undo the last action
    undo() {
        if (this.history.length === 0) {
            return null;
        }
        
        const action = this.history.pop();
        this.redoStack.push(action);
        
        return action;
    }
    
    // Redo the last undone action
    redo() {
        if (this.redoStack.length === 0) {
            return null;
        }
        
        const action = this.redoStack.pop();
        this.history.push(action);
        
        return action;
    }
    
    // Clear all history
    clearHistory() {
        this.history = [];
        this.redoStack = [];
    }
    
    // Get current canvas state (all actions in history)
    getState() {
        return {
            history: this.history,
            historyLength: this.history.length
        };
    }
    
    // Get history length for UI display
    getHistoryLength() {
        return this.history.length;
    }
    
    // Get redo stack length for UI display
    getRedoLength() {
        return this.redoStack.length;
    }
}

module.exports = DrawingStateManager;
