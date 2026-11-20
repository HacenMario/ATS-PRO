import { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { corsOrigins } from '../config/env';
import { verifySocketToken } from '../services/tokens';

let io: Server | null = null;

/** Initialize Socket.IO with JWT-based handshake (short-lived socket token). */
export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || corsOrigins.includes(origin) || corsOrigins.length === 0) cb(null, true);
        else cb(new Error('origin not allowed'));
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const payload = token ? verifySocketToken(token) : null;
    if (!payload) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.userId = payload.userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(`user:${userId}`);
    socket.on('disconnect', () => {
      socket.leave(`user:${userId}`);
    });
  });

  return io;
}

/** Emit to a single user's realtime room. No-op when realtime is unavailable. */
export function emitToUser(userId: string, event: string, payload: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export function getIo(): Server | null {
  return io;
}
