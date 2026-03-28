import { BlockWatcher } from "./watcher";
import { filterTransactions } from "./filter";
import { simulateBatch } from "./simulator";

async function test() {
  const watcher = new BlockWatcher();
  let blockCount = 0;

  console.log("Simülatör testi başlıyor...\n");

  watcher.on("newBlock", async (block) => {
    blockCount++;
    const filtered = await filterTransactions(block);
    const simResults = await simulateBatch(filtered);

    console.log(`Blok #${block.number}: ${filtered.length} tx filtrelendi → ${simResults.length} simüle edildi`);
    for (const sim of simResults) {
      console.log(
        `  → [${sim.severity.toUpperCase()}] $${sim.valueUsd.toFixed(2)} | impact: ${sim.estimatedPriceImpact}% | ${sim.txType}`
      );
    }

    if (blockCount >= 3) {
      console.log("\n✅ ADIM 3 BAŞARILI — Simülatör çalışıyor!");
      process.exit(0);
    }
  });

  await watcher.start();
  setTimeout(() => { process.exit(1); }, 30000);
}

test().catch(console.error);
