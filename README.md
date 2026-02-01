# Real-Time Collaborative Drawing Canvas

A multi-user drawing application where multiple people can draw simultaneously on the same canvas with real-time synchronization.

![Collaborative Canvas](https://img.shields.io/badge/status-active-success.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-ISC-blue.svg)

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation & Running

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open in browser:**
   Navigate to `http://localhost:3000`

4. **Test with multiple users:**
   - Open the same URL in multiple browser tabs/windows
   - Or open on different devices on the same network
   - Each user gets a unique color and can draw simultaneously

That's it! The application should now be running.

## ✨ Features

### Core Drawing Features
- **Multiple Drawing Tools:**
  - ✏️ Brush tool with adjustable stroke width (1-50px)
  - 🧹 Eraser tool
  - 🎨 Color picker with full color spectrum
  
- **Real-Time Synchronization:**
  - See other users drawing in real-time (not after they finish)
  - Smooth line rendering with path interpolation
  - Low-latency updates (< 50ms on local network)

### Collaborative Features
- **User Management:**
  - Automatic user identification with unique colors
  - Online users list showing who's connected
  - User counter (User 1, User 2, etc.)

- **Remote Cursor Tracking:**
  - See where other users are drawing
  - Cursor indicators with user names
  - Auto-hide after 3 seconds of inactivity

- **Global Undo/Redo:**
  - Works across all users (any user can undo anyone's action)
  - History counter showing available undo/redo operations
  - Keyboard shortcuts: `Ctrl+Z` / `Cmd+Z` for undo, `Ctrl+Y` / `Cmd+Y` for redo
  - Visual feedback with disabled states

- **Canvas Management:**
  - Clear canvas button (affects all users)
  - Confirmation dialog before clearing
  - New users automatically receive current canvas state

### Technical Features
- **Performance Monitoring:**
  - Real-time latency display
  - Connection status indicator
  - Canvas dimensions display

- **Mobile Support:**
  - Touch-friendly drawing interface
  - Responsive design
  - Works on tablets and smartphones

## 🎮 How to Use

### Drawing
1. Select **Brush** or **Eraser** tool
2. Choose your preferred **color** (brush only)
3. Adjust **stroke width** using the slider
4. Click and drag on the canvas to draw

### Collaboration
- **Undo/Redo:** Click the undo/redo buttons or use keyboard shortcuts
- **Clear Canvas:** Click the clear button (requires confirmation)
- **View Users:** Check the header to see who's online

### Keyboard Shortcuts
- `Ctrl+Z` / `Cmd+Z` - Undo last action
- `Ctrl+Y` / `Cmd+Y` or `Ctrl+Shift+Z` / `Cmd+Shift+Z` - Redo last undone action

## 🏗️ Project Structure

```
collaborative-canvas/
├── client/                 # Frontend files
│   ├── index.html         # Main HTML structure
│   ├── style.css          # Styling and responsive design
│   ├── canvas.js          # Canvas drawing logic and operations
│   ├── websocket.js       # WebSocket client and real-time communication
│   └── main.js            # Application initialization and coordination
├── server/                # Backend files
│   ├── server.js          # Express + Socket.io server
│   ├── rooms.js           # User and room management
│   └── drawing-state.js   # Canvas state and undo/redo management
├── package.json           # Dependencies and scripts
├── README.md              # This file
└── ARCHITECTURE.md        # Technical architecture documentation
```

## 🔧 Configuration

The application uses default configuration:
- **Port:** 3000 (can be changed via `PORT` environment variable)
- **Max History Size:** 100 actions (prevents memory issues)
- **Latency Ping Interval:** 3 seconds
- **Cursor Hide Timeout:** 3 seconds

To change the port:
```bash
PORT=8080 npm start
```

## 🧪 Testing

### Single User Test
1. Open `http://localhost:3000`
2. Draw on the canvas
3. Test undo/redo
4. Try different tools and colors

### Multi-User Test
1. Open `http://localhost:3000` in multiple browser tabs
2. Draw in one tab and observe real-time updates in others
3. Test undo/redo from different tabs
4. Test clear canvas functionality
5. Check user list updates when opening/closing tabs

### Network Test
1. Find your local IP address:
   - Windows: `ipconfig` (look for IPv4 Address)
   - Mac/Linux: `ifconfig` or `ip addr`
2. Access from another device: `http://YOUR_IP:3000`
3. Test drawing synchronization across devices

## 🐛 Known Limitations

1. **No Persistence:** Canvas data is stored in memory only. Refreshing the page or restarting the server clears all drawings.

2. **No Authentication:** Users are identified by socket ID only. No login or user profiles.

3. **Single Room:** All users share one canvas. No support for multiple rooms/sessions.

4. **History Limit:** Undo/redo limited to last 100 actions to prevent memory issues.

5. **No Drawing Replay:** Cannot replay the entire drawing session from start to finish.

6. **White Background Only:** Eraser assumes white background color.

## ⏱️ Time Spent

**Total Development Time:** ~4-5 hours
- Project setup and structure: 30 minutes
- Canvas implementation: 1 hour
- WebSocket integration: 1 hour
- Undo/redo and state management: 1.5 hours
- Polish and documentation: 1 hour

## 🚀 Deployment

### Deploy to Heroku

1. Create a Heroku account and install Heroku CLI
2. Login to Heroku: `heroku login`
3. Create a new app: `heroku create your-app-name`
4. Deploy: `git push heroku main`
5. Open: `heroku open`

### Deploy to Vercel

1. Install Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Deploy: `vercel`
4. Follow the prompts

Note: For production deployment, consider adding:
- Redis for state persistence
- Environment variables for configuration
- HTTPS/WSS for secure connections
- Load balancing for multiple server instances

## 🤝 Contributing

This is a learning project. Feel free to fork and experiment!

## 📝 License

ISC

## 👤 Author

Built as part of a technical assessment to demonstrate real-time web application development skills.

## 🙏 Acknowledgments

- Built with vanilla JavaScript (no frameworks)
- Uses Socket.io for WebSocket communication
- Express.js for HTTP server
- HTML5 Canvas API for drawing

---

**Note:** This project demonstrates proficiency in:
- Real-time bidirectional communication
- Canvas API manipulation
- State management
- Conflict resolution in collaborative applications
- Clean code architecture and separation of concerns
