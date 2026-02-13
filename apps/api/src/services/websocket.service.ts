import type { Server as SocketIOServer, Socket } from 'socket.io';

export class WebSocketService {
  private io: SocketIOServer;
  private connectedClients = new Map<string, Socket>();

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      this.connectedClients.set(socket.id, socket);

      // Join campaign-specific rooms
      socket.on('join:campaign', (campaignId: string) => {
        socket.join(`campaign:${campaignId}`);
        console.log(`Client ${socket.id} joined campaign:${campaignId}`);
      });

      socket.on('leave:campaign', (campaignId: string) => {
        socket.leave(`campaign:${campaignId}`);
        console.log(`Client ${socket.id} left campaign:${campaignId}`);
      });

      // Join call-specific rooms for live transcript
      socket.on('join:call', (callId: string) => {
        socket.join(`call:${callId}`);
        console.log(`Client ${socket.id} joined call:${callId}`);
      });

      socket.on('leave:call', (callId: string) => {
        socket.leave(`call:${callId}`);
        console.log(`Client ${socket.id} left call:${callId}`);
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket.id);
      });
    });
  }

  /**
   * Emit call status update
   */
  emitCallStatus(call: {
    id: string;
    vapiCallId?: string | null;
    status: string;
    campaignId?: string | null;
  }): void {
    const event = {
      type: 'call:status',
      callId: call.id,
      vapiCallId: call.vapiCallId,
      status: call.status,
      campaignId: call.campaignId,
    };

    // Broadcast to all clients
    this.io.emit('call:status', event);

    // Also emit to campaign room if applicable
    if (call.campaignId) {
      this.io.to(`campaign:${call.campaignId}`).emit('call:status', event);
    }
  }

  /**
   * Emit campaign progress update
   */
  emitCampaignProgress(progress: {
    campaignId: string;
    completedCalls: number;
    failedCalls: number;
    totalContacts: number;
  }): void {
    const event = {
      type: 'campaign:progress',
      ...progress,
    };

    this.io.to(`campaign:${progress.campaignId}`).emit('campaign:progress', event);
    this.io.emit('campaign:progress', event);
  }

  /**
   * Emit live transcript update
   */
  emitTranscript(
    vapiCallId: string,
    transcript: { role: string; content: string; isFinal: boolean }
  ): void {
    const event = {
      type: 'call:transcript',
      vapiCallId,
      ...transcript,
    };

    // Find call ID from VAPI call ID and emit to that room
    this.io.emit('call:transcript', event);
  }

  /**
   * Emit call completion event
   */
  emitCallComplete(call: {
    id: string;
    vapiCallId?: string | null;
    status: string;
    campaignId?: string | null;
    duration?: number | null;
  }): void {
    const event = {
      type: 'call:complete',
      callId: call.id,
      vapiCallId: call.vapiCallId,
      status: call.status,
      campaignId: call.campaignId,
      duration: call.duration,
    };

    this.io.emit('call:complete', event);

    if (call.campaignId) {
      this.io.to(`campaign:${call.campaignId}`).emit('call:complete', event);
    }
  }

  /**
   * Get number of connected clients
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
}
