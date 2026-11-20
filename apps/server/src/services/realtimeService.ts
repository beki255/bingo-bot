import type { Server as SocketIOServer } from "socket.io";

export interface WalletUpdateEvent {
  balance: number;
  reason?: string;
  prize?: number;
  [key: string]: any;
}

export interface AdminEvent {
  type: string;
  payload?: any;
}

class RealtimeService {
  private io?: SocketIOServer;

  attachIO(io: SocketIOServer) {
    this.io = io;
  }

  getIO(): SocketIOServer | undefined {
    return this.io;
  }

  notifyWalletUpdate(telegramId: string | bigint | number, data: WalletUpdateEvent) {
    if (!this.io) return;
    const tgStr = String(telegramId);

    // 1. Send live update to player's private user room
    this.io.to(`user_${tgStr}`).emit("wallet_update", data);

    // 2. Broadcast to admin monitor so Players & Staff view reflects wallet changes live
    this.io.to("admin_monitor").emit("admin_event", {
      type: "user_wallet_updated",
      telegramId: tgStr,
      balance: data.balance,
      reason: data.reason,
    });
  }

  notifyAdminEvent(event: AdminEvent) {
    if (!this.io) return;
    this.io.to("admin_monitor").emit("admin_event", event);
  }
}

export const realtimeService = new RealtimeService();
