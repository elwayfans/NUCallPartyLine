import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin;

interface CallStatusEvent {
  type: 'call:status';
  callId: string;
  vapiCallId?: string;
  status: string;
  campaignId?: string;
}

interface CampaignProgressEvent {
  type: 'campaign:progress';
  campaignId: string;
  completedCalls: number;
  failedCalls: number;
  totalContacts: number;
}

interface TranscriptEvent {
  type: 'call:transcript';
  vapiCallId: string;
  role: string;
  content: string;
  isFinal: boolean;
}

interface CallCompleteEvent {
  type: 'call:complete';
  callId: string;
  vapiCallId?: string;
  status: string;
  campaignId?: string;
  duration?: number;
}

type WebSocketEventHandler = {
  onCallStatus?: (event: CallStatusEvent) => void;
  onCampaignProgress?: (event: CampaignProgressEvent) => void;
  onTranscript?: (event: TranscriptEvent) => void;
  onCallComplete?: (event: CallCompleteEvent) => void;
};

export function useWebSocket(handlers: WebSocketEventHandler = {}) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });

    socket.on('call:status', (event: CallStatusEvent) => {
      handlers.onCallStatus?.(event);
    });

    socket.on('campaign:progress', (event: CampaignProgressEvent) => {
      handlers.onCampaignProgress?.(event);
    });

    socket.on('call:transcript', (event: TranscriptEvent) => {
      handlers.onTranscript?.(event);
    });

    socket.on('call:complete', (event: CallCompleteEvent) => {
      handlers.onCallComplete?.(event);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const joinCampaign = useCallback((campaignId: string) => {
    socketRef.current?.emit('join:campaign', campaignId);
  }, []);

  const leaveCampaign = useCallback((campaignId: string) => {
    socketRef.current?.emit('leave:campaign', campaignId);
  }, []);

  const joinCall = useCallback((callId: string) => {
    socketRef.current?.emit('join:call', callId);
  }, []);

  const leaveCall = useCallback((callId: string) => {
    socketRef.current?.emit('leave:call', callId);
  }, []);

  return {
    socket: socketRef.current,
    joinCampaign,
    leaveCampaign,
    joinCall,
    leaveCall,
  };
}
