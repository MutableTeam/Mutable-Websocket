"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackClientConnect = trackClientConnect;
exports.trackClientDisconnect = trackClientDisconnect;
exports.trackMessageReceived = trackMessageReceived;
exports.trackMessageSent = trackMessageSent;
exports.trackError = trackError;
exports.healthCheckHandler = healthCheckHandler;
exports.detailedHealthCheckHandler = detailedHealthCheckHandler;
exports.debugConnectionsHandler = debugConnectionsHandler;
exports.registerHealthEndpoints = registerHealthEndpoints;
const os_1 = __importDefault(require("os"));
// Initialize metrics
const metrics = {
    startTime: Date.now(),
    connections: {
        total: 0,
        active: 0,
    },
    messages: {
        received: 0,
        sent: 0,
    },
    errors: 0,
};
// Track client activity
const clientActivity = new Map();
// Update metrics when a client connects
function trackClientConnect(clientId) {
    metrics.connections.total++;
    metrics.connections.active++;
    clientActivity.set(clientId, {
        connectedAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
    });
}
// Update metrics when a client disconnects
function trackClientDisconnect(clientId) {
    metrics.connections.active--;
    clientActivity.delete(clientId);
}
// Update metrics when a message is received
function trackMessageReceived(clientId) {
    metrics.messages.received++;
    const client = clientActivity.get(clientId);
    if (client) {
        client.lastActivity = Date.now();
        client.messageCount++;
        clientActivity.set(clientId, client);
    }
}
// Update metrics when a message is sent
function trackMessageSent() {
    metrics.messages.sent++;
}
// Track errors
function trackError(error) {
    metrics.errors++;
    metrics.lastError = {
        message: error.message,
        timestamp: Date.now(),
    };
    console.error('WebSocket error:', error);
}
// Basic health check handler
function healthCheckHandler(req, res) {
    try {
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - metrics.startTime) / 1000),
            connections: metrics.connections.active,
        });
    }
    catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ status: 'error', message: 'Health check failed' });
    }
}
// Detailed health check handler
function detailedHealthCheckHandler(req, res) {
    try {
        // Get active connections (activity in last 60 seconds)
        const now = Date.now();
        let activeConnections = 0;
        clientActivity.forEach((client) => {
            if (now - client.lastActivity < 60000) {
                activeConnections++;
            }
        });
        // Calculate memory usage in MB
        const memoryUsage = process.memoryUsage();
        const formattedMemory = {
            rss: Math.round(memoryUsage.rss / 1024 / 1024),
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            external: Math.round(memoryUsage.external / 1024 / 1024),
        };
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - metrics.startTime) / 1000),
            connections: {
                total: metrics.connections.total,
                current: metrics.connections.active,
                active: activeConnections,
            },
            messages: metrics.messages,
            errors: {
                count: metrics.errors,
                lastError: metrics.lastError,
            },
            system: {
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                cpus: os_1.default.cpus().length,
                loadAvg: os_1.default.loadavg(),
                memory: {
                    total: Math.round(os_1.default.totalmem() / 1024 / 1024),
                    free: Math.round(os_1.default.freemem() / 1024 / 1024),
                    process: formattedMemory,
                },
            },
            environment: process.env.NODE_ENV || 'development',
        });
    }
    catch (error) {
        console.error('Detailed health check error:', error);
        res.status(500).json({ status: 'error', message: 'Detailed health check failed' });
    }
}
// Debug connections handler
function debugConnectionsHandler(req, res) {
    try {
        const connectionData = [];
        clientActivity.forEach((client, id) => {
            connectionData.push({
                id,
                connectedAt: new Date(client.connectedAt).toISOString(),
                lastActivity: new Date(client.lastActivity).toISOString(),
                messageCount: client.messageCount,
                isActive: (Date.now() - client.lastActivity < 60000),
                idleTime: Math.floor((Date.now() - client.lastActivity) / 1000),
            });
        });
        res.status(200).json({
            total: connectionData.length,
            connections: connectionData,
        });
    }
    catch (error) {
        console.error('Debug connections error:', error);
        res.status(500).json({ status: 'error', message: 'Debug connections failed' });
    }
}
// Register all health endpoints to an Express app
function registerHealthEndpoints(app) {
    app.get('/health', healthCheckHandler);
    app.get('/health/detailed', detailedHealthCheckHandler);
    app.get('/health/connections', debugConnectionsHandler);
    console.log('Health check endpoints registered: /health, /health/detailed, /health/connections');
}
