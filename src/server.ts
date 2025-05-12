import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { handleAuth } from './handlers/authHandler';
import { handleLobby } from './handlers/lobbyHandler';
import { handleGame } from './handlers/gameHandler';
import { handleSession } from './handlers/sessionHandler';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
app.use(cors());
app.use(helmet());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store client connections
interface Client {
  id: string;
  ws: WebSocket;
  playerId: string | null;
  playerName: string | null;
  sessionId: string | null;
}

const clients = new Map<string, Client>();

wss.on('connection', (ws: WebSocket) => {
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
  logger.info(`Client connected: ${clientId}`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connection_status',
    data: { connected: true, clientId }
  }));

  ws.on('message', async (message: string) => {
    try {
      const parsedMessage = JSON.parse(message.toString());
      const { type, data } = parsedMessage;
      
      logger.info(`Received message type: ${type} from client: ${clientId}`);

      // Route message to appropriate handler
      switch (type) {
        case 'auth':
          await handleAuth(ws, data, client, clients);
          break;
        case 'join_game_session':
        case 'leave_game_session':
          await handleSession(ws, type, data, client, clients);
          break;
        case 'game_action':
          await handleGame(ws, data, client, clients);
          break;
        case 'create_lobby':
        case 'join_lobby':
        case 'leave_lobby':
        case 'ready':
        case 'start_game':
          await handleLobby(ws, type, data, client, clients);
          break;
        default:
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: `Unknown message type: ${type}` }
          }));
      }
    } catch (error) {
      logger.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Error processing message' }
      }));
    }
  });

  ws.on('close', () => {
    // Handle client disconnection
    const client = clients.get(clientId);
    if (client && client.sessionId) {
      // Notify other clients in the same session
      broadcastToSession(client.sessionId, {
        type: 'player_disconnected',
        data: { playerId: client.playerId }
      }, clientId);
    }
    
    clients.delete(clientId);
    logger.info(`Client disconnected: ${clientId}`);
  });
});

// Utility function to broadcast to all clients in a session
function broadcastToSession(sessionId: string, message: any, excludeClientId?: string) {
  for (const [id, client] of clients.entries()) {
    if (client.sessionId === sessionId && id !== excludeClientId) {
      client.ws.send(JSON.stringify(message));
    }
  }
}

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  logger.info(`WebSocket server is running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});