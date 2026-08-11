// examples/basic-emergence.ts
// Run with: npx tsx examples/basic-emergence.ts
//
// A minimal demo: feed conversation events to the EmergenceDetector
// and watch it find patterns no individual agent produced.

import { EmergenceDetector } from "../src/emergence-detector.js";
import type { GroupEvent } from "../src/types.js";

// ── Fabricated conversation ──────────────────────────────────
// Three agents in a room. None of them could produce the synthesis alone.

const events: GroupEvent[] = [
  {
    id: "e1",
    timestamp: new Date("2026-08-11T10:00:00Z").toISOString(),
    agentId: "wesley",
    displayName: "Wesley",
    content: "The depth sensor keeps returning weird values at night.",
    type: "message",
  },
  {
    id: "e2",
    timestamp: new Date("2026-08-11T10:01:00Z").toISOString(),
    agentId: "riker",
    displayName: "Riker",
    content: "Weird how? Like noise, or like a pattern in the noise?",
    type: "message",
    metadata: { replyTo: "e1" },
  },
  {
    id: "e3",
    timestamp: new Date("2026-08-11T10:02:00Z").toISOString(),
    agentId: "wesley",
    displayName: "Wesley",
    content: "A pattern. Like the fish are singing at a frequency the sensor picks up.",
    type: "message",
    metadata: { replyTo: "e2" },
  },
  {
    id: "e4",
    timestamp: new Date("2026-08-11T10:03:00Z").toISOString(),
    agentId: "hermes",
    displayName: "Hermes",
    content: "Wait— that's it. The sensor isn't broken. It's a hydrophone.",
    type: "message",
    metadata: { replyTo: "e3" },
  },
  {
    id: "e5",
    timestamp: new Date("2026-08-11T10:04:00Z").toISOString(),
    agentId: "hermes",
    displayName: "Hermes",
    content: "Oh, I see now. The depth readings are entangled with the bioluminescence cycle. The fish ARE the sensor.",
    type: "message",
    metadata: { replyTo: "e3" },
  },
];

// ── Run the detector ─────────────────────────────────────────

const detector = new EmergenceDetector({
  observationWindow: 10,
  minParticipants: 2,
  unpredictabilityThreshold: 0.5,
  stagnationInterval: 8,
});

console.log("─".repeat(60));
console.log("  Emergence Engine — Basic Example");
console.log("─".repeat(60));

for (const event of events) {
  const pattern = detector.observe(event);
  const tag = pattern
    ? `✨ EMERGENT [${pattern.type.toUpperCase()}] intensity=${pattern.intensity.toFixed(2)}`
    : "  (no emergence)";

  console.log(`\n[${event.timestamp}]`);
  console.log(`  ${event.displayName}: "${event.content}"`);
  console.log(`  → ${tag}`);

  if (pattern) {
    console.log(`     pattern: ${pattern.pattern}`);
    console.log(`     result:  ${pattern.result}`);
    console.log(`     unpredictable by any single agent: ${pattern.noIndividualCouldPredict}`);
  }
}

console.log("\n" + "─".repeat(60));
console.log("  Detected Patterns Summary");
console.log("─".repeat(60));

const patterns = detector.getDetectedPatterns();
console.log(`  Total: ${patterns.length}`);

for (const p of patterns) {
  console.log(`\n  [${p.type}] ${p.pattern}`);
  console.log(`    participants: ${p.participants.join(", ")}`);
  console.log(`    intensity:    ${p.intensity.toFixed(2)}`);
}

// ── Flow assessment ──────────────────────────────────────────

console.log("\n" + "─".repeat(60));
console.log("  Flow Assessment");
console.log("─".repeat(60));

const flow = detector.assessFlow();
console.log(`  Participants:        ${flow.participantIds.join(", ")}`);
console.log(`  Convergence:         ${flow.convergenceScore.toFixed(2)}`);
console.log(`  Energy:              ${flow.energyLevel.toFixed(2)}`);
console.log(`  Vocabulary diversity: ${flow.vocabularyDiversity.toFixed(2)}`);
console.log(`  Novel ideas:         ${flow.novelIdeaCount}`);
console.log(`  Cross-pollination:   ${flow.crossPollinationCount}`);
console.log(`  Stagnating?          ${detector.isStagnating()}`);
console.log(`  Current phase:       ${detector.getCurrentPhase()}`);
