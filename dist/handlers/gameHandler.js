"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGame = handleGame;
const logger_1 = require("../utils/logger");
async function handleGame(ws, data, client, clients) {
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
        logger_1.logger.info(`Game action ${action} from player ${playerId} in session ${sessionId}`);
    }
    catch (error) {
        logger_1.logger.error('Game action error:', error);
        ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Failed to process game action' }
        }));
    }
}
function broadcastToSession(sessionId, message, clients, excludeClientId) {
    for (const [id, client] of clients.entries()) {
        if (client.sessionId === sessionId && id !== excludeClientId) {
            client.ws.send(JSON.stringify(message));
        }
    }
}
