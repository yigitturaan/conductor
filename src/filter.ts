import { createPublicClient, http, type Hash } from "viem";
import { monadTestnet } from "./watcher";
import type { ProposedBlock } from "./watcher";

// Bilinen swap method selector'ları (ilk 4 byte)
const SWAP_SELECTORS = [
  "0x38ed1739", // swapExactTokensForTokens
  "0x8803dbee", // swapTokensForExactTokens
  "0x7ff36ab5", // swapExactETHForTokens
  "0x18cbafe5", // swapExactTokensForETH
  "0x5c11d795", // swapExactTokensForTokensSupportingFeeOnTransferTokens
  "0xb6f9de95", // swapExactETHForTokensSupportingFeeOnTransferTokens
  "0x791ac947", // swapExactTokensForETHSupportingFeeOnTransferTokens
  "0x414bf389", // exactInputSingle (Uniswap V3)
  "0xc04b8d59", // exactInput (Uniswap V3)
  "0xdb3e2198", // exactOutputSingle (Uniswap V3)
  "0xf28c0498", // exactOutput (Uniswap V3)
  "0x3593564c", // execute (Universal Router)
  "0x09b81346", // execute (Universal Router v2)
];

// Uniswap V3 Swap event signature
const UNISWAP_V3_SWAP_TOPIC = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";

export interface FilteredTx {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  blockNumber: bigint;
  type: "swap" | "large_transfer" | "contract_call";
  methodId: string; // ilk 4 byte selector
  capturedAt: number;
}

const httpClient = createPublicClient({
  chain: monadTestnet,
  transport: http("https://testnet-rpc.monad.xyz"),
});

function detectTxType(input: string, valueInMon: number): { type: FilteredTx["type"]; methodId: string } {
  const methodId = input.slice(0, 10); // 0x + 8 hex char

  // Bilinen swap selector mı?
  if (SWAP_SELECTORS.includes(methodId.toLowerCase())) {
    return { type: "swap", methodId };
  }

  // Kontrat çağrısı var ama swap değil
  if (input.length > 10) {
    return { type: "contract_call", methodId };
  }

  // Büyük MON transferi
  if (valueInMon > 1) {
    return { type: "large_transfer", methodId: "0x" };
  }

  return { type: "large_transfer", methodId: "0x" };
}

export async function filterTransactions(block: ProposedBlock): Promise<FilteredTx[]> {
  const filtered: FilteredTx[] = [];

  if (block.transactions.length === 0) return filtered;

  const txPromises = block.transactions.slice(0, 20).map(async (txHash) => {
    try {
      const tx = await httpClient.getTransaction({ hash: txHash as Hash });
      if (!tx) return null;

      const valueInMon = Number(tx.value) / 1e18;
      const hasInput = tx.input && tx.input.length > 10;

      // Filtre: ya büyük transfer ya da kontrat çağrısı
      if (valueInMon <= 0.1 && !hasInput) return null;

      const { type, methodId } = hasInput
        ? detectTxType(tx.input, valueInMon)
        : { type: "large_transfer" as const, methodId: "0x" };

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to || "0x",
        value: tx.value,
        blockNumber: block.number,
        type,
        methodId,
        capturedAt: Date.now(),
      };
    } catch (e) {
      return null;
    }
  });

  const results = await Promise.all(txPromises);
  for (const r of results) {
    if (r) filtered.push(r);
  }

  return filtered;
}

// Transaction receipt'ten swap event kontrolü
export async function checkForSwapEvents(txHash: string): Promise<boolean> {
  try {
    const receipt = await httpClient.getTransactionReceipt({ hash: txHash as Hash });
    if (!receipt) return false;

    return receipt.logs.some(
      (log: any) => log.topics?.[0]?.toLowerCase() === UNISWAP_V3_SWAP_TOPIC.toLowerCase()
    );
  } catch {
    return false;
  }
}
