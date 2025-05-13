import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import {
  healthCheckHandler,
  detailedHealthCheckHandler,
  debugConnectionsHandler,
  trackClientConnect,
  trackClientDisconnect,
  trackMessageReceived,
  trackMessageSent,
  trackError
} from './health-monitor';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Apply middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

// Health check endpoints
app.get('/health', healthCheckHandler);
app.get('/health/detailed', detailedHealthCheckHandler);
app.get('/debug/connections', debugConnectionsHandler);

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Store client connections
interface Client {
  id: string;
  ws: any;
  playerId: string | null;
  playerName: string | null;
  sessionId: string | null;
}

const clients = new Map<string, Client>();

// WebSocket connection handler
wss.on('connection', (ws) => {
  const clientId = uuidv4();
  
  // Initialize client
  const client: Client = {
    id: clientId,
    ws,
    playerId: null,
    playerName: null,
    sessionId: null
  };
  
  clients.set(clientId, client);
  console.log(`Client connected: ${clientId}`);
  
  // Track connection in metrics
  trackClientConnect(clientId);
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connection_status',
    data: { connected: true, clientId }
  }));
  trackMessageSent();
  
  // Handle messages
  ws.on('message', async (message: string) => {
    try {
      const parsedMessage = JSON.parse(message.toString());
      const { type, data } = parsedMessage;
      
      console.log(`Received message type: ${type} from client: ${clientId}`);
      trackMessageReceived(clientId);
      
      // Process message based on type
      switch (type) {
        case 'auth':
          // Handle authentication
          if (data && data.playerId) {
            client.playerId = data.playerId;
            client.playerName = data.playerName || 'Anonymous';
            
            ws.send(JSON.stringify({
              type: 'auth_success',
              data: { playerId: client.playerId, playerName: client.playerName }
            }));
            trackMessageSent();
          }
          break;
          
        case 'ping':
          // Respond to ping
          ws.send(JSON.stringify({
            type: 'pong',
            data: { timestamp: new Date().toISOString() }
          }));
          trackMessageSent();
          break;
          
        case 'echo':
          // Echo back the message (useful for testing)
          ws.send(JSON.stringify({
            type: 'echo_response',
            data: data,
            timestamp: new Date().toISOString()
          }));
          trackMessageSent();
          break;
          
        default:
          // Forward to appropriate handler based on message type
          // This is where you would add your game-specific logic
          ws.send(JSON.stringify({
            type: 'ack',
            data: { messageType: type, received: true }
          }));
          trackMessageSent();
      }
    } catch (error) {
      console.error('Error processing message:', error);
      trackError(error as Error);
      
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Error processing message' }
      }));
      trackMessageSent();
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    console.log(`Client disconnected: ${clientId}`);
    
    // Clean up
    clients.delete(clientId);
    trackClientDisconnect(clientId);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    trackError(error);
  });
  
  // Set up ping interval to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000);
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
  console.log(`WebSocket server available at ws://localhost:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
