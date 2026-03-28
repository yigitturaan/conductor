import dotenv from "dotenv";
dotenv.config();

import { BlockWatcher } from "./watcher";
import { filterTransactions } from "./filter";
import { simulateBatch } from "./simulator";
import { analyzeWithAI, getAnalyzerStats } from "./analyzer";
import { AlertServer } from "./alertServer";

const alertServer = new AlertServer();
const watcher = new BlockWatcher();

let totalBlocks = 0;
let totalTxFiltered = 0;
let totalAlerts = 0;

console.log(`
╔══════════════════════════════════════════╗
║       CONDUCTOR — AI Orchestrator        ║
║     Monad Speculative Execution Engine   ║
╚══════════════════════════════════════════╝
`);

watcher.on("newBlock", async (block) => {
  totalBlocks++;

  const filtered = await filterTransactions(block);
  if (filtered.length === 0) return;

  totalTxFiltered += filtered.length;

  const simResults = await simulateBatch(filtered);
  if (simResults.length === 0) return;

  // AI analizini paralel çalıştır
  const analyzePromises = simResults.slice(0, 5).map((sim) => analyzeWithAI(sim));
  const alerts = await Promise.all(analyzePromises);

  for (const alert of alerts) {
    totalAlerts++;
    alertServer.broadcast(alert);

    const icon =
      alert.severity === "critical" ? "🔴" :
      alert.severity === "high" ? "🟠" :
      alert.severity === "medium" ? "🟡" : "🟢";

    console.log(
      `${icon} [Blok #${alert.blockNumber}] ${alert.type} | $${alert.valueUsd.toFixed(2)} | ${alert.severity} | ${alert.latencyMs}ms`
    );
  }
});

// Stats her 30 saniyede bir
setInterval(() => {
  const stats = alertServer.getStats();
  const analyzer = getAnalyzerStats();
  console.log(
    `\n📊 Stats: ${totalBlocks} blok | ${totalTxFiltered} tx | ${totalAlerts} alert | ${stats.connectedClients} client`
  );
  console.log(
    `   AI calls: ${analyzer.aiCalls} | Rule-based: ${analyzer.ruleCalls} | AI savings: ${analyzer.ruleCalls > 0 ? Math.round((analyzer.ruleCalls / (analyzer.aiCalls + analyzer.ruleCalls)) * 100) : 0}%\n`
  );
}, 30000);

async function main() {
  console.log("Pipeline başlatılıyor...\n");
  await watcher.start();
  console.log("Conductor aktif — bloklar dinleniyor...\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
