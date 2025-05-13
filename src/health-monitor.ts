import { Request, Response } from 'express';
import { WebSocketServer } from 'ws';
import os from 'os';

// Store server metrics
interface ServerMetrics {
  startTime: number;
  connections: {
    total: number;
    active: number;
  };
  messages: {
    received: number;
    sent: number;
  };
  errors: number;
  lastError?: {
    message: string;
    timestamp: number;
  };
}

// Initialize metrics
const metrics: ServerMetrics = {
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
const clientActivity = new Map<string, {
  connectedAt: number;
  lastActivity: number;
  messageCount: number;
}>();

// Update metrics when a client connects
export function trackClientConnect(clientId: string): void {
  metrics.connections.total++;
  metrics.connections.active++;
  
  clientActivity.set(clientId, {
    connectedAt: Date.now(),
    lastActivity: Date.now(),
    messageCount: 0,
  });
}

// Update metrics when a client disconnects
export function trackClientDisconnect(clientId: string): void {
  metrics.connections.active--;
  clientActivity.delete(clientId);
}

// Update metrics when a message is received
export function trackMessageReceived(clientId: string): void {
  metrics.messages.received++;
  
  const client = clientActivity.get(clientId);
  if (client) {
    client.lastActivity = Date.now();
    client.messageCount++;
    clientActivity.set(clientId, client);
  }
}

// Update metrics when a message is sent
export function trackMessageSent(): void {
  metrics.messages.sent++;
}

// Track errors
export function trackError(error: Error): void {
  metrics.errors++;
  metrics.lastError = {
    message: error.message,
    timestamp: Date.now(),
  };
  console.error('WebSocket error:', error);
}

// Basic health check handler
export function healthCheckHandler(req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - metrics.startTime) / 1000),
    connections: metrics.connections.active,
  });
}

// Detailed health check handler
export function detailedHealthCheckHandler(req: Request, res: Response): void {
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
      cpus: os.cpus().length,
      loadAvg: os.loadavg(),
      memory: {
        total: Math.round(os.totalmem() / 1024 / 1024),
        free: Math.round(os.freemem() / 1024 / 1024),
        process: formattedMemory,
      },
    },
    environment: process.env.NODE_ENV || 'development',
  });
}

// Debug connections handler
export function debugConnectionsHandler(req: Request, res: Response): void {
  const connectionData: any[] = [];
  
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
