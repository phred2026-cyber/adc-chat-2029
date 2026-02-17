# ADC Class of 2029 Chat App 🎓

A real-time chat application for the ADC Class of 2029.

## Features

- 💬 Real-time messaging using WebSockets (Socket.io)
- 👤 Simple name + message interface (no authentication required)
- 📱 Responsive design (works on mobile and desktop)
- 💾 Message history (last 100 messages stored in memory)
- 🎨 Modern gradient UI design
- 🔒 XSS protection with HTML escaping
- 💨 Auto-scrolling to latest messages
- 📝 Name saved in browser localStorage

## Tech Stack

**Backend:**
- Node.js
- Express.js
- Socket.io (WebSocket server)

**Frontend:**
- HTML5
- CSS3 (with gradients and animations)
- Vanilla JavaScript
- Socket.io client

## Running the App

```bash
cd /home/elijah/.openclaw/workspace/adc-chat-2029
npm install
npm start
```

## Access

**Local network:** http://192.168.68.75:3000

Anyone on the same network can access the chat by visiting this URL!

## How to Use

1. Open http://192.168.68.75:3000 in your browser
2. Enter your name in the "Your name" box
3. Type your message
4. Click "Send" or press Enter
5. Your message appears for everyone in real-time!

## File Structure

```
adc-chat-2029/
├── server.js           # Express + Socket.io server
├── package.json        # Node.js dependencies
├── public/
│   ├── index.html     # Main HTML page
│   ├── style.css      # Styling
│   └── app.js         # Client-side JavaScript
└── README.md          # This file
```

## Features Details

- **Real-time:** Messages appear instantly for all connected users
- **Persistent Name:** Your name is saved in browser storage
- **Message History:** New users see the last 100 messages
- **Auto-scroll:** Chat automatically scrolls to newest messages
- **Responsive:** Works on phones, tablets, and computers

---

Built with 🔥 by P.H.R.E.D
