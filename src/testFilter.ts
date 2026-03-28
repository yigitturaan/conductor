import { BlockWatcher } from "./watcher";
import { filterTransactions } from "./filter";

async function test() {
  const watcher = new BlockWatcher();
  let blockCount = 0;

  console.log("TX Filter testi başlıyor...");
  console.log("5 blok taranacak.\n");

  watcher.on("newBlock", async (block) => {
    blockCount++;
    const filtered = await filterTransactions(block);

    console.log(`Blok #${block.number}: ${block.transactions.length} tx → ${filtered.length} filtrelendi`);
    for (const tx of filtered) {
      console.log(`  → [${tx.type}] ${tx.hash.slice(0, 16)}... from ${tx.from.slice(0, 10)}...`);
    }

    if (blockCount >= 5) {
      console.log("\n✅ ADIM 2 BAŞARILI — TX Filter çalışıyor!");
      process.exit(0);
    }
  });

  await watcher.start();

  setTimeout(() => {
    console.log("⚠️ Timeout");
    process.exit(1);
  }, 30000);
}

test().catch(console.error);
