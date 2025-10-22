import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';

interface Client {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  lastActivity: Date;
}

const clients = new Map<string, Client>();

export function setupWebSocket(wss: WebSocketServer): void {
  console.log('🔌 Setting up WebSocket server...');
  
  wss.on('connection', (ws: WebSocket, request) => {
    const clientId = uuidv4();
    const client: Client = {
      id: clientId,
      ws,
      subscriptions: new Set(),
      lastActivity: new Date()
    };
    
    clients.set(clientId, client);
    console.log(`📱 Client connected: ${clientId} (${clients.size} total)`);
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connection',
      data: {
        clientId,
        message: 'Connected to SoC Pilot WebSocket server',
        timestamp: new Date().toISOString()
      }
    }));
    
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(client, message);
      } catch (error) {
        console.error('WebSocket message parse error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          data: {
            message: 'Invalid message format',
            timestamp: new Date().toISOString()
          }
        }));
      }
    });
    
    ws.on('close', () => {
      clients.delete(clientId);
      console.log(`📱 Client disconnected: ${clientId} (${clients.size} total)`);
    });
    
    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error);
      clients.delete(clientId);
    });
    
    // Update last activity
    client.lastActivity = new Date();
  });
  
  // Cleanup inactive clients every 5 minutes
  setInterval(() => {
    const now = new Date();
    const timeout = 5 * 60 * 1000; // 5 minutes
    
    for (const [clientId, client] of clients.entries()) {
      if (now.getTime() - client.lastActivity.getTime() > timeout) {
        console.log(`🧹 Cleaning up inactive client: ${clientId}`);
        client.ws.terminate();
        clients.delete(clientId);
      }
    }
  }, 5 * 60 * 1000);
  
  console.log('✅ WebSocket server setup complete');
}

function handleMessage(client: Client, message: any): void {
  client.lastActivity = new Date();
  
  switch (message.type) {
    case 'subscribe':
      handleSubscribe(client, message.data);
      break;
      
    case 'unsubscribe':
      handleUnsubscribe(client, message.data);
      break;
      
    case 'ping':
      client.ws.send(JSON.stringify({
        type: 'pong',
        data: {
          timestamp: new Date().toISOString()
        }
      }));
      break;
      
    case 'chat_typing':
      broadcastToSubscribers('chat_updates', {
        type: 'typing',
        clientId: client.id,
        timestamp: new Date().toISOString()
      });
      break;
      
    default:
      console.log(`Unknown message type: ${message.type}`);
  }
}

function handleSubscribe(client: Client, data: any): void {
  const { channel } = data;
  if (channel) {
    client.subscriptions.add(channel);
    client.ws.send(JSON.stringify({
      type: 'subscribed',
      data: {
        channel,
        timestamp: new Date().toISOString()
      }
    }));
    console.log(`📺 Client ${client.id} subscribed to ${channel}`);
  }
}

function handleUnsubscribe(client: Client, data: any): void {
  const { channel } = data;
  if (channel) {
    client.subscriptions.delete(channel);
    client.ws.send(JSON.stringify({
      type: 'unsubscribed',
      data: {
        channel,
        timestamp: new Date().toISOString()
      }
    }));
    console.log(`📺 Client ${client.id} unsubscribed from ${channel}`);
  }
}

export function broadcastToSubscribers(channel: string, data: any): void {
  const message = JSON.stringify({
    type: 'broadcast',
    channel,
    data: {
      ...data,
      timestamp: new Date().toISOString()
    }
  });
  
  let sentCount = 0;
  for (const client of clients.values()) {
    if (client.subscriptions.has(channel) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
      sentCount++;
    }
  }
  
  if (sentCount > 0) {
    console.log(`📡 Broadcast to ${sentCount} clients on channel: ${channel}`);
  }
}

export function notifyComponentLibraryUpdate(): void {
  broadcastToSubscribers('component_library', {
    type: 'library_updated',
    message: 'Component library has been updated'
  });
}

export function notifyDiagramUpdate(projectId: string, diagramData: any): void {
  broadcastToSubscribers('diagram_updates', {
    type: 'diagram_updated',
    projectId,
    diagramData
  });
}

export function notifyValidationUpdate(projectId: string, results: any): void {
  broadcastToSubscribers('validation_updates', {
    type: 'validation_completed',
    projectId,
    results
  });
}