"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const uuid_1 = require("uuid");
const health_monitor_1 = require("./health-monitor");
// Load environment variables
dotenv_1.default.config();
// Create Express app
const app = (0, express_1.default)();
// Apply middleware
app.use((0, cors_1.default)());
app.use((0, helmet_1.default)());
app.use(express_1.default.json());
// Health check endpoints
app.get('/health', health_monitor_1.healthCheckHandler);
app.get('/health/detailed', health_monitor_1.detailedHealthCheckHandler);
app.get('/debug/connections', health_monitor_1.debugConnectionsHandler);
// Create HTTP server
const server = http_1.default.createServer(app);
// Create WebSocket server
const wss = new ws_1.Server({ server });
const clients = new Map();
// WebSocket connection handler
wss.on('connection', (ws) => {
    const clientId = (0, uuid_1.v4)();
    // Initialize client
    const client = {
        id: clientId,
        ws,
        playerId: null,
        playerName: null,
        sessionId: null
    };
    clients.set(clientId, client);
    console.log(`Client connected: ${clientId}`);
    // Track connection in metrics
    (0, health_monitor_1.trackClientConnect)(clientId);
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'connection_status',
        data: { connected: true, clientId }
    }));
    (0, health_monitor_1.trackMessageSent)();
    // Handle messages
    ws.on('message', async (message) => {
        try {
            const parsedMessage = JSON.parse(message.toString());
            const { type, data } = parsedMessage;
            console.log(`Received message type: ${type} from client: ${clientId}`);
            (0, health_monitor_1.trackMessageReceived)(clientId);
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
                        (0, health_monitor_1.trackMessageSent)();
                    }
                    break;
                case 'ping':
                    // Respond to ping
                    ws.send(JSON.stringify({
                        type: 'pong',
                        data: { timestamp: new Date().toISOString() }
                    }));
                    (0, health_monitor_1.trackMessageSent)();
                    break;
                case 'echo':
                    // Echo back the message (useful for testing)
                    ws.send(JSON.stringify({
                        type: 'echo_response',
                        data: data,
                        timestamp: new Date().toISOString()
                    }));
                    (0, health_monitor_1.trackMessageSent)();
                    break;
                default:
                    // Forward to appropriate handler based on message type
                    // This is where you would add your game-specific logic
                    ws.send(JSON.stringify({
                        type: 'ack',
                        data: { messageType: type, received: true }
                    }));
                    (0, health_monitor_1.trackMessageSent)();
            }
        }
        catch (error) {
            console.error('Error processing message:', error);
            (0, health_monitor_1.trackError)(error);
            ws.send(JSON.stringify({
                type: 'error',
                data: { message: 'Error processing message' }
            }));
            (0, health_monitor_1.trackMessageSent)();
        }
    });
    // Handle disconnection
    ws.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        // Clean up
        clients.delete(clientId);
        (0, health_monitor_1.trackClientDisconnect)(clientId);
    });
    // Handle errors
    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        (0, health_monitor_1.trackError)(error);
    });
    // Set up ping interval to keep connection alive
    const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
            ws.ping();
        }
        else {
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
