import { BlockWatcher } from "./watcher";
import { filterTransactions } from "./filter";
import { simulateBatch } from "./simulator";
import { analyzeWithAI } from "./analyzer";

async function test() {
  const watcher = new BlockWatcher();
  let analyzed = false;

  console.log("AI Analyzer testi başlıyor...\n");

  watcher.on("newBlock", async (block) => {
    if (analyzed) return;

    const filtered = await filterTransactions(block);
    if (filtered.length === 0) {
      console.log(`Blok #${block.number}: tx yok, sonraki blok bekleniyor...`);
      return;
    }

    const simResults = await simulateBatch(filtered);
    if (simResults.length === 0) {
      console.log(`Blok #${block.number}: simülasyon sonucu yok`);
      return;
    }

    analyzed = true;
    console.log(`Blok #${block.number}: ${simResults.length} tx simüle edildi, ilk 2 tanesi AI'ya gönderiliyor...\n`);

    const toAnalyze = simResults.slice(0, 2);

    for (const sim of toAnalyze) {
      console.log(`--- TX: ${sim.txHash.slice(0, 16)}... ---`);
      console.log(`  Tip: ${sim.txType} | Değer: $${sim.valueUsd.toFixed(2)} | Severity: ${sim.severity}`);

      const alert = await analyzeWithAI(sim);

      console.log(`  AI Severity: ${alert.severity}`);
      console.log(`  AI Reasoning: ${alert.aiReasoning}`);
      console.log(`  Suggested Actions: ${alert.suggestedActions.join(", ")}`);
      console.log(`  Confidence: ${alert.confidence}`);
      console.log(`  Latency: ${alert.latencyMs}ms`);
      console.log(`  CommitState: ${alert.commitState} | AlertConfidence: ${alert.alertConfidence}`);
      console.log();
    }

    console.log("✅ ADIM 4 BAŞARILI — AI Analyzer çalışıyor!");
    process.exit(0);
  });

  await watcher.start();
  setTimeout(() => {
    console.log("⚠️ Timeout — 45 saniye içinde analiz yapılamadı");
    process.exit(1);
  }, 45000);
}

test().catch(console.error);
