import WebSocket from "ws";
import { createPublicClient, createWalletClient, http, defineChain, parseEther, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const ALERT_SERVER_URL = process.env.ALERT_WS_URL || "wss://conductor-production-b213.up.railway.app";

// ── Monad Testnet ──
const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
});

// ── Vault kontratı ──
const VAULT_ADDRESS = process.env.VAULT_ADDRESS as `0x${string}`;
const vaultJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "contracts", "ConductorVault.json"), "utf-8"));
const VAULT_ABI = vaultJson.abi;

// ── Wallet ──
const privateKey = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const account = privateKeyToAccount(privateKey);

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz"),
});

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz"),
});

interface Alert {
  txHash: string;
  blockNumber: string;
  commitState: string;
  alertConfidence: string;
  severity: string;
  type: string;
  valueUsd: number;
  estimatedPriceImpact: number;
  affectedPool: string;
  suggestedActions: string[];
  aiReasoning: string;
  confidence: number;
  capturedAt: number;
  analyzedAt: number;
  latencyMs: number;
}

let alertCount = 0;
let actionCount = 0;
let totalCollateralAdded = 0;
let isSending = false; // tx çakışmasını önle
let lastActionTime = 0;
const ACTION_COOLDOWN = 30_000; // 30 saniye cooldown — gereksiz tx spam'i önler
let skippedByCooldown = 0;

// ── Gerçek on-chain aksiyon ──
async function addEmergencyCollateral(alert: Alert) {
  if (isSending) {
    console.log(`  ⏳ Önceki tx bekleniyor, bu aksiyon atlandı`);
    return;
  }

  isSending = true;

  try {
    // Severity'ye göre teminat miktarı belirle
    const collateralMon = alert.severity === "critical" ? "0.02" : alert.severity === "high" ? "0.01" : "0.005";
    const collateralWei = parseEther(collateralMon);

    // txHash'i bytes32'ye çevir
    const txHashBytes = alert.txHash.slice(0, 66).padEnd(66, "0") as `0x${string}`;

    console.log(`  ⚡ ON-CHAIN TX GÖNDERİLİYOR...`);
    console.log(`  ⚡ ConductorVault.addEmergencyCollateral()`);
    console.log(`  ⚡ Miktar: ${collateralMon} MON | Vault: ${VAULT_ADDRESS}`);

    const hash = await walletClient.writeContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "addEmergencyCollateral",
      args: [account.address, txHashBytes, alert.severity],
      value: collateralWei,
    } as any);

    console.log(`  ✅ TX GÖNDERILDI: ${hash}`);

    // Receipt bekle
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    actionCount++;
    totalCollateralAdded += Number(collateralMon);

    console.log(`  ✅ ONAYLANDI | Block: ${receipt.blockNumber} | Gas: ${receipt.gasUsed}`);
    console.log(`  ✅ Explorer: https://testnet.monadexplorer.com/tx/${hash}`);
    console.log();
  } catch (err: any) {
    console.error(`  ❌ TX HATASI: ${err.message?.slice(0, 100)}`);
  } finally {
    isSending = false;
  }
}

// ── WebSocket bağlantısı ──
function connect() {
  const ws = new WebSocket(ALERT_SERVER_URL);

  ws.on("open", () => {
    console.log(`
╔══════════════════════════════════════════════╗
║     RISK BOT — AI Agent (On-Chain Actions)   ║
║     Vault: ${VAULT_ADDRESS}  ║
╚══════════════════════════════════════════════╝
`);
    console.log(`Wallet: ${account.address}`);
    console.log(`Server: ${ALERT_SERVER_URL}\n`);
  });

  ws.on("message", async (data) => {
    const parsed = JSON.parse(data.toString());

    if (parsed.type === "history") {
      console.log(`📜 Geçmiş: ${parsed.alerts.length} alert alındı\n`);
      return;
    }

    if (parsed.type !== "alert") return;

    const alert: Alert = parsed.alert;
    alertCount++;

    const icon =
      alert.severity === "critical" ? "🔴" :
      alert.severity === "high" ? "🟠" :
      alert.severity === "medium" ? "🟡" : "🟢";

    console.log(`${icon} Alert #${alertCount} | Blok #${alert.blockNumber}`);
    console.log(`  ${alert.type} | $${alert.valueUsd.toFixed(2)} | Impact: ${alert.estimatedPriceImpact}% | ${alert.severity}`);
    console.log(`  AI: ${alert.aiReasoning}`);
    console.log(`  CommitState: ${alert.commitState} (${alert.alertConfidence})`);

    // ── Karar ver ──
    // Akıllı cooldown: her alert'e tx atmak yerine 30sn'de max 1 aksiyon
    // Gerçek dünyada bot gas israf etmez, sadece gerçekten gerektiğinde hareket eder
    const timeSinceLastAction = Date.now() - lastActionTime;
    const cooldownReady = timeSinceLastAction >= ACTION_COOLDOWN;

    if (alert.severity === "critical" || alert.severity === "high") {
      if (cooldownReady) {
        console.log(`  🚨 CRITICAL/HIGH → Acil on-chain aksiyon...`);
        await addEmergencyCollateral(alert);
        lastActionTime = Date.now();
      } else {
        skippedByCooldown++;
        const remaining = Math.ceil((ACTION_COOLDOWN - timeSinceLastAction) / 1000);
        console.log(`  🚨 CRITICAL/HIGH → Cooldown aktif (${remaining}sn kaldı) — aksiyon atlandı`);
        console.log();
      }
    } else if (alert.severity === "medium") {
      if (cooldownReady) {
        console.log(`  ⚡ MEDIUM → Koruyucu teminat ekleniyor...`);
        await addEmergencyCollateral(alert);
        lastActionTime = Date.now();
      } else {
        skippedByCooldown++;
        const remaining = Math.ceil((ACTION_COOLDOWN - timeSinceLastAction) / 1000);
        console.log(`  ⏳ MEDIUM → Cooldown aktif (${remaining}sn kaldı) — izleniyor`);
        console.log();
      }
    } else {
      console.log(`  ✓ LOW → Güvenli`);
      console.log();
    }
  });

  ws.on("close", () => {
    console.log("[RiskBot] Bağlantı koptu, 3sn sonra tekrar...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.error("[RiskBot] Hata:", err.message);
  });
}

// ── Başlat ──
async function main() {
  console.log("[RiskBot] Başlatılıyor...");

  // Bakiye kontrol
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`[RiskBot] Wallet bakiye: ${(Number(balance) / 1e18).toFixed(4)} MON`);

  if (!VAULT_ADDRESS) {
    console.error("VAULT_ADDRESS .env'de bulunamadı! Önce deploy edin.");
    process.exit(1);
  }

  // Vault stats
  try {
    const stats = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: "getStats",
    } as any) as any;
    console.log(`[RiskBot] Vault stats: ${stats[0]} aksiyon | ${(Number(stats[1]) / 1e18).toFixed(4)} MON bakiye\n`);
  } catch (e) {
    console.log(`[RiskBot] Vault bağlantısı OK\n`);
  }

  connect();
}

main().catch(console.error);

// Stats
setInterval(() => {
  console.log(`\n📊 RiskBot: ${alertCount} alert | ${actionCount} on-chain aksiyon | ${skippedByCooldown} cooldown skip | ${totalCollateralAdded.toFixed(3)} MON eklendi\n`);
}, 30000);
