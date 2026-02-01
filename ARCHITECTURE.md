# Architecture Documentation

## Executive Summary

This document provides a comprehensive technical deep-dive into the Real-Time Collaborative Drawing Canvas application, covering architectural decisions, data flow, performance tradeoffs, and scalability strategies.

**Key Architectural Decisions:**
- ✅ Socket.io for WebSocket communication (auto-reconnection, fallback support)
- ✅ Server-authoritative state model (single source of truth)
- ✅ Client-side prediction for zero-latency drawing
- ✅ Global undo/redo (collaborative, not per-user)
- ✅ No message batching (prioritizes real-time smoothness over bandwidth)
- ✅ Full canvas replay strategy (simplicity over incremental updates)

**Target Performance:**
- Latency: < 100ms (local), < 300ms (remote)
- Capacity: 50-100 concurrent users per server instance
- Scalability: Horizontal scaling via Redis Pub/Sub for 1000+ users

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

## 🔄 Complete Data Flow Architecture

### Overview: Three-Phase Data Flow

The application uses a **client-side prediction + server broadcast** model:

1. **Phase 1: Local Rendering** (0ms latency)
   - User draws → Immediate canvas update
   - No server round-trip required
   - Optimistic UI update

2. **Phase 2: Server Synchronization** (20-100ms latency)
   - Client sends stroke data to server
   - Server validates and stores in history
   - Server becomes authoritative source

3. **Phase 3: Broadcast to Peers** (20-100ms latency)
   - Server broadcasts to all other clients
   - Remote clients render received strokes
   - All clients converge to same state

**Key Principle:** Local user always sees instant feedback (client-side prediction), while remote users see updates after network round-trip.

---

### Drawing Event Flow (Detailed)

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
    � Stroke Data Model

### Stroke Representation

Each drawing stroke is represented as a series of coordinate points:

```javascript
// Single stroke object
{
    userId: 'socket-abc123',           // Who created this stroke
    timestamp: 1706745600000,          // When it was created
    data: {
        path: [                        // Array of points
            { x: 100, y: 200 },
            { x: 101, y: 201 },
            { x: 103, y: 203 },
            // ... more points
        ],
        color: '#FF0000',              // Stroke color (hex)
        width: 5,                      // Stroke width (px)
        tool: 'brush'                  // Tool type: 'brush' or 'eraser'
    }
}
```

### Why Path-Based (Not Pixel-Based)?

**Path-Based Approach (Used):**
- ✅ Small data size (~100 bytes per stroke)
- ✅ Resolution-independent (scales to any canvas size)
- ✅ Easy to replay for undo/redo Strategy

#### Drawing Events: NO Throttling (Intentional)

**Rate:** 60-120 events/second per user
**Payload:** ~100 bytes per event
**Total bandwidth:** ~12 KB/sec per active drawer

**Why NO throttling?**
1. **Smoothness Priority:** Every mousemove = one line segment. Skipping events creates jagged lines.
2. **Small Payload:** 100 bytes is negligible on modern networks (< 1 Mbps)
3. **User Experience:** Drawing lag is immediately noticeable and frustrating
4. **Network Capacity:** Modern WebSockets handle thousands of small messages/sec easily

**Alternative Considered: Batching**
```javascript
// NOT IMPLEMENTED
const batch = [];
setInterval(() => {
    if (batch.length > 0) {
        socket.emit('drawingBatch', batch);
        batch = [];
    }
}, 50); // Send every 50ms
```

**Why NOT batching:**
- ❌ Adds 25-50ms perceived latency (half the batch interval)
- ❌ More complex code (buffer management)
- ❌ Not justified for 100-byte messages
- ✅ Only worth it for > 100 concurrent users or > 1KB payloads

**When to reconsider:** If bandwidth usage exceeds 10 Mbps per server, implement adaptive batching.

---

#### Cursor Movement: Throttled (20/sec)

**Rate:** 20 updates/second (50ms interval)
**Why throttle cursors but not drawing?**

```javascript
// Implemented in main.js
let lastCursorEmit = 0;
canvas.addEventListener('mousemove', (e) => {
    const now = Date.now();
    if (now - lastCursorEmit > 50) {  // 50ms = 20/sec
        wsManager.emitCursorMove(position);
        lastCursorEmit = now;
    }
});
```

**Rationale:**
- Cursor position is "best-effort" (missing an update is OK)
- Drawing strokes are "must-have" (missing creates gaps)
- 20/sec is smooth enou Rules (Explicit Policy)

Real-time collaboration creates conflicts. Here's how we handle them:

---

#### Rule 1: Last-Write-Wins for Drawing

**Scenario:** Two users draw in the same location simultaneously.

```
Time T0:
- User A draws red stroke at (100, 100)
- User B draws blue stroke at (100, 100)

Result:
- Both strokes are preserved
- Visual overlap: last stroke on top
- No data loss
```

**Why this works:**
- Both operations are independent (additive)
- Canvas layering handles visual overlap naturally
- No need for complex conflict resolution (like Operational Transformation)

**Alternative considered:** Merge overlapping strokes
- ❌ Too complex (detect overlap, merge colors?)
- ❌ Loses user intent
- ✅ Current approach: simple and predictable

---

#### Rule 2: Global Undo (Any user can undo anyone)

**Scenario:** User A draws, User B clicks undo.

```
State 1: User A draws
history = [A1]

State 2: User B clicks undo
history = []     ← A1 removed
redoStack = [A1] ← Can be redone

Result: A1 is undone by B (even though A drew it)
```

**Why global instead of per-user?**

**Global Undo (Implemented):**
- ✅ True collaboration (everyone edits shared canvas)
- ✅ Simpler mental model (one undo button)
- ✅ Simpler implementation (one history stack)
- ⚠️ User B can undo User A's work

**Per-User Undo (NOT implemented):**
- ✅ Users can't undo each other
- ❌ Complex: Track per-user history
- ❌ Confusing: "Undo" only undoes MY strokes?
- ❌ Hard to visualize: What if my stroke is on top of yours?

**Decision:** Global undo for simplicity. For production, add user permissions or per-user mode.

---

#### Rule 3: Redo Stack Cleared on New Action

**Scenario:** User A draws, User B undoes, User C draws.

```
Step 1: User A draws
history = [A1]
redoStack = []

Step 2: User B clicks undo
history = []
redoStack = [A1] ← Can redo A1

Step 3: User C draws
history = [C1]
redoStack = []   ← CLEARED! A1 is lost forever

Result: Cannot redo A1 anymore
```

**Why clear redo stack?**
- Standard undo/redo semantics (matches text editors, Photoshop, etc.)
- Prevents branching history (timeline only goes forward)
- Simpler implementation

**Alternative considered:** Branching history (git-style)
- ❌ Too complex for drawing app
- ❌ Confusing UI (which branch am I on?)
- ✅ Current approach matches user expectations

---

#### Rule 4: Server is Source of Truth

**Scenario:** Client and server disagree on canvas state.

```
Client thinks: history = [A1, B1, C1]
Server says:   history = [A1, B1]

Resolution: Client trusts server
- Client clears canvas
- Client redraws from server history
- Server wins
```

**Why server-authoritative?**
- Prevents split-brain scenarios
- Single source of truth
- Easier to debug (check server state)

**Implementation:**
```javascript
// On any state mismatch (reconnect, sync error)
socket.on('redrawCanvas', (serverHistory) => {
    canvas.clear();
    serverHistory.forEach(action => canvas.drawStroke(action));
});
```

---

#### Rule 5: No Transaction Locking

**Scenario:** Two users click undo at the exact same time.

```
Time T0:
- Server history = [A1, B1, C1]
- User 1 clicks undo → Server receives at T0
- User 2 clicks undo → Server receives at T0 + 1ms

Result (Race condition possible):
- Both undos process sequentially
- First undo: removes C1
- Second undo: removes B1
- Final: history = [A1]
```

**Why no locking?**
- Undo operations are sequential on server (Node.js single-threaded)
- Race conditions are rare (< 1ms timing window)
- Impact is low (just double-undo, easily fixed with redo)

**Alternative considered:** Mutex locks
- ❌ Adds complexity
- ❌ Potential deadlocks
- ❌ Not worth it for rare edge case

**Conclusion:** Accept rare double-undo in exchange for simpler code.

---

### Conflict Resolution Summary

| Situation | Rule | Why |
|-----------|------|-----|
| Overlapping strokes | Last-write-wins (both keep) | Additive operations |
| Undo across users | Global undo allowed | True collaboration |
| Redo after new action | Redo stack cleared | Standard semantics |
| Client-server mismatch | Server wins | Single source of truth |
| Simultaneous undo | Sequential processing | Rare, low impact |

**Key Insight:** Most conflicts are avoided by making operations additive (strokes don't delete each other) and server-authoritative (server decides truth)
3. END (mouseup)
   └─> Finalize stroke
   └─> Emit: socket.emit('drawing', { ..., type: 'end' })
   └─> Server adds complete stroke to history[]
```

**Critical Detail:** Only `type: 'end'` strokes are added to history for undo/redo. Intermediate `type: 'move'` events are for real-time rendering only.

---

## �│     ctx.clearRect(0, 0, width, height)    │
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
: "How Would You Handle 1000 Concurrent Users?"

This is a **key interview question**. Here's the comprehensive answer:

---

### Current Architecture Limitations

**Single-Server Constraints:**

| Resource | Current Capacity | Bottleneck |
|----------|------------------|------------|
| **CPU** | 50-100 concurrent users | WebSocket event processing |
| **Memory** | ~50MB per user = 5GB for 100 users | History storage in RAM |
| **Network** | ~1 Mbps per user = 100 Mbps for 100 users | Server bandwidth |
| **Latency** | < 100ms (under capacity) | Event broadcasting loop |

**Why it breaks at ~100 users:**

```javascript
// Current broadcast implementation
socket.on('drawing', (data) => {
    // O(N) operation - loops through all clients!
    socket.broadcast.emit('drawing', data);
});

// With 100 users:
// 100 users × 100 events/sec × 100 recipients = 1,000,000 operations/sec
// CPU can't keep up → latency spikes → poor UX
```

**Bottleneck:** Broadcasting to N users is O(N) operation. With 1000 users, server CPU hits 100%.

---

### Scaling to 1000 Users: The Solution

#### Step 1: Partition Users into Rooms

**Problem:** 1000 users on one canvas is chaos.

**Solution:** Multiple isolated canvases (rooms).

```javascript
// rooms.js (enhanced)
class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomId → Room
        this.maxUsersPerRoom = 20;
    }
    
    joinRoom(userId, roomId) {
        let room = this.rooms.get(roomId);
        
        // Room full? Create new instance
        if (room.users.length >= this.maxUsersPerRoom) {
            roomId = `${roomId}-${Date.now()}`;
            room = new Room(roomId);
        }
        
        room.addUser(userId);
        return roomId;
    }
}

// server.js
io.on('connection', (socket) => {
    socket.on('joinRoom', (roomId) => {
        const actualRoom = roomManager.joinRoom(socket.id, roomId);
        socket.join(actualRoom); // Socket.io room
        
        // Broadcast only to room members
        io.to(actualRoom).emit('drawing', data);
    });
});
```

**Impact:**
- 1000 users → 50 rooms of 20 users each
- Each room is independent canvas
- Broadcasting: O(20) instead of O(1000)
- **CPU usage: 50× reduction**

---

#### Step 2: Horizontal Scaling with Redis Pub/Sub

**Problem:** Users in Room A on Server 1 can't see users in Room A on Server 2.

**Solution:** Redis for cross-server communication.

```
                     ┌─────────────┐
                     │    Redis    │
                     │   Pub/Sub   │
                     └──────┬──────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
    ┌────▼─────┐      ┌────▼─────┐      ┌────▼─────┐
    │ Server 1 │      │ Server 2 │      │ Server N │
    │ 200 users│      │ 200 users│      │ 200 users│
    └──────────┘      └──────────┘      └──────────┘
```

**Implementation:**

```javascript
// server.js (enhanced)
const redis = require('redis');
const subscriber = redis.createClient();
const publisher = redis.createClient();

// Subscribe to room events
subscriber.subscribe('drawing-events');
subscriber.on('message', (channel, message) => {
    const { roomId, event, data } = JSON.parse(message);
    
    // Forward to local users in this room
    io.to(roomId).emit(event, data);
});

// Publish local events to Redis
io.on('connection', (socket) => {
    socket.on('drawing', (data) => {
        // Publish to Redis (all servers receive)
        publisher.publish('drawing-events', JSON.stringify({
            roomId: socket.roomId,
            event: 'drawing',
            data: data
        }));
    });
});
```

**Impact:**
- Load balancer distributes users across servers
- Each server handles 200 users
- 5 servers = 1000 users
- Redis ensures cross-server sync

---

#### Step 3: Persist State to Database

**Problem:** Server restart loses all canvas data.

**Solution:** Periodic snapshots to PostgreSQL/MongoDB.

```javascript
// drawing-state.js (enhanced)
class DrawingStateManager {
    async addAction(action) {
        this.history.push(action);
        
        // Auto-save every 10 actions
        if (this.history.length % 10 === 0) {
            await this.saveSnapshot();
        }
    }
    
    async saveSnapshot() {
        await db.rooms.update({
            roomId: this.roomId
        }, {
            history: this.history,
            lastSaved: Date.now()
        });
    }
    
    async loadState(roomId) {
        const room = await db.rooms.findOne({ roomId });
        if (room) {
            this.history = room.history;
        }
    }
}
```

**Impact:**
- Canvas survives server restarts
- Can replay history after crash
- Database handles backup/recovery

---

#### Step 4: CDN for Static Assets

**Problem:** Every user downloads JS/CSS from server.

**Solution:** Serve static files from CDN (CloudFlare, AWS CloudFront).

```javascript
// index.html (production)
<script src="https://cdn.example.com/canvas.js"></script>
<script src="https://cdn.example.com/main.js"></script>
```

**Impact:**
- Server only handles WebSocket traffic
- Static assets cached globally
- Faster page loads

---

### Final Architecture for 1000 Users

```
┌─────────────────────────────────────────────────────┐
│                   Load Balancer                     │
│              (NGINX / AWS ALB)                      │
└────────┬───────────┬──────────┬──────────┬──────────┘
         │           │          │          │
    ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐
    │Server 1 │ │Server 2│ │Server 3│ │Server N│
    │200 users│ │200 users│ │200 users│ │200 users│
    └────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘
         │          │          │          │
         └──────────┼──────────┼──────────┘
                    │
              ┌─────▼─────┐
              │   Redis   │
              │  Pub/Sub  │
              └─────┬─────┘
                    │
              ┌─────▼─────┐
              │ PostgreSQL│
              │  (State)  │
              └───────────┘
```

---

### Performance Targets for 1000 Users

| Metric | Current (100 users) | Target (1000 users) | How to Achieve |
|--------|---------------------|---------------------|----------------|
| Latency | < 100ms | < 300ms | Redis Pub/Sub + 5 servers |
| CPU per server | 70% | 60% | Room partitioning (20 users/room) |
| Memory per server | 5GB | 10GB | Database persistence (reduce RAM) |
| Uptime | 95% | 99.9% | Load balancer + redundancy |

---

### Cost Analysis

**Current (Single Server):**
- 1× Server: $50/month
- Supports: 100 users

**Scaled (1000 Users):**
- 5× Servers: $250/month
- 1× Redis: $30/month
- 1× PostgreSQL: $50/month
- 1× Load Balancer: $20/month
- **Total: $350/month** for 1000 concurrent users
- **Cost per user: $0.35/month**

---
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

## 🧠 Critical Performance Decisions

### Why Socket.io Over Native WebSockets? (Detailed Justification)

This is a **critical architectural decision** that significantly impacts reliability and development velocity.

#### Comparison Matrix

| Feature | Socket.io | Native WebSocket | Winner |
|---------|-----------|------------------|--------|
| **Auto-reconnection** | ✅ Built-in | ❌ Manual implementation | Socket.io |
| **Fallback transport** | ✅ Long-polling | ❌ None | Socket.io |
| **Event-based API** | ✅ `socket.on('drawing', ...)` | ❌ Manual parsing | Socket.io |
| **Broadcasting** | ✅ `io.emit()`, `socket.broadcast.emit()` | ❌ Manual loop | Socket.io |
| **Room support** | ✅ Built-in | ❌ Manual tracking | Socket.io |
| **Message overhead** | ⚠️ ~10 bytes header | ✅ ~2 bytes | WebSocket |
| **Bundle size** | ⚠️ ~200KB | ✅ Native browser API | WebSocket |
| **Performance** | ⚠️ Slightly slower | ✅ Faster | WebSocket |
Latency Handling Strategy

#### Problem: Network Latency Kills User Experience

**Typical Network Latencies:**
- Local network (same WiFi): 5-20ms
- Same city: 20-50ms
- Cross-country: 50-150ms
- International: 150-300ms

**Challenge:** Without optimization, users would see 50-300ms delay when drawing!

#### Solution: Client-Side Prediction

**Implementation:**
```javascript
// User draws at time T0
function draw(x, y) {
    // STEP 1: Draw locally IMMEDIATELY (T0 + 0ms)
    ctx.lineTo(x, y);
    ctx.stroke();
    // ✓ User sees instant feedback
    
    // STEP 2: Send to server (T0 + 0-1ms)
    socket.emit('drawing', { x, y, ... });
    // Server receives at T0 + latency
    
    // STEP 3: Server broadcasts to others (T0 + latency)
    // Other users see at T0 + 2*latency
}
```

**Result:**
- Local user: 0ms latency (instant)
- Remote users: 2*latency (network round-trip)

**This is CRITICAL:** Without client-side prediction, every mouse movement would feel sluggish.

---

#### Conflict Handling in Client-Side Prediction

**Potential Issue:** What if server rejects a stroke?

**Current Implementation:** Server trusts all client data (no validation)
```javascript
// Server (server.js)
socket.on('drawing', (data) => {
    // No validation - trust client
    socket.broadcast.emit('drawing', data);
});
```

**Why no validation?**
- Simpler implementation
- Faster development
- No financial/security risk for drawing app
- User can always undo mistakes

**Production Considerations:**
If we added validation (e.g., coordinates within bounds):
```javascript
socket.on('drawing', (data) => {
    // Validate
    if (data.x < 0 || data.x > 2000 || data.y < 0 || data.y > 2000) {
        socket.emit('error', { message: 'Invalid coordinates' });
        return; // Reject
    }
    
    // Client would need to handle rejection:
    // 1. Rollback local drawing
    // 2. Request canvas state from server
    // 3. Redraw everything
});
```

**Trade-off:** Current approach prioritizes simplicity and performance over strict validation.

---

### Message Batching Analysis

#### Why NO Batching? (Explicit Decision)

**Batching Approach (NOT implemented):**
```javascript
let batchBuffer = [];
const BATCH_INTERVAL = 50; // ms

// Collect events
canvas.on('mousemove', (e) => {
    batchBuffer.push({ x: e.x, y: e.y });
});

// Send batch every 50ms
setInterval(() => {
    if (batchBuffer.length > 0) {
        socket.emit('drawingBatch', batchBuffer);
        batchBuffer = [];
    }
}, BATCH_INTERVAL);
```

**Why NOT batch?**

| Factor | Impact of Batching | Decision |
|--------|-------------------|----------|
| **Latency** | +25-50ms perceived lag | ❌ Bad UX |
| **Smoothness** | Stuttery drawing (updates every 50ms) | ❌ Not fluid |
| **Bandwidth** | Saves ~30% bandwidth | ✅ But not needed |
| **Code complexity** | +50 lines of buffer management | ❌ More bugs |

**Bandwidth Math:**
- Current: 100 events/sec × 100 bytes = 10 KB/sec
- Batched: 20 batches/sec × 500 bytes = 10 KB/sec
- **Savings: 0%** (just reshuffled!)

**Latency Math:**
- Without batching: Draw → emit immediately → server receives in ~25ms
- With batching: Draw → wait up to 50ms → emit → server receives in ~75ms
- **Cost: +50ms perceived lag** (unacceptable!)

**Conclusion:** Batching optimizes the wrong thing. We care about smoothness, not bandwidth.

**When batching makes sense:**
- High-latency networks (> 200ms) - lag already exists
- Large payloads (> 1KB per event) - bandwidth becomes bottleneck
- > 100 concurrent users - server CPU becomes bottleneck

**Current use case:** None of these apply → no batching.
   **Impact:** Saves ~100 lines of reconnection logic. Users don't lose work on network hiccups.

2. **Fallback Support (Production Safety)**
   - Corporate firewalls often block WebSocket ports
   - Socket.io falls back to HTTP long-polling
   - Native WebSocket just fails
   
   **Impact:** App works in more network environments (enterprise, restrictive firewalls)

3. **Event-Based API (Developer Experience)**
   ```javascript
   // Socket.io: Clean
   socket.on('drawing', (data) => { ... });
   socket.on('undo', () => { ... });
   
   // Native WebSocket: Manual routing
   ws.onmessage = (event) => {
       const { type, data } = JSON.parse(event.data);
       switch(type) {
           case 'drawing': ...; break;
           case 'undo': ...; break;
       }
   };
   ```
   
   **Impact:** Less error-prone, easier to maintain

4. **Broadcasting (Server-Side)**
   ```javascript
   // Socket.io: One line
   socket.broadcast.emit('drawing', data); // All except sender
   
   // Native WebSocket: Manual loop
   wss.clients.forEach(client => {
       if (client !== ws && client.readyState === WebSocket.OPEN) {
           client.send(JSON.stringify({ type: 'drawing', data }));
       }
   });
   ```
   
   **Impact:** Cleaner server code, fewer bugs

#### Performance Trade-off Analysis

**Overhead Cost:**
- Socket.io adds ~8 bytes per message vs native WebSocket
- For 100 drawing events/sec = 800 bytes/sec = 0.0064 Mbps
- **Conclusion:** Negligible for < 100 concurrent users

**When Native WebSocket Makes Sense:**
- Ultra-low latency requirements (< 10ms)
- > 1000 concurrent users per server
- Binary data (video, audio streaming)
- Simple point-to-point communication

**For This Use Case:**
- Real-time drawing prioritizes reliability over 8-byte overhead
- Target latency: < 100ms (8 bytes = 0.064ms at 1 Mbps)
- Socket.io saves weeks of development time
- Better developer experience = fewer bugs

**Final Verdict:** Socket.io's reliability features outweigh the minimal performance cost for a collaborative drawing app
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
- [WebSocket RFC 6455](https://tools.ietf.org/html/rfc6455)
- [Operational Transformation (Conflict Resolution)](https://operational-transformation.github.io/)

---

## 🎯 Key Takeaways for Interviews

### Question: "Why Socket.io over native WebSocket?"
**Answer:** Auto-reconnection, fallback support, and event-based API save weeks of development. 8-byte overhead is negligible for < 100 users.

### Question: "How do you handle latency?"
**Answer:** Client-side prediction (draw locally first) gives 0ms latency for local user. Remote users see 2×network latency.

### Question: "Why no message batching?"
**Answer:** Batching adds 25-50ms lag for 0% bandwidth savings. Prioritize smoothness over optimization that doesn't help.

### Question: "How does undo/redo work across users?"
**Answer:** Server maintains global history stack. Any user can undo anyone. On undo, server broadcasts full history, all clients replay from scratch.

### Question: "How would you scale to 1000 users?"
**Answer:** 
1. Partition into rooms (20 users/room)
2. Horizontal scaling with Redis Pub/Sub
3. Persist state to database
4. Load balancer + CDN
5. Cost: $350/month for 1000 users

### Question: "What are your conflict resolution rules?"
**Answer:**
1. Overlapping strokes: both keep (last-write-wins visually)
2. Undo: global (any user can undo anyone)
3. Redo: cleared on new action (standard semantics)
4. Disagreement: server is source of truth

### Question: "What would you improve?"
**Answer:**
1. Add persistence (database storage)
2. Implement room system (multiple canvases)
3. Add per-user undo option
4. Optimize with canvas dirty regions (only redraw changed areas)
5. Add compression for large histories

---

**Last Updated:** February 1, 2026  
**Author:** Technical Assessment Project  
**Version:** 2.0 (Comprehensive Edition)
