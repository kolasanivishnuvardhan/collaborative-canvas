# Architecture Summary - Quick Reference

This is a condensed version of [ARCHITECTURE.md](ARCHITECTURE.md) for quick review.

---

## 🎯 Core Architectural Decisions

### 1. Socket.io vs Native WebSocket
**Decision:** Socket.io  
**Why:** Auto-reconnection, fallback support, event-based API  
**Trade-off:** +8 bytes overhead (negligible for < 100 users)  
**When to reconsider:** > 1000 users or < 10ms latency requirement

### 2. Message Batching
**Decision:** NO batching  
**Why:** Adds 25-50ms lag for 0% bandwidth savings  
**Math:** 100 events/sec × 100 bytes = 10 KB/sec (acceptable)  
**When to reconsider:** > 100 concurrent users

### 3. Client-Side Prediction
**Decision:** YES - Draw locally first  
**Why:** 0ms latency for local user (vs 50-300ms server round-trip)  
**Trade-off:** Must trust client data (no validation)

### 4. Undo/Redo Strategy
**Decision:** Global (any user can undo anyone)  
**Why:** True collaboration, simpler implementation  
**Alternative:** Per-user undo (more complex, less collaborative)

### 5. Conflict Resolution
**Rules:**
1. Overlapping strokes → Both keep (last-write-wins visually)
2. Global undo → Any user can undo anyone
3. New action → Clears redo stack
4. Client-server conflict → Server wins
5. Simultaneous undo → Sequential processing (rare race condition OK)

---

## 📊 Data Flow (3 Phases)

```
Phase 1: Local Draw (0ms)
   User draws → Canvas updates immediately

Phase 2: Server Sync (20-100ms)
   Client → Server → Store in history

Phase 3: Broadcast (20-100ms)
   Server → All other clients → Render
```

**Result:** Local user sees instant feedback, remote users see after network latency.

---

## 🗂️ Stroke Data Model

```javascript
{
    userId: 'socket-abc123',
    timestamp: 1706745600000,
    data: {
        path: [{ x: 100, y: 200 }, { x: 101, y: 201 }, ...],
        color: '#FF0000',
        width: 5,
        tool: 'brush'
    }
}
```

**Why path-based (not pixel-based)?**
- Small size (~100 bytes vs MBs)
- Resolution-independent
- Easy to replay for undo/redo

---

## 📈 Scaling to 1000 Users

### Step 1: Partition into Rooms
- 1000 users → 50 rooms × 20 users
- Each room = independent canvas
- Reduces broadcast from O(1000) to O(20)

### Step 2: Horizontal Scaling + Redis
```
Load Balancer → [Server 1, Server 2, ..., Server N]
                        ↓
                   Redis Pub/Sub
                        ↓
                   PostgreSQL
```

### Step 3: Persist State
- Auto-save every 10 actions
- Canvas survives restarts

### Step 4: CDN for Static Assets
- Serve JS/CSS from CloudFlare/AWS
- Reduce server load

**Cost:** $350/month for 1000 users ($0.35/user)

---

## 🎤 Interview Questions & Answers

### Q: Why no input validation?
**A:** Trusts client data for simplicity. Production would add:
- Coordinate bounds checking
- Color format validation
- Rate limiting per user

### Q: What if two users undo simultaneously?
**A:** Node.js processes sequentially. Rare race condition (< 1ms window) results in double-undo. Low impact, easily fixed with redo.

### Q: How do you handle network failures?
**A:** Socket.io auto-reconnects. On reconnect, client requests full canvas state from server and redraws.

### Q: Why clear redo stack on new action?
**A:** Standard undo/redo semantics (matches all text editors). Prevents branching history.

### Q: What's the bottleneck at 100 users?
**A:** CPU (broadcasting to N users is O(N) operation). Solution: Partition into rooms.

---

## 🔧 Performance Targets

| Metric | Current | Target (1000 users) |
|--------|---------|---------------------|
| Latency | < 100ms | < 300ms |
| Users/server | 100 | 200 (with rooms) |
| Memory/server | 5GB | 10GB |
| Bandwidth/user | ~1 Mbps | ~1 Mbps |

---

## 💡 What Would You Improve?

1. **Persistence** - Add database storage
2. **Room System** - Multiple isolated canvases
3. **Per-User Undo** - Option to undo only own strokes
4. **Dirty Regions** - Only redraw changed canvas areas
5. **Compression** - Compress large stroke histories

---

## 📝 Key Implementation Files

- [server/server.js](server/server.js) - WebSocket routing, broadcasting
- [server/drawing-state.js](server/drawing-state.js) - Undo/redo logic
- [server/rooms.js](server/rooms.js) - User management
- [client/canvas.js](client/canvas.js) - Drawing pipeline
- [client/websocket.js](client/websocket.js) - Client-side networking
- [client/main.js](client/main.js) - App coordination

---

**For full details, see [ARCHITECTURE.md](ARCHITECTURE.md)** (comprehensive version with code examples and diagrams)
