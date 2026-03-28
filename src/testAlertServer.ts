import { AlertServer } from "./alertServer";
import WebSocket from "ws";
import type { AnalyzedAlert } from "./analyzer";

async function test() {
  console.log("Alert Server testi başlıyor...\n");

  // 1. Server başlat
  const server = new AlertServer(3099); // test portu

  // 2. Client bağlan
  await new Promise<void>((resolve) => {
    const client = new WebSocket("ws://localhost:3099");
    let messageCount = 0;

    client.on("open", () => {
      console.log("[Test Client] Bağlandı ✅");

      // 3. Test alert gönder
      const testAlert: AnalyzedAlert = {
        txHash: "0xtest123456789",
        blockNumber: "12345",
        commitState: "proposed",
        alertConfidence: "60%",
        severity: "high",
        type: "swap",
        valueUsd: 50000,
        estimatedPriceImpact: 3.5,
        affectedPool: "DEX Pool (Testnet)",
        suggestedActions: ["hedge", "monitor"],
        aiReasoning: "Test analizi - yüksek hacimli swap tespit edildi",
        confidence: 0.85,
        capturedAt: Date.now(),
        analyzedAt: Date.now(),
        latencyMs: 120,
      };

      server.broadcast(testAlert);
    });

    client.on("message", (data) => {
      messageCount++;
      const parsed = JSON.parse(data.toString());
      console.log(`[Test Client] Mesaj #${messageCount} alındı: type=${parsed.type}`);

      if (parsed.type === "alert") {
        console.log(`  Severity: ${parsed.alert.severity}`);
        console.log(`  Value: $${parsed.alert.valueUsd}`);
        console.log(`  CommitState: ${parsed.alert.commitState}`);
        console.log(`  AI Reasoning: ${parsed.alert.aiReasoning}`);
      }

      // Stats kontrol
      const stats = server.getStats();
      console.log(`\n[Server Stats] Clients: ${stats.connectedClients} | Alerts: ${stats.totalAlerts}`);

      console.log("\n✅ ADIM 5 BAŞARILI — Alert Server çalışıyor!");
      client.close();
      server.close();
      resolve();
    });
  });

  process.exit(0);
}

test().catch(console.error);
