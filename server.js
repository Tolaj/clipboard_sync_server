const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// HTML Page served to browser clients
const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Clipboard Sync Logs</title>
  <style>
    body { background: #121212; color: #eee; font-family: monospace; padding: 1rem; }
    #logs { max-height: 90vh; overflow-y: auto; list-style: none; padding-left: 0; }
    #logs li { padding: 0.3rem 0; border-bottom: 1px solid #333; }
  </style>
</head>
<body>
  <h1>Clipboard Sync Logs</h1>
  <ul id="logs"></ul>

  <script>
    const logs = document.getElementById('logs');
    const ws = new WebSocket('ws://' + location.host);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'register', role: 'viewer' }));
      addLog('Connected to server');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'log') {
          addLog(msg.data);
        }
      } catch (err) {
        addLog("Invalid message: " + event.data);
      }
    };

    ws.onclose = () => addLog('Disconnected from server');
    ws.onerror = () => addLog('WebSocket error');

    function addLog(message) {
      const li = document.createElement('li');
      li.textContent = message;
      logs.appendChild(li);
      window.scrollTo(0, document.body.scrollHeight);
    }
  </script>
</body>
</html>
`;

const clients = new Map(); // WebSocket -> role (clipboard or viewer)

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      console.log('Invalid JSON:', data);
      return;
    }

    // Handle registration
    if (msg.type === 'register') {
      clients.set(ws, msg.role);
      console.log(`Client registered as ${msg.role}`);
      return;
    }

    // Handle clipboard sync
    if (msg.type === 'clipboard') {
      console.log('Clipboard received:', msg.data);

      // Broadcast to everyone else
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN && client !== ws) {
          const role = clients.get(client);
          if (role === 'clipboard') {
            client.send(JSON.stringify({ type: 'clipboard', data: msg.data }));
          } else if (role === 'viewer') {
            client.send(JSON.stringify({ type: 'log', data: msg.data }));
          }
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
