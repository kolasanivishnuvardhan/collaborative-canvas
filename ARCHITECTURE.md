# Architecture Documentation

This document provides a detailed technical overview of the Real-Time Collaborative Drawing Canvas application.

## 📐 System Architecture

### High-Level Overview

```
                                    WebSocket
                                   (Socket.io)
                                        │
                                        ▼
    ┌───────────────────────────────────────────────────────────────┐
    │                     Node.js Server                            │
    │                 (Express + Socket.io)                         │
    │                                                                │
    │  ┌──────────────┐    ┌──────────────┐   ┌─────────────────┐  │
    │  │    Room      │    │   Drawing    │   │   User          │  │
    │  │   Manager    │◄──►│    State     │   │  Management     │  │
    │  │   (rooms.js) │    │ (drawing-    │   │                 │  │
    │  │              │    │  state.js)   │   │  - Color        │  │
    │  │- Add/Remove  │    │              │   │  - Join/Leave   │  │
    │  │  Users       │    │- History[]   │   │  - User List    │  │
    │  │- User List   │    │- RedoStack[] │   │                 │  │
    │  │- Colors      │    │- Undo/Redo   │   │                 │  │
    │  └──────────────┘    └──────────────┘   └─────────────────┘  │
    │                                                                │
    └───────────────────────────────────────────────────────────────┘
                    │              │               │
                    │              │               │
              WebSocket      WebSocket       WebSocket
              (Socket.io)   (Socket.io)    (Socket.io)
                    │              │               │
                    ▼              ▼               ▼
    ┌───────────────────┐ ┌───────────────┐ ┌──────────────────┐
    │    Client 1       │ │   Client 2    │ │    Client N      │
    │  (Browser Tab)    │ │ (Browser Tab) │ │  (Browser Tab)   │
    │                   │ │               │ │                  │
    │ ┌───────────────┐ │ │┌─────────────┐│ │┌────────────────┐│
    │ │  Canvas API   │ │ ││ Canvas API  ││ ││  Canvas API    ││
    │ │  (canvas.js)  │ │ ││(canvas.js)  ││ ││  (canvas.js)   ││
    │ └───────────────┘ │ │└─────────────┘│ │└────────────────┘│
    │ ┌───────────────┐ │ │┌─────────────┐│ │┌────────────────┐│
    │ │  WebSocket    │ │ ││ WebSocket   ││ ││  WebSocket     ││
    │ │ (websocket.js)│ │ ││(websocket.js││ ││(websocket.js)  ││
    │ └───────────────┘ │ │└─────────────┘│ │└────────────────┘│
    │ ┌───────────────┐ │ │┌─────────────┐│ │┌────────────────┐│
    │ │  App Logic    │ │ ││  App Logic  ││ ││   App Logic    ││
    │ │  (main.js)    │ │ ││ (main.js)   ││ ││   (main.js)    ││
    │ └───────────────┘ │ │└─────────────┘│ │└────────────────┘│
    └───────────────────┘ └───────────────┘ └──────────────────┘
```

### Technology Stack

**Frontend:**
- Vanilla JavaScript (ES6+)
- HTML5 Canvas API
- CSS3 with Flexbox/Grid
- Socket.io Client

**Backend:**
- Node.js (v14+)
- Express.js (HTTP server)
- Socket.io (WebSocket server)

**Why No Frameworks?**
- Demonstrates raw Canvas API skills
- Better performance (no framework overhead)
- Full control over rendering pipeline
- Smaller bundle size

## 🔄 Data Flow Diagram

### Drawing Event Flow

```
         USER DRAWS ON CANVAS (Client 1)
                    │
                    ▼
    ┌───────────────────────────────────────┐
    │     STEP 1: Capture Mouse Event       │
    │     (mousedown/mousemove/mouseup)     │
    │                                       │
    │     canvas.addEventListener()         │
    └───────────────┬───────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────┐
    │  STEP 2: Draw Locally (Immediate)     │
    │  Canvas Manager (canvas.js)           │
    │                                       │
    │  - Calculate coordinates              │
    │  - ctx.beginPath()                    │
    │  - ctx.moveTo(fromX, fromY)           │
    │  - ctx.lineTo(toX, toY)               │
    │  - ctx.stroke()                       │
    │                                       │
    │  ✓ User sees instant feedback         │
    └───────────────┬───────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────┐
    │  STEP 3: Emit to Server               │
    │  WebSocket Manager (websocket.js)     │
    │                                       │
    │  socket.emit('drawing', {             │
    │    fromX, fromY, toX, toY,            │
    │    color, width, tool, type           │
    │  })                                   │
    └───────────────┬───────────────────────┘
                    │
                    ▼ Socket.io
    ┌───────────────────────────────────────┐
    │  STEP 4: Server Processing            │
    │  Server (server.js)                   │
    │                                       │
    │  - Receives drawing event             │
    │  - If type='end': Add to history[]    │
    │  - socket.broadcast.emit()            │
    │  - Broadcast to all other clients     │
    └───────────────┬───────────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
   [Client 2]             [Client N]
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
    ┌───────────────────────────────────────┐
    │  STEP 5: Remote Rendering             │
    │  Canvas Manager (other clients)       │
    │                                       │
    │  socket.on('drawing', (data) => {     │
    │    canvas.drawLine(                   │
    │      data.fromX, data.fromY,          │
    │      data.toX, data.toY,              │
    │      data.color, data.width           │
    │    )                                  │
    │  })                                   │
    │                                       │
    │  ✓ All users see the drawing          │
    └───────────────────────────────────────┘

    RESULT: Real-time synchronized drawing across all clients
    Latency: ~20-100ms (depending on network)
```

### Undo/Redo Flow

```
         USER CLICKS UNDO BUTTON (Any Client)
                    │
                    ▼
    ┌───────────────────────────────────────────┐
    │  STEP 1: Client Emits Undo Request        │
    │  Main App (main.js)                       │
    │                                           │
    │  socket.emit('undo')                      │
    └───────────────┬───────────────────────────┘
                    │
                    ▼ Socket.io
    ┌───────────────────────────────────────────┐
    │  STEP 2: Server Receives Undo            │
    │  Server (server.js)                       │
    │                                           │
    │  socket.on('undo', () => {                │
    │    const undone = roomManager.undo()     │
    │  })                                       │
    └───────────────┬───────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────────┐
    │  STEP 3: Drawing State Manager            │
    │  Drawing State (drawing-state.js)         │
    │                                           │
    │  BEFORE:                                  │
    │  history = [A, B, C, D]  ← Current        │
    │  redoStack = []                           │
    │                                           │
    │  OPERATION:                               │
    │  action = history.pop()    // D removed  │
    │  redoStack.push(action)    // D added    │
    │                                           │
    │  AFTER:                                   │
    │  history = [A, B, C]       ← New state   │
    │  redoStack = [D]           ← Can redo    │
    └───────────────┬───────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────────┐
    │  STEP 4: Broadcast to ALL Clients         │
    │  Server (server.js)                       │
    │                                           │
    │  io.emit('redrawCanvas', history)         │
    │  io.emit('historyUpdate', {               │
    │    historyCount: 3,                       │
    │    redoCount: 1                           │
    │  })                                       │
    └───────────────┬───────────────────────────┘
                    │
        ┌───────────┴───────────┬────────────┐
        │                       │            │
        ▼                       ▼            ▼
   [Client 1]              [Client 2]   [Client N]
        │                       │            │
        └───────────┬───────────┴────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────────┐
    │  STEP 5: All Clients Redraw Canvas        │
    │  Canvas Manager (canvas.js)               │
    │                                           │
    │  1. Clear entire canvas                   │
    │     ctx.clearRect(0, 0, width, height)    │
    │                                           │
    │  2. Replay ALL history actions            │
    │     history.forEach(action => {           │
    │       drawPath(action.data.path)          │
    │     })                                    │
    │                                           │
    │  3. Update UI buttons                     │
    │     undoBtn.disabled = (count === 0)      │
    │     redoBtn.disabled = (redoCount === 0)  │
    │                                           │
    │  ✓ All users see synchronized canvas     │
    └───────────────────────────────────────────┘

    REDO WORKS SIMILARLY:
    - Pops from redoStack
    - Pushes to history
    - Broadcasts full state
    - All clients redraw

    IMPORTANT: New drawing clears redoStack!
```

## 📡 WebSocket Protocol

### Message Types

#### Client → Server

| Event | Payload | Purpose |
|-------|---------|---------|
| `drawing` | `{ fromX, fromY, toX, toY, color, width, tool }` | Stream drawing data |
| `cursorMove` | `{ x, y }` | Share cursor position |
| `undo` | (none) | Request undo operation |
| `redo` | (none) | Request redo operation |
| `clearCanvas` | (none) | Request canvas clear |
| `ping` | (none) | Latency measurement |
| `requestCanvasState` | (none) | Request full canvas state |

#### Server → Client

| Event | Payload | Purpose |
|-------|---------|---------|
| `init` | `{ userId, name, color }` | Initialize new user |
| `userList` | `[{ userId, name, color }]` | Update online users |
| `drawing` | `{ fromX, fromY, toX, toY, color, width, tool, userId }` | Broadcast drawing |
| `cursorMove` | `{ userId, x, y, color, userName }` | Broadcast cursor position |
| `redrawCanvas` | `[{ userId, data: {...} }]` | Full canvas history for replay |
| `historyUpdate` | `{ historyCount, redoCount }` | Update undo/redo button states |
| `clearCanvas` | (none) | Notify canvas cleared |
| `pong` | (none) | Latency response |
| `canvasState` | `{ history: [...] }` | Full canvas state |

### Event Frequency & Optimization

**Drawing Events:**
- Emitted on every `mousemove` during drawing
- Typical rate: 60-120 events/second per user
- No throttling (preserves drawing smoothness)
- Payload size: ~100 bytes per event

**Cursor Movement:**
- Throttled to 20 updates/second (50ms interval)
- Only sent when cursor is over canvas
- Broadcast only (not stored in history)

**History Updates:**
- Sent only when history changes (draw end, undo, redo, clear)
- Low frequency: ~1-5 times per minute per user

## 🧠 Undo/Redo Strategy

### Global Operation History

The application maintains a **centralized operation history** on the server:

```javascript
// Server-side history structure
history = [
    {
        userId: 'socket-id-1',
        timestamp: 1234567890,
        data: {
            path: [{ x, y }, { x, y }, ...],
            color: '#FF0000',
            width: 5,
            tool: 'brush'
        }
    },
    // ... more operations
]

redoStack = [
    // Operations that have been undone
]
```

### Why Global Instead of Per-User?

**Advantages:**
- ✅ True collaborative undo (any user can undo anyone)
- ✅ Simpler conflict resolution
- ✅ Consistent canvas state across all clients
- ✅ Fair contribution management

**Disadvantages:**
- ⚠️ User A can undo User B's work
- ⚠️ May cause confusion in large teams

### Conflict Resolution

**Scenario:** User A draws, User B undoes, User C draws

```
Step 1: User A draws
history = [A1]
redoStack = []

Step 2: User B clicks undo
history = []
redoStack = [A1]

Step 3: User C draws
history = [C1]
redoStack = []  ← Cleared! (standard undo/redo behavior)

Result: A1 is permanently removed, cannot be redone
```

This is **intentional** and follows standard undo/redo semantics. When a new action occurs after an undo, the redo stack is cleared.

### Canvas State Reconstruction

When undo/redo occurs:
1. Server modifies history stack
2. Server sends complete history to ALL clients
3. Each client:
   - Clears canvas
   - Replays all operations in order
   - Updates button states

**Optimization Consideration:**
- Current approach: Full replay on every undo/redo
- Alternative: Incremental updates (more complex)
- Trade-off: Simplicity vs. performance

For our use case (< 100 operations), full replay is fast (< 50ms).

## 🎨 Canvas Rendering

### Drawing Pipeline

```javascript
// Client-side rendering flow

1. User moves mouse
   └─> Get mouse position (relative to canvas)

2. Draw locally (immediate feedback)
   └─> ctx.lineTo(x, y)
   └─> ctx.stroke()

3. Emit to server
   └─> socket.emit('drawing', { fromX, fromY, toX, toY, ... })

4. Server broadcasts to others
   └─> socket.broadcast.emit('drawing', data)

5. Other clients render
   └─> canvas.drawLine(fromX, fromY, toX, toY, ...)
```

### Path Smoothing

**Problem:** Mouse events are discrete points, resulting in jagged lines.

**Solution:** Linear interpolation between points.

```javascript
// For each mouse move
currentPath.push({ x, y, timestamp });

// Draw line from last point to current point
ctx.beginPath();
ctx.moveTo(lastX, lastY);
ctx.lineTo(x, y);  // Browser handles interpolation
ctx.stroke();
```

**Advanced Techniques Not Implemented (but could be):**
- Bézier curve smoothing
- Pressure sensitivity
- Variable stroke opacity

### Eraser Implementation

**Approach:** Draw white strokes over existing content.

```javascript
if (tool === 'eraser') {
    ctx.strokeStyle = '#FFFFFF';
} else {
    ctx.strokeStyle = color;
}
```

**Limitation:** Only works with white background. For colored backgrounds, would need:
- `ctx.globalCompositeOperation = 'destination-out'` (cuts through all layers)
- Or redraw entire canvas minus erased strokes

## 🚀 Performance Decisions

### Why Socket.io Over Native WebSockets?

**Socket.io Advantages:**
- ✅ Automatic reconnection handling
- ✅ Fallback to HTTP long-polling
- ✅ Built-in room management
- ✅ Event-based API (cleaner code)
- ✅ Broadcasting made easy

**Native WebSocket Advantages:**
- ✅ Lower overhead (~2 bytes vs ~10 bytes per message)
- ✅ Simpler protocol
- ✅ No additional dependencies

**Decision:** Socket.io for developer experience and reliability.

### Message Batching?

**Not Implemented** because:
- Drawing events are already small (~100 bytes)
- Batching adds latency (perceived lag)
- Modern networks handle high-frequency small messages well
- Code complexity not justified for this use case

**When to consider batching:**
- > 100 concurrent users
- High-latency networks
- Complex drawing data structures

### Client-Side Prediction

**Implemented:** Local drawing happens immediately, before server confirmation.

**Benefits:**
- Zero-latency feedback for local user
- Smooth drawing experience
- Server acts as source of truth

**Conflict Scenario:**
If server rejects/modifies a stroke (not implemented but could happen):
- Client would need to rollback and redraw
- Current implementation: Trusts all client data

### Memory Management

**History Limit:** 100 operations

```javascript
if (this.history.length > this.maxHistorySize) {
    this.history.shift();  // Remove oldest
}
```

**Alternative Approaches:**
- Time-based expiration
- Canvas snapshot + recent operations
- Compressed history

## 🔐 Security Considerations

### Current Implementation (Development-Focused)

**No Security Features:**
- ❌ No authentication
- ❌ No authorization
- ❌ No input validation
- ❌ No rate limiting
- ❌ No XSS protection

**Potential Vulnerabilities:**
- Malicious users can spam drawing events
- Users can impersonate others (change socket ID)
- No protection against canvas vandalism
- DDoS possible via many connections

### Production Recommendations

1. **Authentication:**
   - Add user login (JWT tokens)
   - Verify user identity on each request

2. **Input Validation:**
   ```javascript
   // Validate coordinates are within canvas bounds
   if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) {
       return; // Reject
   }
   
   // Validate color is valid hex
   if (!/^#[0-9A-F]{6}$/i.test(color)) {
       return;
   }
   ```

3. **Rate Limiting:**
   - Limit events per user per second
   - Throttle on server side

4. **Sanitization:**
   - Sanitize user-generated content (if adding chat)

## 📊 Scalability Analysis

### Current Limitations

**Single Server:**
- All users connect to one server instance
- State stored in memory only
- No persistence

**Estimated Capacity:**
- ~50-100 concurrent users per server
- ~5,000 drawing events/second (hardware dependent)

### Scaling to 1000 Users

**Required Changes:**

1. **Horizontal Scaling:**
   ```
   Users → Load Balancer → [Server 1, Server 2, ..., Server N]
   ```
   
   **Problem:** Users on different servers can't collaborate!
   
   **Solution:** Redis Pub/Sub
   ```javascript
   // Server publishes drawing events to Redis
   redis.publish('drawing-events', JSON.stringify(data));
   
   // All servers subscribe and forward to their clients
   redis.subscribe('drawing-events', (channel, message) => {
       io.emit('drawing', JSON.parse(message));
   });
   ```

2. **State Persistence:**
   - Store canvas state in Redis or database
   - Periodic snapshots to disk
   - Event sourcing pattern

3. **Multiple Rooms:**
   - Partition users into rooms (10-20 users per room)
   - Each room has independent canvas
   - Reduces broadcast overhead

4. **Optimized Broadcasting:**
   ```javascript
   // Instead of io.emit() to everyone
   // Use rooms:
   io.to(roomId).emit('drawing', data);
   ```

### Performance Metrics

**Target Metrics:**
- Latency: < 100ms (local), < 300ms (global)
- Drawing smoothness: 60 FPS
- Server CPU: < 70% per core
- Memory: < 2GB per 100 users

**Monitoring:**
- Track WebSocket message rates
- Monitor canvas redraw performance
- Log undo/redo operation times

## 🏗️ Code Organization

### Separation of Concerns

**Client-Side:**

1. **canvas.js** - Canvas operations only
   - No networking code
   - No business logic
   - Pure rendering functions

2. **websocket.js** - Network communication only
   - No DOM manipulation
   - No canvas operations
   - Event-based callbacks

3. **main.js** - Application coordination
   - Connects canvas to network
   - Handles UI events
   - Business logic

**Server-Side:**

1. **server.js** - HTTP + WebSocket server
   - Connection handling
   - Event routing
   - No business logic

2. **rooms.js** - User management
   - User lifecycle
   - Color assignment
   - User list maintenance

3. **drawing-state.js** - Canvas state
   - History management
   - Undo/redo logic
   - State queries

### Design Patterns Used

1. **Observer Pattern:**
   - WebSocket events
   - Callback functions

2. **Singleton Pattern:**
   - RoomManager instance
   - DrawingStateManager instance

3. **Factory Pattern:**
   - User creation with unique colors

## 🧪 Testing Strategy

### Manual Testing Checklist

**Single User:**
- [ ] Draw with brush
- [ ] Draw with eraser
- [ ] Change colors
- [ ] Change stroke width
- [ ] Undo drawing
- [ ] Redo drawing
- [ ] Clear canvas

**Multiple Users:**
- [ ] Open 2+ tabs
- [ ] Draw in one, see in others
- [ ] Undo from different tabs
- [ ] See user list update
- [ ] See remote cursors
- [ ] Check latency display

**Edge Cases:**
- [ ] Rapid undo/redo clicks
- [ ] Draw while another user undoes
- [ ] Disconnect and reconnect
- [ ] Redo after new drawing (should fail)

### Automated Testing (Not Implemented)

**Unit Tests:**
```javascript
describe('DrawingStateManager', () => {
    it('should add action to history', () => {
        // Test addAction()
    });
    
    it('should undo last action', () => {
        // Test undo()
    });
});
```

**Integration Tests:**
- Socket.io event flow
- Canvas state synchronization

**Load Tests:**
- Simulate 100+ concurrent users
- Measure server response times

## 🎯 Future Enhancements

### High Priority
1. **Persistence:** Save/load canvas sessions
2. **Multiple Rooms:** Isolated collaborative spaces
3. **User Authentication:** Identify users
4. **Drawing History Timeline:** Visual history replay

### Medium Priority
1. **More Tools:** Rectangle, circle, text, line
2. **Layers:** Multiple drawing layers
3. **Export:** Download as PNG/JPEG
4. **Undo Individual User:** Undo only your actions

### Low Priority
1. **Voice Chat:** Integrated communication
2. **Drawing Permissions:** Admin controls
3. **Canvas Templates:** Grid, whiteboard, etc.
4. **Pressure Sensitivity:** For stylus input

## 📚 References

- [MDN Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Socket.io Documentation](https://socket.io/docs/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

**Last Updated:** January 2026
**Author:** Technical Assessment Project
