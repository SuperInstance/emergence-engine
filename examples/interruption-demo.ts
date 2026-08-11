// examples/interruption-demo.ts
// Run with: npx tsx examples/interruption-demo.ts
//
// The InterruptionSystem demo: watch it get hungry for disruption.

import { InterruptionSystem } from "../src/interruption.js";
import type { GroupFlow } from "../src/types.js";

// ── Simulate a stagnating conversation ──────────────────────
// Three agents stuck in agreement. Nobody's disagreeing.
// The system should notice and recommend an interruption.

const stagnantFlow: GroupFlow = {
  events: [],
  participantIds: ["alpha", "beta", "gamma"],
  startTime: "2026-08-11T10:00:00Z",
  endTime: "2026-08-11T10:12:00Z",
  convergenceScore: 0.92,
  energyLevel: 0.4,
  vocabularyDiversity: 0.15,
  disagreementCount: 0,
  novelIdeaCount: 0,
  crossPollinationCount: 0,
  averageMessageLength: 38,
  exchangeRate: 12,
};

// ── Run the InterruptionSystem ──────────────────────────────

const system = new InterruptionSystem({
  minInterval: 2,
  maxInterval: 8,
  stagnationThreshold: 0.4,
  qualityThreshold: 0.25,
  hungerFactor: 0.85,
});

console.log("─".repeat(60));
console.log("  Emergence Engine — Interruption Demo");
console.log("─".repeat(60));

console.log("\n  Simulating stagnation. Calling shouldInterrupt() each tick...\n");

for (let tick = 1; tick <= 15; tick++) {
  const hunger = system.getHunger();
  const interruption = system.shouldInterrupt(stagnantFlow, {
    availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "dissatisfaction", "serendipity", "cross_pollination", "external_event"],
    stagnationLevel: 0.85,
    timeSinceLastInterruption: tick,
    agentDissatisfactionScores: new Map([
      ["alpha", 0.3],
      ["beta", 0.6],
      ["gamma", 0.1],
    ]),
    recentTopics: ["agreement", "consensus"],
    modelUpgradeAvailable: false,
  });

  console.log(`  [tick ${tick}] hunger=${hunger.toFixed(2)}${interruption ? " ⚡ INTERRUPT" : ""}`);

  if (interruption) {
    console.log(`     type:    ${interruption.type}`);
    console.log(`     source:  ${interruption.source}`);
    console.log(`     breaks:  ${interruption.whatItBreaks}`);
    console.log(`     offers:  ${interruption.whatItOffers}`);
    console.log(`     quality: ${interruption.quality.toFixed(2)}`);
    system.recordInterruption(interruption, true);
    console.log("");
  }
}

console.log("\n" + "─".repeat(60));
console.log("  Final state:");
console.log(`  Hunger:          ${system.getHunger().toFixed(2)}`);
console.log(`  History:         ${system.getHistory().length} interruptions`);
console.log(`  Acceptance rate: ${(system.getAcceptanceRate() * 100).toFixed(0)}%`);
console.log("─".repeat(60));
