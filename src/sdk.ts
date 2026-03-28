import WebSocket from "ws";
import { EventEmitter } from "events";

/**
 * Conductor SDK — AI Agent Integration
 *
 * Herhangi bir AI agent 3 satırda Conductor'a bağlanır:
 *
 *   const conductor = new ConductorClient();
 *   conductor.on("alert", (alert) => {
 *     // Kendi AI mantığın burada
 *   });
 *
 * Filtreleme:
 *   conductor.on("critical", (alert) => { ... });
 *   conductor.on("swap", (alert) => { ... });
 */

export interface ConductorAlert {
  txHash: string;
  blockNumber: string;
  commitState: "proposed" | "voted" | "finalized";
  alertConfidence: string;
  severity: "low" | "medium" | "high" | "critical";
  type: string;
  valueUsd: number;
  estimatedPriceImpact: number;
  affectedPool: string;
  suggestedActions: string[];
  aiReasoning: string;
  confidence: number;
  senderBalance: string;
  capturedAt: number;
  analyzedAt: number;
  latencyMs: number;
}

export interface ConductorConfig {
  url?: string;           // default: ws://localhost:3001
  autoReconnect?: boolean; // default: true
  minSeverity?: "low" | "medium" | "high" | "critical"; // default: "low"
  types?: string[];       // filter by tx type: ["swap", "large_transfer", "contract_call"]
}

const SEVERITY_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };

export class ConductorClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<ConductorConfig>;
  private alertCount = 0;
  private connected = false;

  constructor(config: ConductorConfig = {}) {
    super();
    this.config = {
      url: config.url || "ws://localhost:3001",
      autoReconnect: config.autoReconnect !== false,
      minSeverity: config.minSeverity || "low",
      types: config.types || [],
    };
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.config.url);

    this.ws.on("open", () => {
      this.connected = true;
      this.emit("connected");
    });

    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());

      if (msg.type === "history") {
        msg.alerts.forEach((a: ConductorAlert) => this.processAlert(a));
        return;
      }

      if (msg.type === "alert") {
        this.processAlert(msg.alert);
      }
    });

    this.ws.on("close", () => {
      this.connected = false;
      this.emit("disconnected");
      if (this.config.autoReconnect) {
        setTimeout(() => this.connect(), 3000);
      }
    });

    this.ws.on("error", () => {});
  }

  private processAlert(alert: ConductorAlert) {
    // Severity filtresi
    if (SEVERITY_ORDER[alert.severity] < SEVERITY_ORDER[this.config.minSeverity]) return;

    // Type filtresi
    if (this.config.types.length > 0 && !this.config.types.includes(alert.type)) return;

    this.alertCount++;

    // Genel alert event
    this.emit("alert", alert);

    // Severity bazlı event
    this.emit(alert.severity, alert);

    // Type bazlı event
    this.emit(alert.type, alert);

    // High risk shortcut
    if (alert.severity === "critical" || alert.severity === "high") {
      this.emit("high_risk", alert);
    }
  }

  get stats() {
    return {
      connected: this.connected,
      alertsReceived: this.alertCount,
      url: this.config.url,
    };
  }

  disconnect() {
    this.config.autoReconnect = false;
    this.ws?.close();
  }
}

export default ConductorClient;
