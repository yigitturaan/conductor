import { createPublicClient, webSocket, type Block, type Chain } from "viem";
import { EventEmitter } from "events";
import dotenv from "dotenv";

dotenv.config();

// Monad Testnet chain tanımı
export const monadTestnet: Chain = {
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.monad.xyz"],
      webSocket: [process.env.MONAD_WS_URL || "wss://testnet-rpc.monad.xyz"],
    },
  },
};

export interface ProposedBlock {
  number: bigint;
  hash: string;
  timestamp: bigint;
  transactions: string[];
  capturedAt: number; // Date.now() ms cinsinden
}

export class BlockWatcher extends EventEmitter {
  private client;

  constructor() {
    super();
    this.client = createPublicClient({
      chain: monadTestnet,
      transport: webSocket(process.env.MONAD_WS_URL || "wss://testnet-rpc.monad.xyz"),
    });
  }

  async start() {
    console.log("[Watcher] Monad testnet'e bağlanılıyor...");
    console.log(`[Watcher] RPC: ${process.env.MONAD_WS_URL || "wss://testnet-rpc.monad.xyz"}`);

    try {
      // monadNewHeads veya fallback olarak newHeads dinle
      const unwatch = this.client.watchBlocks({
        onBlock: async (block) => {
          const proposedBlock: ProposedBlock = {
            number: block.number,
            hash: block.hash,
            timestamp: block.timestamp,
            transactions: (block.transactions as string[]) || [],
            capturedAt: Date.now(),
          };

          console.log(
            `[Watcher] Blok #${block.number} yakalandı | ${proposedBlock.transactions.length} tx | t=${Date.now()}ms`
          );

          this.emit("newBlock", proposedBlock);
        },
        onError: (error) => {
          console.error("[Watcher] WebSocket hatası:", error.message);
        },
      });

      console.log("[Watcher] Block watcher başlatıldı ✅");
      return unwatch;
    } catch (error: any) {
      console.error("[Watcher] Başlatma hatası:", error.message);
      throw error;
    }
  }

  getClient() {
    return this.client;
  }
}
