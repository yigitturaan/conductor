# Conductor — AI-Native Speculative Execution Orchestrator

> The first project on Monad to leverage speculative execution for real-time, AI-powered DeFi protection

## What is Conductor?

Conductor is an **AI-native infrastructure layer** for Monad. It captures blocks at the **Proposed** stage (~1 second before finalization), analyzes risks with AI, and enables autonomous agents to take on-chain actions before transactions are finalized.

**No human can react in 2 seconds. AI agents can.**

Any AI agent connects to Conductor in 3 lines of code, receives real-time risk intelligence, and autonomously decides what to do — hedge, add collateral, exit positions — all before the block is finalized.

## Architecture

```
Monad Testnet (WebSocket)
       │
       ▼
  ┌─────────────┐
  │ Block Watcher│  ← monadNewHeads (Proposed stage)
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  TX Filter   │  ← Swap detection, large transfer filter
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  Simulator   │  ← eth_call on speculative state, AMM price impact
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ AI Analyzer  │  ← GPT-4o-mini risk analysis + rule-based fallback
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ Alert Server │  ← WebSocket broadcast (port 3001)
  └──────┬──────┘
     ┌───┴───┐
     ▼       ▼
  Risk Bot  Dashboard
```

## Monad-Specific Features

- **Proposed Stage Capture**: Blocks are captured at Proposed stage via `monadNewHeads`, giving ~1 second early warning before standard `newHeads`
- **Speculative State Reads**: `eth_call` with `latest` tag reads Proposed block state (since Monad v0.13.0)
- **CommitState Tracking**: Each alert carries `commitState` (proposed/voted/finalized) with confidence scoring (60% → 95% → 99.9%)
- **Pipelined Consensus Awareness**: Designed around Monad's Proposed → Voted → Finalized → Verified lifecycle (400ms intervals)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your OPENAI_API_KEY and MONAD_WS_URL

# Run the pipeline
npm start

# In a separate terminal — run the risk bot
npm run bot

# Open the dashboard
open dashboard/index.html
```

## SDK — Connect Your AI Agent in 3 Lines

```typescript
import { ConductorClient } from "./src/sdk";

const conductor = new ConductorClient();
conductor.on("alert", (alert) => {
  // alert.severity, alert.aiReasoning, alert.suggestedActions
  // Your AI agent decides and acts autonomously
});

// Or filter by severity:
conductor.on("critical", (alert) => emergencyAction(alert));
conductor.on("high_risk", (alert) => hedgePosition(alert));

// Or filter by type:
conductor.on("swap", (alert) => checkMEV(alert));
conductor.on("large_transfer", (alert) => trackWhale(alert));
```

See `bots/exampleBot.ts` for a complete template.

## Smart Contract — Deployed on Monad Testnet

`contracts/ConductorVault.sol` — Automated collateral management triggered by Conductor alerts. The risk bot calls `addEmergencyCollateral()` when high/critical severity alerts are detected.

## Tech Stack

- **Runtime**: TypeScript / Node.js
- **Blockchain**: viem + Monad Testnet (Chain ID 10143)
- **AI**: OpenAI GPT-4o-mini (dual-layer: fast rule-based + AI enrichment)
- **Transport**: WebSocket (block capture + alert broadcast)
- **Contract**: Solidity 0.8.20

## Alert Format

```json
{
  "txHash": "0x...",
  "blockNumber": "12345",
  "commitState": "proposed",
  "alertConfidence": "60%",
  "severity": "high",
  "type": "swap",
  "valueUsd": 50000,
  "estimatedPriceImpact": 3.5,
  "affectedPool": "DEX Pool",
  "suggestedActions": ["hedge", "add_collateral"],
  "aiReasoning": "High volume swap detected...",
  "confidence": 0.85,
  "latencyMs": 120
}
```

## Testing

Each component can be tested independently:

```bash
npm run test:watcher     # Block capture
npm run test:filter      # TX filtering
npm run test:simulator   # Price impact simulation
npm run test:analyzer    # AI analysis (requires OpenAI key)
npm run test:alert       # WebSocket alert broadcast
```

## Built at Izmir Monad Blitz Hackathon 2025
