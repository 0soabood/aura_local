import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { EventEmitter } from 'events';

const debugClients = new Map<string, Set<WebSocket>>();

export const debugEmitter = new EventEmitter();

export function broadcastEvent(sessionId: string, event: any) {
  // 1. Emit locally for SSE streams inside the same process
  debugEmitter.emit(`debug:${sessionId}`, { ...event, timestamp: Date.now() });

  // 2. Broadcast to any attached WebSockets
  const clients = debugClients.get(sessionId);
  if (!clients) return;
  const payload = JSON.stringify({ ...event, timestamp: Date.now() });
  clients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  });
}

export function registerDebugWebSocket(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    if (request.url?.startsWith('/api/debug/')) {
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws: WebSocket, req: any) => {
    const sessionId = req.url?.split('/').pop() ?? 'unknown';
    if (!debugClients.has(sessionId)) debugClients.set(sessionId, new Set());
    debugClients.get(sessionId)!.add(ws);
    ws.onclose = () => debugClients.get(sessionId)?.delete(ws);
  });
}