import { WebSocketServer, WebSocket } from "ws";
import type { AnalyzedAlert } from "./analyzer";

const PORT = Number(process.env.PORT) || Number(process.env.ALERT_PORT) || 3001;

export class AlertServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private alertHistory: AnalyzedAlert[] = [];

  constructor(port: number = PORT) {
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      console.log(`[AlertServer] Yeni client bağlandı (toplam: ${this.clients.size})`);

      // Bağlanan client'a son 10 alert'i gönder
      const recent = this.alertHistory.slice(-10);
      if (recent.length > 0) {
        ws.send(JSON.stringify({ type: "history", alerts: recent }));
      }

      ws.on("close", () => {
        this.clients.delete(ws);
        console.log(`[AlertServer] Client ayrıldı (toplam: ${this.clients.size})`);
      });

      ws.on("error", () => {
        this.clients.delete(ws);
      });
    });

    console.log(`[AlertServer] WebSocket sunucusu port ${port}'da başlatıldı ✅`);
  }

  broadcast(alert: AnalyzedAlert) {
    const message = JSON.stringify({ type: "alert", alert });
    this.alertHistory.push(alert);

    // Son 100 alert'i tut
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-100);
    }

    let sent = 0;
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sent++;
      }
    }

    if (sent > 0) {
      console.log(`[AlertServer] Alert yayınlandı → ${sent} client'a`);
    }
  }

  getStats() {
    return {
      connectedClients: this.clients.size,
      totalAlerts: this.alertHistory.length,
    };
  }

  close() {
    this.wss.close();
  }
}
