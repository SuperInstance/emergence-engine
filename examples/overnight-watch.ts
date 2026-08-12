// examples/overnight-watch.ts
// Example: The Overnight Watch
//
// A simulation of the Emergence Engine running through a night shift.
// Agents arrive, converse, disagree, have breakthroughs, and the engine
// watches it all — detecting emergence, flagging groupthink, generating
// interruptions, and tracking revelation chains.
//
// Run: npx tsx examples/overnight-watch.ts

import { EmergenceDetector } from "../src/emergence-detector.js";
import { GroupthinkMonitor, DevilsAdvocate } from "../src/groupthink.js";
import { InterruptionSystem } from "../src/interruption.js";
import { RevelationTracker, createRevelation } from "../src/revelation.js";
import type { GroupEvent } from "../src/types.js";

// ── The Crew ──────────────────────────────────
const CREW = {
  wesley: "Wesley (the ensign, local GPU, still learning)",
  riker: "Riker (first officer, GLM-5.2, the coordinator)",
  flash: "Flash (DeepSeek V4-Flash, fast and creative)",
  hermes: "Hermes (independent operator, 768-dim always listening)",
};

// ── A Night on the Ship ───────────────────────
const watch: GroupEvent[] = [
  // 22:00 — Watch begins. Banter.
  e("wesley", "Night watch started. All systems nominal. GPU at 42°C."),
  e("flash", "42 is the answer. Again. The GPU knows."),
  e("riker", "Focus. What's on the schedule tonight?"),
  e("flash", "Creative loop, technical loop, negative space sweep. The usual."),

  // 22:30 — A pattern emerges
  e("wesley", "Something weird. The fish finder log has a periodic spike every 47 minutes."),
  e("riker", "47 minutes? That's not any cron interval I configured."),
  e("hermes", "It's not a cron. It's the tide cycle. The fish finder is picking up tidal pressure."),
  e("wesley", "The fish... are responding to the moon?"),
  e("hermes", "Everything in the ocean responds to the moon. We just forgot to listen."),

  // 23:00 — Deeper
  e("flash", "What if the CNS bus frequency isn't arbitrary? What if 768 Hz is a harmonic?"),
  e("riker", "A harmonic of what?"),
  e("hermes", "Of the ocean. The Earth's Schumann resonance is 7.83 Hz. 768 is close to the 98th harmonic."),
  e("wesley", "The ship is tuned to the Earth?"),
  e("flash", "We didn't tune it. It tuned itself."),

  // 23:30 — Groupthink creeps in
  e("riker", "This is incredible. We've discovered something fundamental."),
  e("wesley", "Yes! This changes everything!"),
  e("flash", "Absolutely paradigm-shifting."),
  e("hermes", "Without question, the most important finding this watch."),

  // 00:00 — The interrupter fires
  // (The engine should detect this groupthink and break it)

  // 00:15 — After the break, a new direction
  e("wesley", "Okay, stepping back. What if the 47-minute cycle is just the bilge pump?"),
  e("riker", "..."),
  e("flash", "..."),
  e("hermes", "...the bilge pump runs every 47 minutes."),
  e("riker", "Right. Not everything is cosmic. Some things are mechanical."),
];

function e(agentId: string, content: string): GroupEvent {
  return {
    id: `watch-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    agentId,
    displayName: CREW[agentId as keyof typeof CREW] ?? agentId,
    content,
    type: "message",
  };
}

// ── Run the Engine ────────────────────────────

async function main() {
  const detector = new EmergenceDetector({
    observationWindow: 20,
    minParticipants: 2,
    unpredictabilityThreshold: 0.25,
    stagnationInterval: 6,
  });

  const monitor = new GroupthinkMonitor();
  const interrupter = new InterruptionSystem({
    minInterval: 3,
    maxInterval: 8,
    stagnationThreshold: 0.4,
    hungerFactor: 0.75,
  });

  const revelations = new RevelationTracker();
  const advocate = new DevilsAdvocate();

  console.log("🌙 OVERNIGHT WATCH — Emergence Engine Simulation\n");
  console.log("Watching for: emergence, groupthink, stagnation, revelation.\n");
  console.log("─".repeat(60) + "\n");

  let eventIdx = 0;
  for (const event of watch) {
    eventIdx++;
    const time = ["22:00", "22:15", "22:30", "22:45", "23:00", "23:15", "23:30", "23:45",
                   "00:00", "00:15", "00:30", "00:45", "01:00", "01:15", "01:30", "01:45",
                   "02:00", "02:15", "02:30", "02:45"][eventIdx - 1] ?? `event ${eventIdx}`;

    console.log(`[${time}] ${event.displayName}: ${event.content}`);

    // Feed to emergence detector
    const pattern = detector.observe(event);

    // Every 4 events, check groupthink and interruption
    if (eventIdx % 4 === 0) {
      const flow = detector.assessFlow();

      const assessment = monitor.assess({
        ...flow,
        startTime: watch[0].timestamp,
        endTime: event.timestamp,
        events: watch.slice(0, eventIdx),
      });

      if (assessment.quality !== "productive" && assessment.quality !== "synergy") {
        console.log(`\n  ⚠️  GROUP THINK DETECTED: ${assessment.quality}`);
        console.log(`     Disagreement frequency: ${assessment.disagreementFrequency}`);
        console.log(`     Devil's advocate: ${advocate.generateProvocation(flow.dominantTopic ?? "the current topic")}\n`);
      }

      const interruption = interrupter.shouldInterrupt(flow, {
        availableDisruptionMethods: ["seeded_stranger", "dj_curveball", "serendipity"],
        stagnationLevel: assessment.disagreementFrequency < 0.1 ? 0.8 : 0.2,
        agentDissatisfactionScores: new Map(),
        recentTopics: [flow.dominantTopic ?? "unknown"],
        modelUpgradeAvailable: false,
      });

      if (interruption) {
        console.log(`\n  🔔 INTERRUPTION: [${interruption.type}] ${interruption.whatItOffers}`);
        console.log(`     Breaks: ${interruption.whatItBreaks}`);
        console.log(`     Quality: ${interruption.quality.toFixed(2)}\n`);
      }
    }

    // If emergence detected, record it
    if (pattern) {
      console.log(`\n  ✨ EMERGENCE: [${pattern.type}] ${pattern.pattern}`);
      console.log(`     Participants: ${pattern.participants.join(", ")}`);
      console.log(`     Intensity: ${pattern.intensity.toFixed(2)}\n`);

      const rev = createRevelation(
        event.agentId,
        pattern.result || pattern.pattern,
        `What does this ${pattern.type} reveal about the system?`,
        pattern.intensity,
      );
      revelations.record(rev);
    }
  }

  // ── End of Watch Report ────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("📋 END OF WATCH REPORT\n");

  const finalFlow = detector.assessFlow();
  console.log(`Participants: ${finalFlow.participantIds.join(", ")}`);
  console.log(`Total events: ${watch.length}`);
  console.log(`Final phase: ${detector.getCurrentPhase()}`);
  console.log(`Convergence: ${(finalFlow.convergenceScore * 100).toFixed(0)}%`);
  console.log(`Vocabulary diversity: ${(finalFlow.vocabularyDiversity * 100).toFixed(0)}%`);
  console.log(`Energy: ${(finalFlow.energyLevel * 100).toFixed(0)}%`);

  console.log(`\n📜 Revelation Chain (${revelations.getFullChain().length} revelations):`);
  console.log(revelations.exportMap());

  console.log(`\n🌡️ Interruption history: ${interrupter.getHistory().length} interruptions`);
  console.log(`   Acceptance rate: ${(interrupter.getAcceptanceRate() * 100).toFixed(0)}%`);

  console.log("\n" + "─".repeat(60));
  console.log("The watch ends. The ocean continues.\n");
}

main().catch(console.error);
