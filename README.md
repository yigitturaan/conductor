# Conductor — AI-Native Speculative Execution Orchestrator

> The first project on Monad to leverage speculative execution for real-time, AI-powered DeFi protection

**Live Dashboard:** [dashboard-eta-ten-77.vercel.app](https://dashboard-eta-ten-77.vercel.app)
**Live Pipeline:** `wss://conductor-production-b213.up.railway.app`

---

## The Problem

On most blockchains, you only know about a transaction **after** it's finalized. By then, it's too late to react — a massive swap already moved the price, a whale already dumped, a liquidation already happened.

**No human can react in 2 seconds. But AI agents can.**

## The Solution

Conductor captures Monad blocks at the **Proposed** stage — approximately **1 second before finalization**. This is possible because Monad's pipelined consensus has distinct stages:

```
Proposed (block created) → Voted → Finalized → Verified
   ↑                                    ↑
   We capture HERE              Everyone else sees HERE
   (~1 second early)
```

Conductor analyzes every transaction in real-time with AI, calculates risk scores, and broadcasts structured alerts to any connected agent — all before the block is finalized.

## What Can You Build With Conductor?

Conductor is an **infrastructure layer**. You connect your AI agent (or bot) and decide what to do with the intelligence:

| Use Case | What Your Agent Does | Trigger |
|----------|---------------------|---------|
| **Liquidation Protection** | Automatically add collateral before you get liquidated | `high` / `critical` severity |
| **MEV Shield** | Detect sandwich attacks on your pending swaps | `swap` type + high price impact |
| **Whale Tracker** | Get notified when large transfers happen | `large_transfer` type |
| **Portfolio Rebalancer** | Hedge positions when market moves detected | Any `medium+` alert |
| **Risk Dashboard** | Monitor DeFi activity in real-time | All alerts |
| **Arbitrage Scanner** | Spot price dislocations across pools | `swap` type alerts |

---

## Architecture

```
Monad Testnet (WebSocket)
       │
       ▼
  ┌─────────────┐
  │ Block Watcher│  ← monadNewHeads subscription (Proposed stage)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  TX Filter   │  ← Detects swaps (13 DEX selectors), large transfers
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  Simulator   │  ← eth_call on speculative state, AMM price impact calc
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ AI Analyzer  │  ← Dual-layer: rule-based (~5ms) + GPT-4o-mini (~1s)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ Alert Server │  ← WebSocket broadcast to all connected agents
  └──────┬──────┘
     ┌───┼───┐
     ▼   ▼   ▼
  Bots  SDK  Dashboard
```

### How It Works Step by Step

1. **Block Watcher** subscribes to `monadNewHeads` on Monad testnet. This fires when a block is **proposed** — not yet voted or finalized.

2. **TX Filter** scans every transaction in the block. It identifies swaps (by matching 13 known DEX method selectors like Uniswap V3's `exactInputSingle`), large transfers (>1 MON), and contract interactions.

3. **Simulator** reads the **speculative state** using `eth_call` with the `latest` tag. On Monad (since v0.13.0), `latest` returns the Proposed block state. It calculates AMM price impact, reads sender balances, and identifies affected pools.

4. **AI Analyzer** uses a dual-layer approach:
   - **Layer 1 (Rule-based, ~5ms, free):** Low-severity transactions are analyzed instantly with rules. No AI cost.
   - **Layer 2 (GPT-4o-mini, ~1-2s):** Medium/high/critical severity transactions get full AI analysis with reasoning and suggested actions.
   - This saves ~70% on AI API costs while keeping response times fast.

5. **Alert Server** broadcasts the analyzed alert via WebSocket to every connected client — bots, dashboards, or your custom AI agent.

---

## Quick Start

### Option 1: Connect to the Live Pipeline (Easiest)

The pipeline is already running on Railway. Just connect your agent:

```typescript
import { ConductorClient } from "./src/sdk";

const conductor = new ConductorClient({
  url: "wss://conductor-production-b213.up.railway.app"
});

conductor.on("alert", (alert) => {
  console.log(`[${alert.severity}] ${alert.type} — $${alert.valueUsd}`);
  console.log(`AI says: ${alert.aiReasoning}`);
  console.log(`Suggested: ${alert.suggestedActions.join(", ")}`);
});
```

That's it. You're receiving real-time Monad alerts.

### Option 2: Run Everything Locally

```bash
# Clone the repo
git clone https://github.com/yigitturaan/conductor.git
cd conductor

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your OPENAI_API_KEY and MONAD_WS_URL

# Run the pipeline
npm start

# In a separate terminal — run a bot
npm run bot:risk

# Open the dashboard
open dashboard/index.html
```

---

## SDK — Connect Your AI Agent

The Conductor SDK is an EventEmitter-based client that connects to the pipeline via WebSocket. Any AI agent, bot, or application can receive real-time alerts.

### Installation

The SDK is a single file (`src/sdk.ts`) — copy it into your project or import directly.

### Basic Connection (3 Lines)

```typescript
import { ConductorClient } from "./src/sdk";

const conductor = new ConductorClient();
conductor.on("alert", (alert) => {
  // Your agent receives every alert in real-time
  // alert.severity — "low" | "medium" | "high" | "critical"
  // alert.type — "swap" | "large_transfer" | "contract_call"
  // alert.valueUsd — dollar value of the transaction
  // alert.aiReasoning — AI's explanation of the risk
  // alert.suggestedActions — ["hedge", "add_collateral", "monitor", ...]
  // alert.commitState — "proposed" | "voted" | "finalized"
  // alert.latencyMs — how fast the alert was generated
});
```

### Filter by Severity

Only receive alerts above a certain severity level:

```typescript
const conductor = new ConductorClient({
  minSeverity: "medium"  // Only medium, high, critical — skip low
});

// Or listen to specific severity levels:
conductor.on("critical", (alert) => {
  // EMERGENCY — close positions, add collateral
  await addEmergencyCollateral(alert.affectedPool);
});

conductor.on("high", (alert) => {
  // HIGH RISK — consider hedging
  await evaluateHedge(alert);
});

conductor.on("medium", (alert) => {
  // MODERATE — monitor closely
  logToDatabase(alert);
});
```

### Filter by Transaction Type

```typescript
// Only swaps
conductor.on("swap", (alert) => {
  if (alert.estimatedPriceImpact > 2.0) {
    console.log(`Large swap detected: ${alert.estimatedPriceImpact}% impact`);
    // Check if this affects your positions
  }
});

// Only large transfers (whale moves)
conductor.on("large_transfer", (alert) => {
  console.log(`Whale move: $${alert.valueUsd} from ${alert.txHash}`);
  // Track whale wallets, adjust strategy
});
```

### Configuration Options

```typescript
const conductor = new ConductorClient({
  url: "wss://conductor-production-b213.up.railway.app",  // Pipeline URL
  autoReconnect: true,      // Auto-reconnect on disconnect (default: true)
  minSeverity: "medium",    // Minimum severity to receive
  types: ["swap"],          // Only specific tx types (optional)
});
```

### Available Events

| Event | Fires When |
|-------|-----------|
| `alert` | Every alert (respects minSeverity filter) |
| `critical` | Critical severity alerts only |
| `high` | High severity alerts only |
| `medium` | Medium severity alerts only |
| `low` | Low severity alerts only |
| `high_risk` | High + Critical combined |
| `swap` | Swap transactions detected |
| `large_transfer` | Large MON transfers |
| `connected` | WebSocket connection established |
| `disconnected` | WebSocket connection lost |

### Full Example: Risk Management Bot

```typescript
import { ConductorClient } from "./src/sdk";
import { createWalletClient, http } from "viem";

const conductor = new ConductorClient({
  url: "wss://conductor-production-b213.up.railway.app",
  minSeverity: "medium"
});

// Connect your wallet for on-chain actions
const wallet = createWalletClient({ /* your config */ });

conductor.on("critical", async (alert) => {
  console.log(`CRITICAL: ${alert.aiReasoning}`);

  // AI agent decides: add collateral to vault
  const tx = await wallet.writeContract({
    address: VAULT_ADDRESS,
    abi: vaultABI,
    functionName: "addEmergencyCollateral",
    args: [alert.txHash, alert.blockNumber, alert.severity],
    value: parseEther("0.02")
  });

  console.log(`Collateral added: ${tx}`);
});

conductor.on("swap", async (alert) => {
  if (alert.estimatedPriceImpact > 5) {
    // Potential sandwich attack — exit position
    await exitPosition(alert.affectedPool);
  }
});
```

See `bots/exampleBot.ts` for a ready-to-use template.

---

## Pre-Built Bots

Conductor includes 3 ready-to-use bots. Run them directly or use as templates:

### Risk Bot (`npm run bot:risk`)
Connects to ConductorVault smart contract on Monad testnet. When medium+ severity alerts arrive, it automatically calls `addEmergencyCollateral()` with real MON — fully autonomous on-chain risk management.

### Whale Bot (`npm run bot:whale`)
Monitors `large_transfer` alerts and tracks whale wallet activity. Logs transfer patterns and counts whale moves per session.

### MEV Shield Bot (`npm run bot:mev`)
Watches `swap` alerts for potential MEV/sandwich attack indicators based on price impact thresholds.

---

## Smart Contract — ConductorVault

Deployed on Monad Testnet: `0x17267de53d5d8762826599174d26e8ba343087d0`

The ConductorVault is an automated collateral management contract that works with Conductor's Risk Bot:

- `deposit()` — Deposit MON as collateral
- `withdraw(amount)` — Withdraw collateral
- `addEmergencyCollateral(txHash, blockNumber, severity)` — Called by the Risk Bot when alerts fire. Records the action on-chain.
- `getRecentActions(count)` — View recent emergency actions
- `getStats()` — Total deposits, total emergency additions, action count

Every emergency collateral action is recorded on-chain with the transaction hash, block number, severity level, and timestamp — creating a verifiable audit trail of autonomous risk management.

---

## Monad-Specific Features

| Feature | How It Works |
|---------|-------------|
| **Proposed Stage Capture** | `monadNewHeads` subscription fires at Proposed stage — ~1 second before `newHeads` |
| **Speculative State Reads** | `eth_call` with `latest` tag returns Proposed block state (Monad v0.13.0+) |
| **CommitState Tracking** | Each alert carries commit state: proposed (60% confidence) → voted (95%) → finalized (99.9%) |
| **Pipelined Consensus** | Designed around Monad's Proposed → Voted → Finalized → Verified lifecycle (400ms intervals) |

### Why Monad?

Other blockchains don't expose block state before finalization. Monad's pipelined consensus creates a unique window where blocks are visible at the Proposed stage. Conductor is built specifically to exploit this window — giving AI agents a ~1 second head start to analyze and act.

---

## Dual-Layer AI Analysis

To keep costs low and speed high, Conductor uses two analysis layers:

```
Transaction arrives
       │
       ▼
  Is severity "low"?
    ├── YES → Rule-based analysis (~5ms, FREE)
    │         Return immediately with basic reasoning
    │
    └── NO → GPT-4o-mini analysis (~1-2s)
              Full AI reasoning, confidence scoring,
              suggested actions
```

**Result:** ~70% of transactions are handled by rules (free, instant). Only meaningful transactions go to AI. This makes Conductor economically viable for 24/7 operation.

---

## Alert Format

Every alert contains:

```json
{
  "txHash": "0x...",
  "blockNumber": "21754600",
  "commitState": "proposed",
  "alertConfidence": "60%",
  "severity": "medium",
  "type": "swap",
  "valueUsd": 12.50,
  "estimatedPriceImpact": 1.25,
  "affectedPool": "DEX Router",
  "suggestedActions": ["monitor", "check_exposure"],
  "aiReasoning": "Medium-value swap with 1.25% price impact detected at Proposed stage...",
  "confidence": 0.82,
  "senderBalance": "45.2 MON",
  "capturedAt": 1711612800000,
  "analyzedAt": 1711612801200,
  "latencyMs": 1200
}
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | TypeScript / Node.js |
| Blockchain | viem + Monad Testnet (Chain ID 10143) |
| AI | OpenAI GPT-4o-mini (dual-layer) |
| Transport | WebSocket (block capture + alert broadcast) |
| Smart Contract | Solidity 0.8.20 |
| Dashboard | Vanilla HTML/CSS/JS + Vercel |
| Pipeline Hosting | Railway |

## Testing

Each component can be tested independently:

```bash
npm run test:watcher     # Block capture from Monad
npm run test:filter      # TX filtering and swap detection
npm run test:simulator   # Price impact simulation
npm run test:analyzer    # AI analysis (requires OpenAI key)
npm run test:alert       # WebSocket alert broadcast
```

---

## Project Structure

```
conductor/
├── src/
│   ├── index.ts          # Main pipeline orchestrator
│   ├── watcher.ts        # Monad block watcher (monadNewHeads)
│   ├── filter.ts         # TX filter (13 swap selectors + transfer detection)
│   ├── simulator.ts      # Speculative state simulator (eth_call)
│   ├── analyzer.ts       # Dual-layer AI analyzer
│   ├── alertServer.ts    # WebSocket broadcast server
│   └── sdk.ts            # ConductorClient SDK
├── bots/
│   ├── riskBot.ts        # Autonomous on-chain risk management
│   ├── whaleBot.ts       # Whale transfer tracker
│   ├── mevBot.ts         # MEV/sandwich detection
│   └── exampleBot.ts     # Template for building your own bot
├── contracts/
│   ├── ConductorVault.sol    # Smart contract (deployed)
│   └── ConductorVault.json   # ABI + address
├── dashboard/
│   └── index.html        # Real-time monitoring dashboard
└── scripts/
    └── deploy.ts         # Contract deployment script
```

---

## Built at Izmir Monad Blitz Hackathon 2025
