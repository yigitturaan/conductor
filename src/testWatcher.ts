import { BlockWatcher } from "./watcher";

async function test() {
  const watcher = new BlockWatcher();

  watcher.on("newBlock", (block) => {
    console.log(`  → Blok #${block.number}, ${block.transactions.length} tx, yakalanma: ${block.capturedAt}`);
  });

  console.log("Block Watcher testi başlıyor...");
  console.log("3 blok beklenecek, sonra çıkılacak.\n");

  await watcher.start();

  // 3 blok gelince çık
  let count = 0;
  watcher.on("newBlock", () => {
    count++;
    if (count >= 3) {
      console.log("\n✅ ADIM 1 BAŞARILI — 3 blok yakalandı!");
      process.exit(0);
    }
  });

  // 30 saniye timeout
  setTimeout(() => {
    console.log("⚠️ 30 saniye içinde blok gelmedi — WebSocket bağlantısını kontrol et");
    process.exit(1);
  }, 30000);
}

test().catch(console.error);
