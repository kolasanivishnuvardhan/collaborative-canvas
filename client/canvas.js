/**
 * Canvas Drawing Logic
 * Handles all canvas operations including drawing, erasing, and rendering
 */

class CanvasManager {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Drawing state
        this.isDrawing = false;
        this.currentTool = 'brush'; // 'brush' or 'eraser'
        this.currentColor = '#000000';
        this.strokeWidth = 3;
        
        // Drawing path (for smooth lines)
        this.currentPath = [];
        
        // For optimization
        this.lastX = 0;
        this.lastY = 0;
        
        this.initializeCanvas();
        this.setupEventListeners();
    }
    
    initializeCanvas() {
        // Set canvas size to fit container
        this.resizeCanvas();
        
        // Set canvas properties
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Update canvas info in status bar
        this.updateCanvasInfo();
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        // Set canvas size with some padding
        this.canvas.width = rect.width - 40;
        this.canvas.height = rect.height - 40;
        
        // Update status bar
        this.updateCanvasInfo();
    }
    
    updateCanvasInfo() {
        const infoElement = document.getElementById('canvasInfo');
        if (infoElement) {
            infoElement.textContent = `Canvas: ${this.canvas.width} x ${this.canvas.height}`;
        }
    }
    
    setupEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.canvas.dispatchEvent(mouseEvent);
        });
        
        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getMousePos(e);
        this.lastX = pos.x;
        this.lastY = pos.y;
        
        // Start a new path
        this.currentPath = [{
            x: pos.x,
            y: pos.y,
            color: this.currentColor,
            width: this.strokeWidth,
            tool: this.currentTool,
            timestamp: Date.now()
        }];
        
        // Draw a dot for single click
        this.drawDot(pos.x, pos.y);
        
        // Emit start drawing event (will be used for real-time sync)
        this.onDrawStart && this.onDrawStart({
            x: pos.x,
            y: pos.y,
            color: this.currentColor,
            width: this.strokeWidth,
            tool: this.currentTool
        });
    }
    
    draw(e) {
        if (!this.isDrawing) {
            // Track cursor position even when not drawing (for remote cursors)
            const pos = this.getMousePos(e);
            this.onCursorMove && this.onCursorMove(pos);
            return;
        }
        
        const pos = this.getMousePos(e);
        
        // Add to current path
        this.currentPath.push({
            x: pos.x,
            y: pos.y,
            timestamp: Date.now()
        });
        
        // Draw line from last position to current position
        this.drawLine(this.lastX, this.lastY, pos.x, pos.y, this.currentColor, this.strokeWidth, this.currentTool);
        
        // Emit drawing event (will be used for real-time sync)
        this.onDraw && this.onDraw({
            fromX: this.lastX,
            fromY: this.lastY,
            toX: pos.x,
            toY: pos.y,
            color: this.currentColor,
            width: this.strokeWidth,
            tool: this.currentTool
        });
        
        this.lastX = pos.x;
        this.lastY = pos.y;
    }
    
    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            
            // Emit end drawing event with complete path (will be used for real-time sync)
            this.onDrawEnd && this.onDrawEnd({
                path: this.currentPath,
                color: this.currentColor,
                width: this.strokeWidth,
                tool: this.currentTool
            });
            
            this.currentPath = [];
        }
    }
    
    drawDot(x, y) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.strokeWidth / 2, 0, Math.PI * 2);
        
        if (this.currentTool === 'eraser') {
            this.ctx.fillStyle = '#FFFFFF';
        } else {
            this.ctx.fillStyle = this.currentColor;
        }
        
        this.ctx.fill();
    }
    
    drawLine(fromX, fromY, toX, toY, color, width, tool) {
        this.ctx.beginPath();
        this.ctx.moveTo(fromX, fromY);
        this.ctx.lineTo(toX, toY);
        this.ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color;
        this.ctx.lineWidth = width;
        this.ctx.stroke();
    }
    
    // Public method to draw a complete path (for replaying history)
    drawPath(path, color, width, tool) {
        if (!path || path.length === 0) return;
        
        for (let i = 1; i < path.length; i++) {
            this.drawLine(
                path[i-1].x,
                path[i-1].y,
                path[i].x,
                path[i].y,
                color,
                width,
                tool
            );
        }
    }
    
    // Draw remote user's stroke
    drawRemoteStroke(data) {
        this.drawLine(data.fromX, data.fromY, data.toX, data.toY, data.color, data.width, data.tool);
    }
    
    // Clear the entire canvas
    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Set current tool
    setTool(tool) {
        this.currentTool = tool;
    }
    
    // Set current color
    setColor(color) {
        this.currentColor = color;
    }
    
    // Set stroke width
    setStrokeWidth(width) {
        this.strokeWidth = width;
    }
    
    // Get canvas state as image data (for undo/redo)
    getCanvasState() {
        return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Restore canvas state (for undo/redo)
    restoreCanvasState(imageData) {
        this.ctx.putImageData(imageData, 0, 0);
    }
}
