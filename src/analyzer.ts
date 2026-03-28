import OpenAI from "openai";
import dotenv from "dotenv";
import type { SimulationResult } from "./simulator";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface AnalyzedAlert {
  txHash: string;
  blockNumber: string;
  commitState: "proposed" | "voted" | "finalized";
  alertConfidence: string;

  severity: string;
  type: string;
  valueUsd: number;
  estimatedPriceImpact: number;
  affectedPool: string;
  suggestedActions: string[];
  aiReasoning: string;
  confidence: number;
  senderBalance: string;

  capturedAt: number;
  analyzedAt: number;
  latencyMs: number;
}

// CommitState tracker — blok numarasına göre state takibi
// Proposed aşamada yakalıyoruz, zaman geçtikçe güncelliyoruz
const blockStates = new Map<string, { state: AnalyzedAlert["commitState"]; capturedAt: number }>();

function getCommitState(blockNumber: string): { state: AnalyzedAlert["commitState"]; confidence: string } {
  const existing = blockStates.get(blockNumber);

  if (!existing) {
    // İlk kez görülen blok — Proposed aşamada
    blockStates.set(blockNumber, { state: "proposed", capturedAt: Date.now() });
    return { state: "proposed", confidence: "60%" };
  }

  // Monad'da blok lifecycle: ~400ms per stage
  const elapsed = Date.now() - existing.capturedAt;

  if (elapsed > 800) {
    existing.state = "finalized";
    return { state: "finalized", confidence: "99.9%" };
  } else if (elapsed > 400) {
    existing.state = "voted";
    return { state: "voted", confidence: "95%" };
  }

  return { state: "proposed", confidence: "60%" };
}

// Eski blok state'lerini temizle (memory leak önlemi)
setInterval(() => {
  const now = Date.now();
  for (const [block, data] of blockStates) {
    if (now - data.capturedAt > 30000) blockStates.delete(block);
  }
}, 10000);

// ── Dual-Layer Analysis ──
// Layer 1: Kural tabanlı (~5ms) — low severity tx'ler AI'a gitmez
// Layer 2: AI analiz (~1-2s) — sadece medium+ severity
// Bu sayede OpenAI maliyeti ~%70 düşer, low alert'ler anında işlenir

let aiCallCount = 0;
let ruleCallCount = 0;

function ruleBasedAnalysis(simResult: SimulationResult, state: AnalyzedAlert["commitState"], confidence: string): AnalyzedAlert {
  ruleCallCount++;
  const analyzedAt = Date.now();

  // Hızlı kural tabanlı reasoning
  let reasoning = "";
  if (simResult.valueUsd === 0) {
    reasoning = `Zero-value ${simResult.txType} — no financial risk.`;
  } else if (simResult.estimatedPriceImpact < 0.1) {
    reasoning = `Minimal impact (${simResult.estimatedPriceImpact}%) — within normal range.`;
  } else {
    reasoning = `Low risk ${simResult.txType}: $${simResult.valueUsd.toFixed(2)} with ${simResult.estimatedPriceImpact}% impact.`;
  }

  return {
    txHash: simResult.txHash,
    blockNumber: simResult.blockNumber.toString(),
    commitState: state,
    alertConfidence: confidence,
    severity: simResult.severity,
    type: simResult.txType,
    valueUsd: simResult.valueUsd,
    estimatedPriceImpact: simResult.estimatedPriceImpact,
    affectedPool: simResult.affectedPool,
    suggestedActions: ["monitor"],
    aiReasoning: reasoning,
    confidence: 0.6,
    senderBalance: simResult.senderBalance,
    capturedAt: simResult.simulatedAt,
    analyzedAt,
    latencyMs: analyzedAt - simResult.simulatedAt,
  };
}

export function getAnalyzerStats() {
  return { aiCalls: aiCallCount, ruleCalls: ruleCallCount };
}

export async function analyzeWithAI(simResult: SimulationResult): Promise<AnalyzedAlert> {
  const blockStr = simResult.blockNumber.toString();
  const { state, confidence } = getCommitState(blockStr);

  // ── Layer 1: Low severity → kural tabanlı, AI'a gitmez ──
  if (simResult.severity === "low") {
    return ruleBasedAnalysis(simResult, state, confidence);
  }

  // ── Layer 2: Medium+ → AI analiz ──
  aiCallCount++;

  const prompt = `Monad blockchain'de Proposed aşamada bir işlem tespit edildi. Analiz et:

İşlem tipi: ${simResult.txType}
Değer: $${simResult.valueUsd.toFixed(2)}
Tahmini fiyat etkisi: %${simResult.estimatedPriceImpact}
Severity: ${simResult.severity}
Etkilenen havuz/kontrat: ${simResult.affectedPool}
Gönderen bakiyesi: ${simResult.senderBalance} MON
CommitState: ${state} (güven: ${confidence})

JSON formatında cevap ver:
{
  "severity": "low|medium|high|critical",
  "suggestedActions": ["aksiyon1", "aksiyon2"],
  "aiReasoning": "Kısa analiz açıklaması",
  "confidence": 0.0-1.0
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Sen bir DeFi risk analistisin. Monad blockchain'deki spekülatif işlemleri analiz ediyorsun. İşlem henüz kesinleşmedi (Proposed aşamada). Kısa, net JSON cevaplar ver. İngilizce yaz.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || "{}";

    // JSON parse — markdown code block varsa çıkar
    const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = {
        severity: simResult.severity,
        suggestedActions: ["monitor"],
        aiReasoning: content.slice(0, 200),
        confidence: 0.7,
      };
    }

    const analyzedAt = Date.now();

    return {
      txHash: simResult.txHash,
      blockNumber: blockStr,
      commitState: state,
      alertConfidence: confidence,
      severity: parsed.severity || simResult.severity,
      type: simResult.txType,
      valueUsd: simResult.valueUsd,
      estimatedPriceImpact: simResult.estimatedPriceImpact,
      affectedPool: simResult.affectedPool,
      suggestedActions: parsed.suggestedActions || ["monitor"],
      aiReasoning: parsed.aiReasoning || "Analysis complete",
      confidence: parsed.confidence || 0.7,
      senderBalance: simResult.senderBalance,
      capturedAt: simResult.simulatedAt,
      analyzedAt,
      latencyMs: analyzedAt - simResult.simulatedAt,
    };
  } catch (error: any) {
    // API hatası — rule-based fallback
    const analyzedAt = Date.now();
    return {
      txHash: simResult.txHash,
      blockNumber: blockStr,
      commitState: state,
      alertConfidence: confidence,
      severity: simResult.severity,
      type: simResult.txType,
      valueUsd: simResult.valueUsd,
      estimatedPriceImpact: simResult.estimatedPriceImpact,
      affectedPool: simResult.affectedPool,
      suggestedActions: ["monitor"],
      aiReasoning: `[Rule-based] ${simResult.severity} risk detected. Impact: ${simResult.estimatedPriceImpact}%`,
      confidence: 0.5,
      senderBalance: simResult.senderBalance,
      capturedAt: simResult.simulatedAt,
      analyzedAt,
      latencyMs: analyzedAt - simResult.simulatedAt,
    };
  }
}
