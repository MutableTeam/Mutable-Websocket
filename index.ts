import express from 'express';
import http from 'http';
import WebSocket, { Server as WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { registerHealthEndpoints } from './health-monitor'; // Adjust path as needed

// Create Express app
const app = express();

// Register all health endpoints
registerHealthEndpoints(app);

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Rest of your existing WebSocket code...

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});