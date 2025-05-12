import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// In-memory storage for lobbies
const lobbies = new Map<string, {
  id: string;
  gameId: string;
  hostId: string;
  hostName: string;
  gameMode: string;
  gameModeName: string;
  maxPlayers: number;
  wager: number;
  players: { id: string; name: string; isReady: boolean }[];
  status: 'waiting' | 'full' | 'in-progress';
  createdAt: number;
}>();

export async function handleLobby(
  ws: WebSocket,
  type: string,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  try {
    switch (type) {
      case 'create_lobby':
        await createLobby(ws, data, client, clients);
        break;
      case 'join_lobby':
        await joinLobby(ws, data, client, clients);
        break;
      case 'leave_lobby':
        await leaveLobby(ws, data, client, clients);
        break;
      case 'ready':
        await setPlayerReady(ws, data, client, clients);
        break;
      case 'start_game':
        await startGame(ws, data, client, clients);
        break;
      default:
        ws.send(JSON.stringify({
          type: 'error',
          data: { message: `Unknown lobby action: ${type}` }
        }));
    }
  } catch (error) {
    logger.error('Lobby error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Lobby operation failed' }
    }));
  }
}

async function createLobby(
  ws: WebSocket,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  const { gameId, hostId, hostName, gameMode, gameModeName, maxPlayers, wager } = data;
  
  if (!gameId || !hostId || !gameMode || !maxPlayers) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Missing required lobby information' }
    }));
    return;
  }
  
  const lobbyId = uuidv4();
  const lobby = {
    id: lobbyId,
    gameId,
    hostId,
    hostName: hostName || 'Anonymous',
    gameMode,
    gameModeName: gameModeName || gameMode,
    maxPlayers,
    wager: wager || 0,
    players: [{ id: hostId, name: hostName || 'Anonymous', isReady: true }], // Host is automatically ready
    status: 'waiting' as const,
    createdAt: Date.now()
  };
  
  lobbies.set(lobbyId, lobby);
  
  // Send confirmation to the client
  ws.send(JSON.stringify({
    type: 'lobby_created',
    data: { lobby }
  }));
  
  logger.info(`Lobby ${lobbyId} created by ${hostId}`);
}

async function joinLobby(
  ws: WebSocket,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  const { lobbyId, playerId, playerName } = data;
  
  if (!lobbyId || !playerId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Lobby ID and player ID are required' }
    }));
    return;
  }
  
  // Check if lobby exists
  if (!lobbies.has(lobbyId)) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Lobby not found' }
    }));
    return;
  }
  
  const lobby = lobbies.get(lobbyId)!;
  
  // Check if lobby is full or in progress
  if (lobby.status !== 'waiting') {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: `Cannot join lobby: ${lobby.status}` }
    }));
    return;
  }
  
  // Check if player is already in the lobby
  if (lobby.players.some(p => p.id === playerId)) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Player already in lobby' }
    }));
    return;
  }
  
  // Add player to lobby
  lobby.players.push({
    id: playerId,
    name: playerName || 'Anonymous',
    isReady: false
  });
  
  // Update lobby status if full
  if (lobby.players.length === lobby.maxPlayers) {
    lobby.status = 'full';
  }
  
  // Notify all clients in the lobby
  notifyLobbyUpdate(lobbyId, clients);
  
  // Send confirmation to the client
  ws.send(JSON.stringify({
    type: 'lobby_joined',
    data: { lobby }
  }));
  
  logger.info(`Player ${playerId} joined lobby ${lobbyId}`);
}

async function leaveLobby(
  ws: WebSocket,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  const { lobbyId, playerId } = data;
  
  if (!lobbyId || !playerId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Lobby ID and player ID are required' }
    }));
    return;
  }
  
  // Check if lobby exists
  if (!lobbies.has(lobbyId)) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Lobby not found' }
    }));
    return;
  }
  
  const lobby = lobbies.get(lobbyId)!;
  
  // Remove player from lobby
  lobby.players = lobby.players.filter(p => p.id !== playerId);
  
  // If host leaves, assign a new host or delete the lobby
  if (playerId === lobby.hostId) {
    if (lobby.players.length > 0) {
      // Assign the next player as host
      const newHost = lobby.players[0];
      lobby.hostId = newHost.id;
      lobby.hostName = newHost.name;
      newHost.isReady = true; // New host is automatically ready
    } else {
      // Delete the lobby if no players left
      lobbies.delete(lobbyId);
      
      // Send confirmation to the client
      ws.send(JSON.stringify({
        type: 'lobby_deleted',
        data: { lobbyId }
      }));
      
      logger.info(`Lobby ${lobbyId} deleted (no players left)`);
      return;
    }
  }
  
  // Update lobby status
  if (lobby.status === 'full' && lobby.players.length < lobby.maxPlayers) {
    lobby.status = 'waiting';
  }
  
  // Notify all clients in the lobby
  notifyLobbyUpdate(lobbyId, clients);
  
  // Send confirmation to the client
  ws.send(JSON.stringify({
    type: 'lobby_left',
    data: { lobbyId }
  }));
  
  logger.info(`Player ${playerId} left lobby ${lobbyId}`);
}

async function setPlayerReady(
  ws: WebSocket,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  const { lobbyId, playerId, isReady } = data;
  
  if (!lobbyId || !playerId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Lobby ID and player ID are required' }
    }));
    return;
  }
  
  // Check if lobby exists
  if (!lobbies.has(lobbyId)) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Lobby not found' }
    }));
    return;
  }
  
  const lobby = lobbies.get(lobbyId)!;
  
  // Find player in lobby
  const player = lobby.players.find(p => p.id === playerId);
  if (!player) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Player not in lobby' }
    }));
    return;
  }
  
  // Update player ready status
  player.isReady = isReady !== undefined ? isReady : !player.isReady;
  
  // Notify all clients in the lobby
  notifyLobbyUpdate(lobbyId, clients);
  
  // Check if all players are ready
  const allReady = lobby.players.length >= 2 && lobby.players.every(p => p.isReady);
  if (allReady) {
    // Notify clients that all players are ready
    for (const [_, client] of clients.entries()) {
      const playerInLobby = lobby.players.some(p => p.id === client.playerId);
      if (playerInLobby) {
        client.ws.send(JSON.stringify({
          type: 'lobby_all_ready',
          data: { lobbyId }
        }));
      }
    }
  }
  
  // Send confirmation to the client
  ws.send(JSON.stringify({
    type: 'player_ready_updated',
    data: { lobbyId, playerId, isReady: player.isReady }
  }));
  
  logger.info(`Player ${playerId} ready status updated to ${player.isReady} in lobby ${lobbyId}`);
}

async function startGame(
  ws: WebSocket,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  const { lobbyId, hostId } = data;
  
  if (!lobbyId || !hostId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Lobby ID and host ID are required' }
    }));
    return;
  }
  
  // Check if lobby exists
  if (!lobbies.has(lobbyId)) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Lobby not found' }
    }));
    return;
  }
  
  const lobby = lobbies.get(lobbyId)!;
  
  // Verify that the request is from the host
  if (hostId !== lobby.hostId) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Only the host can start the game' }
    }));
    return;
  }
  
  // Check if all players are ready
  const allReady = lobby.players.every(p => p.isReady);
  if (!allReady) {
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Not all players are ready' }
    }));
    return;
  }
  
  // Create a new game session
  const sessionId = uuidv4();
  
  // Update lobby status
  lobby.status = 'in-progress';
  
  // Notify all clients in the lobby
  for (const [_, client] of clients.entries()) {
    const player = lobby.players.find(p => p.id === client.playerId);
    if (player) {
      client.ws.send(JSON.stringify({
        type: 'game_starting',
        data: {
          lobbyId,
          sessionId,
          gameId: lobby.gameId,
          players: lobby.players.map(p => ({ id: p.id, name: p.name }))
        }
      }));
    }
  }
  
  // Send confirmation to the host
  ws.send(JSON.stringify({
    type: 'game_started',
    data: {
      lobbyId,
      sessionId,
      gameId: lobby.gameId,
      players: lobby.players.map(p => ({ id: p.id, name: p.name }))
    }
  }));
  
  logger.info(`Game started for lobby ${lobbyId}, session ${sessionId}`);
}

function notifyLobbyUpdate(lobbyId: string, clients: Map<string, any>) {
  if (!lobbies.has(lobbyId)) return;
  
  const lobby = lobbies.get(lobbyId)!;
  
  // Broadcast to all clients with players in this lobby
  for (const [_, client] of clients.entries()) {
    const playerInLobby = lobby.players.some(p => p.id === client.playerId);
    if (playerInLobby) {
      client.ws.send(JSON.stringify({
        type: 'lobby_updated',
        data: { lobby }
      }));
    }
  }
}