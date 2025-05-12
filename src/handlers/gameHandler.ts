import { WebSocket } from 'ws';
import { logger } from '../utils/logger';

export async function handleGame(
  ws: WebSocket,
  data: any,
  client: any,
  clients: Map<string, any>
) {
  try {
    const { sessionId, playerId, action, data: actionData } = data;
    
    if (!sessionId || !playerId || !action) {
      ws.send(JSON.stringify({
        type: 'error',
        data: { message: 'Session ID, player ID, and action are required' }
      }));
      return;
    }
    
    // Broadcast the game action to all clients in the session
    broadcastToSession(sessionId, {
      type: 'game_action',
      data: {
        playerId,
        action,
        data: actionData,
        timestamp: Date.now()
      }
    }, clients, client.id);
    
    logger.info(`Game action ${action} from player ${playerId} in session ${sessionId}`);
  } catch (error) {
    logger.error('Game action error:', error);
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: 'Failed to process game action' }
    }));
  }
}

function broadcastToSession(sessionId: string, message: any, clients: Map<string, any>, excludeClientId?: string) {
  for (const [id, client] of clients.entries()) {
    if (client.sessionId === sessionId && id !== excludeClientId) {
      client.ws.send(JSON.stringify(message));
    }
  }
}