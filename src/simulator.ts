import { createPublicClient, http, type Hash } from "viem";
import { monadTestnet } from "./watcher";
import type { FilteredTx } from "./filter";

const client = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz"),
});

export interface SimulationResult {
  txHash: string;
  txType: string;
  from: string;
  to: string;
  valueUsd: number;
  estimatedPriceImpact: number; // yüzde
  affectedPool: string;
  severity: "low" | "medium" | "high" | "critical";
  simulatedAt: number;
  blockNumber: bigint;
  senderBalance: string; // spekülatif state'ten okunan bakiye
}

// MON fiyatı — testnet için sabit
// Gerçek üretimde oracle veya price feed kullanılır
const MON_PRICE_USD = 0.50;

// Testnet pool likiditesi — testnet'te pool'lar küçük
// Bu sayede gerçek testnet tx'lerinde bile anlamlı price impact oluşur
// Mainnet'te gerçek pool liquidity çekilir (getReserves)
const TESTNET_POOL_LIQUIDITY_USD = 1_000;

// Bilinen Monad testnet kontratları
const KNOWN_CONTRACTS: Record<string, string> = {
  "0x760afe86e5de5fa0ee542fc7b7b713e1c5425701": "Uniswap V3 Router",
  "0x88b96aad9214ea3a30ed2e5b39249deb7eb5e5f2": "Uniswap V3 Factory",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": "Universal Router",
  "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6": "WMON",
};

function identifyPool(to: string, txType: string): string {
  const addr = to.toLowerCase();

  // Bilinen kontrat mı?
  for (const [known, name] of Object.entries(KNOWN_CONTRACTS)) {
    if (addr === known) return name;
  }

  // Tx tipine göre etiketle
  if (txType === "swap") {
    return `Contract:${to.slice(0, 8)}...${to.slice(-4)}`;
  }

  return "Direct Transfer";
}

export async function simulateTransaction(tx: FilteredTx): Promise<SimulationResult> {
  const valueInMon = Number(tx.value) / 1e18;
  const valueUsd = valueInMon * MON_PRICE_USD;

  // Fiyat etkisi tahmini — basit constant-product AMM formülü
  // impact = txValue / poolLiquidity * 100
  const estimatedPriceImpact = (valueUsd / TESTNET_POOL_LIQUIDITY_USD) * 100;

  // eth_call ile spekülatif state kontrol — Monad'da latest = Proposed blok
  let senderBalance = "0";
  try {
    const bal = await client.getBalance({
      address: tx.from as `0x${string}`,
      blockTag: "latest",
    });
    senderBalance = (Number(bal) / 1e18).toFixed(4);
  } catch (e) {
    // RPC hatası — devam et
  }

  // Severity — testnet değerleri için ayarlanmış eşikler
  // $1K pool'da: >$50 critical, >$20 high, >$5 medium
  let severity: SimulationResult["severity"] = "low";
  if (estimatedPriceImpact > 5) severity = "critical";
  else if (estimatedPriceImpact > 2) severity = "high";
  else if (estimatedPriceImpact > 0.5) severity = "medium";

  return {
    txHash: tx.hash,
    txType: tx.type,
    from: tx.from,
    to: tx.to,
    valueUsd: Math.round(valueUsd * 100) / 100,
    estimatedPriceImpact: Math.round(estimatedPriceImpact * 100) / 100,
    affectedPool: identifyPool(tx.to, tx.type),
    severity,
    simulatedAt: Date.now(),
    blockNumber: tx.blockNumber,
    senderBalance,
  };
}

export async function simulateBatch(txs: FilteredTx[]): Promise<SimulationResult[]> {
  return Promise.all(txs.map(simulateTransaction));
}
