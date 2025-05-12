import { WebSocket } from 'ws';
import { logger } from '../utils/logger';

export async function handleAuth(
  ws: WebSocket,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  try {
    const { playerId, playerName } = data;
    
    if (!playerId) {
      ws.send(JSON.stringify({
        type: 'auth_error',
        data: { message: 'Player ID is required' }
      }));
      return;
    }
    
    // Update client with player info
    client.playerId = playerId;
    client.playerName = playerName || 'Anonymous';
    
    logger.info(`Player authenticated: ${playerId} (${client.playerName})`);
    
    // Send success response
    ws.send(JSON.stringify({
      type: 'auth_success',
      data: { playerId, playerName: client.playerName }
    }));
  } catch (error) {
    logger.error('Auth error:', error);
    ws.send(JSON.stringify({
      type: 'auth_error',
      data: { message: 'Authentication failed' }
    }));
  }
}