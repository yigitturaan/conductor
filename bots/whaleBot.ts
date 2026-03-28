import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config();

const ALERT_SERVER_URL = process.env.ALERT_WS_URL || "ws://localhost:3001";

let alertCount = 0;
let whaleAlerts = 0;
const trackedWhales: Map<string, number> = new Map();

function connect() {
  const ws = new WebSocket(ALERT_SERVER_URL);

  ws.on("open", () => {
    console.log(`
╔══════════════════════════════════════════╗
║       WHALE BOT — Balina Takibi          ║
║   Large transfer & whale monitoring      ║
╚══════════════════════════════════════════╝
`);
  });

  ws.on("message", (data) => {
    const parsed = JSON.parse(data.toString());

    if (parsed.type === "history") {
      console.log(`📜 Geçmiş: ${parsed.alerts.length} alert yüklendi\n`);
      return;
    }

    if (parsed.type !== "alert") return;
    const alert = parsed.alert;
    alertCount++;

    // Sadece large_transfer'leri takip et
    if (alert.type === "large_transfer" && alert.valueUsd > 5) {
      whaleAlerts++;

      // Adres bazlı takip
      const txShort = alert.txHash.slice(0, 16);
      const count = (trackedWhales.get(txShort) || 0) + 1;
      trackedWhales.set(txShort, count);

      console.log(`🐋 Whale Alert #${whaleAlerts} | Blok #${alert.blockNumber}`);
      console.log(`   Değer: $${alert.valueUsd.toFixed(2)} | Pool: ${alert.affectedPool}`);
      console.log(`   TX: ${alert.txHash.slice(0, 24)}...`);
      console.log(`   AI: ${alert.aiReasoning}`);
      console.log(`   CommitState: ${alert.commitState} (${alert.alertConfidence})`);

      if (alert.valueUsd > 100) {
        console.log(`   ⚠️  BÜYÜK BALİNA — Pozisyon koruma aktif!`);
      }
      console.log();
    }
  });

  ws.on("close", () => {
    console.log("[WhaleBot] Bağlantı koptu, yeniden deneniyor...");
    setTimeout(connect, 3000);
  });

  ws.on("error", () => {});
}

console.log("[WhaleBot] Başlatılıyor...");
connect();

setInterval(() => {
  console.log(`📊 WhaleBot Stats: ${alertCount} toplam alert | ${whaleAlerts} whale | ${trackedWhales.size} benzersiz tx\n`);
}, 30000);
