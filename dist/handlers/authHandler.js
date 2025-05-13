"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAuth = handleAuth;
const logger_1 = require("../utils/logger");
async function handleAuth(ws, data, client, clients) {
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
        logger_1.logger.info(`Player authenticated: ${playerId} (${client.playerName})`);
        // Send success response
        ws.send(JSON.stringify({
            type: 'auth_success',
            data: { playerId, playerName: client.playerName }
        }));
    }
    catch (error) {
        logger_1.logger.error('Auth error:', error);
        ws.send(JSON.stringify({
            type: 'auth_error',
            data: { message: 'Authentication failed' }
        }));
    }
}
