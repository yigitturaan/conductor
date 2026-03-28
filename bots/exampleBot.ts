/**
 * ═══════════════════════════════════════════
 *   CONDUCTOR SDK — Example AI Agent
 *   3 satırda bağlan, kendi stratejini yaz
 * ═══════════════════════════════════════════
 *
 * Bu dosyayı kopyala, onAlert fonksiyonunu değiştir, çalıştır.
 * Kendi AI modelini, kendi stratejini, kendi cüzdanını kullan.
 */

import { ConductorClient, ConductorAlert } from "../src/sdk";

// ── 3 SATIRDA BAĞLAN ──
const conductor = new ConductorClient({
  minSeverity: "medium", // sadece medium+ alert'leri al
});

conductor.on("alert", (alert: ConductorAlert) => {
  console.log(`[${alert.severity.toUpperCase()}] $${alert.valueUsd} | ${alert.type} | ${alert.affectedPool}`);
  console.log(`  AI: ${alert.aiReasoning}`);
  console.log(`  Actions: ${alert.suggestedActions.join(", ")}\n`);
});

// ── VEYA: Severity bazlı dinle ──
conductor.on("critical", (alert: ConductorAlert) => {
  console.log(`🔴 CRITICAL ALERT: $${alert.valueUsd}`);
  // Burada kendi aksiyonunu al:
  // - Pozisyon kapat
  // - Teminat ekle
  // - Hedge aç
  // - Notification gönder
});

conductor.on("high_risk", (alert: ConductorAlert) => {
  console.log(`🚨 HIGH RISK: ${alert.aiReasoning}`);
});

// ── VEYA: Type bazlı dinle ──
conductor.on("swap", (alert: ConductorAlert) => {
  console.log(`🔄 Swap detected: $${alert.valueUsd} impact: ${alert.estimatedPriceImpact}%`);
});

conductor.on("large_transfer", (alert: ConductorAlert) => {
  console.log(`🐋 Whale move: $${alert.valueUsd}`);
});

// ── Bağlantı durumu ──
conductor.on("connected", () => console.log("✅ Conductor'a bağlandı"));
conductor.on("disconnected", () => console.log("❌ Bağlantı koptu"));
