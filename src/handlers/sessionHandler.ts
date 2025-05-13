import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// In-memory storage for game sessions
const gameSessions = new Map<string, {
  id: string;
  gameId: string;
  players: { id: string; name: string }[];
  state: any;
  startedAt: number;
}>();

export async function handleSession(
  ws: WebSocket,
  type: string,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  try {
    switch (type) {
      case 'join_game_session':
        await joinGameSession(ws, data, client, clients);
        break;
      case 'leave_game_session':
        await leaveGameSession(ws, data, client, clients);
        break;
      default:
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: `Unknown session action: ${type}` }
        }));
    }
  } catch (error) {
    logger.error('Session error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Session operation failed' }
    }));
  }
}

async function joinGameSession(
  ws: WebSocket,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  const { gameId, sessionId, playerId, playerName } = data;
  
  if (!playerId || !sessionId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Player ID and session ID are required' }
    }));
    return;
  }
  
  // Check if session exists, create if not
  if (!gameSessions.has(sessionId)) {
    gameSessions.set(sessionId, {
      id: sessionId,
      gameId,
      players: [],
      state: { status: 'initializing' },
      startedAt: Date.now()
    });
  }
  
  const session = gameSessions.get(sessionId)!;
  
  // Add player to session if not already there
  if (!session.players.some(p => p.id === playerId)) {
    session.players.push({ id: playerId, name: playerName || 'Anonymous' });
  }
  
  // Update client with session info
  client.sessionId = sessionId;
  
  // Notify all clients in the session about the new player
  broadcastToSession(sessionId, {
    type: 'player_joined',
    data: { 
      playerId, 
      playerName: playerName || 'Anonymous',
      sessionId,
      players: session.players
    }
  }, clients);
  
  // Send session info to the joining client
  ws.send(JSON.stringify({
    type: 'game_session_joined',
    data: {
      sessionId,
      gameId: session.gameId,
      players: session.players,
      state: session.state
    }
  }));
  
  logger.info(`Player ${playerId} joined session ${sessionId}`);
}

async function leaveGameSession(
  ws: WebSocket,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  const { sessionId, playerId } = data;
  
  if (!sessionId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Session ID is required' }
    }));
    return;
  }
  
  // Check if session exists
  if (!gameSessions.has(sessionId)) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Session not found' }
    }));
    return;
  }
  
  const session = gameSessions.get(sessionId)!;
  
  // Remove player from session
  session.players = session.players.filter(p => p.id !== playerId);
  
  // Update client
  client.sessionId = null;
  
  // Notify other clients
  broadcastToSession(sessionId, {
    type: 'player_left',
    data: { playerId, sessionId, players: session.players }
  }, clients);
  
  // If no players left, clean up the session
  if (session.players.length === 0) {
    gameSessions.delete(sessionId);
    logger.info(`Session ${sessionId} removed (no players left)`);
  }
  
  // Send confirmation to the client
  ws.send(JSON.stringify({
    type: 'game_session_left',
    data: { sessionId }
  }));
  
  logger.info(`Player ${playerId} left session ${sessionId}`);
}

function broadcastToSession(sessionId: string, message: any, clients: Map<string, any>, excludeClientId?: string) {
  for (const [id, client] of clients.entries()) {
    if (client.sessionId === sessionId && id !== excludeClientId) {
      client.ws.send(JSON.stringify(message));
    }
  }
}