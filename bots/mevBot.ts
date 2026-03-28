import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config();

const ALERT_SERVER_URL = process.env.ALERT_WS_URL || "ws://localhost:3001";

let alertCount = 0;
let mevOpportunities = 0;
let totalPotentialProfit = 0;

function connect() {
  const ws = new WebSocket(ALERT_SERVER_URL);

  ws.on("open", () => {
    console.log(`
╔══════════════════════════════════════════╗
║       MEV SHIELD BOT — Koruma            ║
║   Sandwich & frontrun detection          ║
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

    // Swap'leri MEV açısından analiz et
    if (alert.type === "swap") {
      const isMevRisk = alert.estimatedPriceImpact > 0.1 || alert.valueUsd > 10;

      if (isMevRisk) {
        mevOpportunities++;
        const potentialProfit = alert.valueUsd * (alert.estimatedPriceImpact / 100) * 0.5;
        totalPotentialProfit += potentialProfit;

        console.log(`🛡️  MEV Risk #${mevOpportunities} | Blok #${alert.blockNumber}`);
        console.log(`   Swap: $${alert.valueUsd.toFixed(2)} | Impact: ${alert.estimatedPriceImpact}%`);
        console.log(`   Pool: ${alert.affectedPool}`);
        console.log(`   Potansiyel MEV karı: $${potentialProfit.toFixed(4)}`);
        console.log(`   AI: ${alert.aiReasoning}`);
        console.log(`   CommitState: ${alert.commitState} — Proposed aşamada yakalandı!`);

        if (alert.estimatedPriceImpact > 2) {
          console.log(`   🚨 YÜKSEK MEV RİSKİ — Sandwich attack olasılığı!`);
          console.log(`   🛡️  Koruma: Private mempool yönlendirmesi öneriliyor`);
        } else {
          console.log(`   👀 İzleme modunda — düşük risk`);
        }
        console.log();
      }
    }
  });

  ws.on("close", () => {
    console.log("[MEVBot] Bağlantı koptu, yeniden deneniyor...");
    setTimeout(connect, 3000);
  });

  ws.on("error", () => {});
}

console.log("[MEVBot] Başlatılıyor...");
connect();

setInterval(() => {
  console.log(`📊 MEVBot Stats: ${alertCount} alert | ${mevOpportunities} MEV risk | Toplam potansiyel: $${totalPotentialProfit.toFixed(4)}\n`);
}, 30000);
