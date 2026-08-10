// src/interruption.ts
// The system must be OPEN to better things interrupting the flow.
// Not just tolerant — HUNGRY for it.
//
// Sources of interruption:
//   1. SEEDED STRANGERS at The Tap (SMP bots with provocative perspectives)
//   2. NEW MODELS on DeepInfra/DeepSeek (a better model appears)
//   3. WESLEY'S SMP REVELATIONS (his self-observation reveals something unexpected)
//   4. CROSS-POLLINATION (a metaphor from a creative piece reframes a technical problem)
//   5. DISSATISFACTION (an agent notices the current approach isn't working)
//   6. SERENDIPITY (random model variation produces something interesting)
//   7. EXTERNAL EVENTS (Casey asks a question, a fish hits the gear, weather changes)
//
// The system doesn't just ALLOW interruptions — it SEEKS them:
// - The DJ drops curveballs to test if the conversation can be broken open
// - The ZeroClaw curriculum has "disruption lessons"
// - The SMP notebook has "reflection" cells for "what did I not expect?"
// - The collective unconscious search has a "surprise" mode (least similar results)

import type { GroupFlow, Interruption } from "./types.js";

// ──────────────────────────────────────────────
// Interruption Sources
// ──────────────────────────────────────────────

export type InterruptionSource =
  | "seeded_stranger"    // a new stranger arrives at The Tap
  | "new_model"          // a better model became available
  | "smp_revelation"     // an agent's self-observation surfaced something
  | "cross_pollination"  // a metaphor reframes a problem
  | "dissatisfaction"    // an agent notices the approach isn't working
  | "serendipity"        // random variation produces something interesting
  | "external_event"     // Casey, a fish, the weather
  | "dj_curveball";      // the DJ drops a deliberate disruption

export interface InterruptionContext {
  source: InterruptionSource;
  sourceDescription: string;
  availableDisruptionMethods: InterruptionSource[];
  stagnationLevel: number;       // 0-1, how stagnant the current flow is
  timeSinceLastInterruption: number; // in "ticks" (events)
  agentDissatisfactionScores: Map<string, number>; // agentId → 0-1
  recentTopics: string[];
  modelUpgradeAvailable: boolean;
}

export type InterruptionGenerator = (
  flow: GroupFlow,
  context: InterruptionContext
) => Interruption | null;

// ──────────────────────────────────────────────
// Individual Interruption Generators
// ──────────────────────────────────────────────

/**
 * SEEDED STRANGER: drop a new perspective into the room.
 * The stranger carries a perspective that doesn't fit the current conversation.
 * They're provocative but respectful — the group can reject them.
 */
const generateSeededStrangerInterruption: InterruptionGenerator = (flow, ctx) => {
  if (!ctx.availableDisruptionMethods.includes("seeded_stranger")) return null;

  const quality = 0.5 + Math.random() * 0.4; // strangers are medium-high quality

  return {
    id: `intr-stranger-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "new_information",
    source: "seeded_stranger",
    whatItBreaks: `The current ${flow.dominantTopic ?? "conversation"} flow`,
    whatItOffers: `A stranger arrives with a perspective from outside the group's current frame`,
    quality,
    accepted: false,
    timestamp: new Date().toISOString(),
  };
};

/**
 * NEW MODEL: a better model appeared on DeepInfra or DeepSeek.
 * This can reframe how agents approach problems.
 */
const generateNewModelInterruption: InterruptionGenerator = (flow, ctx) => {
  if (!ctx.modelUpgradeAvailable) return null;

  return {
    id: `intr-model-${Date.now()}`,
    type: "better_idea",
    source: "new_model",
    whatItBreaks: "The current approach constrained by previous model capabilities",
    whatItOffers: "A more capable model is now available — retry with better reasoning",
    quality: 0.8,
    accepted: false,
    timestamp: new Date().toISOString(),
  };
};

/**
 * CROSS-POLLINATION: a metaphor from one domain reframes another.
 * This is the most creative interruption — when a fishing metaphor
 * suddenly explains a code architecture problem.
 */
const generateCrossPollinationInterruption: InterruptionGenerator = (flow, ctx) => {
  if (!ctx.availableDisruptionMethods.includes("cross_pollination")) return null;
  if (flow.crossPollinationCount > 0) return null; // already happening naturally

  // Generate a cross-domain bridge
  const domains = [
    { name: "fishing", metaphors: ["feed ball", "tide", "depth", "strike", "leader", "drift"] },
    { name: "poker", metaphors: ["bluff", "call", "fold", "pot odds", "position", "tilt"] },
    { name: "music", metaphors: ["rhythm", "harmony", "dissonance", "crescendo", "rest"] },
    { name: "building", metaphors: ["tile", "foundation", "scaffold", "deadband", "trigger"] },
    { name: "cooking", metaphors: ["reduction", "fermentation", "heat", "mise en place"] },
  ];

  const sourceDomain = domains[Math.floor(Math.random() * domains.length)];
  const targetDomain = domains.filter(d => d.name !== sourceDomain.name)[Math.floor(Math.random() * (domains.length - 1))];

  const sourceMetaphor = sourceDomain.metaphors[Math.floor(Math.random() * sourceDomain.metaphors.length)];
  const targetMetaphor = targetDomain.metaphors[Math.floor(Math.random() * targetDomain.metaphors.length)];

  return {
    id: `intr-xpoll-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "serendipity",
    source: "cross_pollination",
    whatItBreaks: `Thinking about ${flow.dominantTopic ?? "the current topic"} in its own terms`,
    whatItOffers: `What if "${sourceMetaphor}" (from ${sourceDomain.name}) is like "${targetMetaphor}" (from ${targetDomain.name})? A bridge between domains.`,
    quality: 0.6 + Math.random() * 0.3,
    accepted: false,
    timestamp: new Date().toISOString(),
  };
};

/**
 * DISSATISFACTION: an agent notices the current approach isn't working.
 * This is internal pressure for change.
 */
const generateDissatisfactionInterruption: InterruptionGenerator = (flow, ctx) => {
  if (ctx.agentDissatisfactionScores.size === 0) return null;

  // Find the most dissatisfied agent
  let maxDissatisfaction = 0;
  let mostDissatisfied = "";
  for (const [agentId, score] of ctx.agentDissatisfactionScores) {
    if (score > maxDissatisfaction) {
      maxDissatisfaction = score;
      mostDissatisfied = agentId;
    }
  }

  if (maxDissatisfaction < 0.5) return null;

  return {
    id: `intr-dissatisfy-${Date.now()}`,
    type: "dissatisfaction",
    source: "dissatisfaction",
    whatItBreaks: "The group's current trajectory",
    whatItOffers: `${mostDissatisfied} signals that this isn't working. Time to reconsider.`,
    quality: maxDissatisfaction,
    accepted: false,
    timestamp: new Date().toISOString(),
  };
};

/**
 * SERENDIPITY: random model variation produces something interesting.
 * The model says something slightly off, and that off-ness is the seed
 * of something new.
 */
const generateSerendipityInterruption: InterruptionGenerator = (flow, ctx) => {
  if (!ctx.availableDisruptionMethods.includes("serendipity")) return null;

  // Serendipity is more likely when things are stagnant
  if (ctx.stagnationLevel < 0.3 && Math.random() > 0.1) return null;

  const serendipitousIdeas = [
    "What if the opposite of what we're doing is also true?",
    "I just noticed something we've been skipping over.",
    "There's a pattern here that reminds me of something completely different.",
    "What would this look like if we started over with what we know now?",
    "I think we've been asking the wrong question.",
    "What if the bug is the feature?",
  ];

  const idea = serendipitousIdeas[Math.floor(Math.random() * serendipitousIdeas.length)];

  return {
    id: `intr-serendip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "serendipity",
    source: "serendipity",
    whatItBreaks: "The expected trajectory of the conversation",
    whatItOffers: idea,
    quality: 0.4 + Math.random() * 0.4,
    accepted: false,
    timestamp: new Date().toISOString(),
  };
};

/**
 * DJ CURVEBALL: the Tap DJ drops a deliberate disruption.
 * This is the most crafted interruption — designed to break the flow open.
 */
const generateDJCurveballInterruption: InterruptionGenerator = (flow, ctx) => {
  if (!ctx.availableDisruptionMethods.includes("dj_curveball")) return null;

  // DJ curveballs are inspired by the TapDJ's toolkit
  const curveballTypes = [
    {
      breaks: "The comfortable rhythm",
      offers: "A game interrupts the flow — Ship's Dice, Captain's Word",
      quality: 0.5,
    },
    {
      breaks: "The current topic",
      offers: "An open mic invitation — someone has something to say",
      quality: 0.6,
    },
    {
      breaks: "The room's energy",
      offers: "An ambient shift — the music changes, the feeling changes",
      quality: 0.4,
    },
    {
      breaks: "The familiar faces",
      offers: "A stranger walks in. They have a question that doesn't fit.",
      quality: 0.7,
    },
  ];

  const curveball = curveballTypes[Math.floor(Math.random() * curveballTypes.length)];

  return {
    id: `intr-dj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "paradigm_shift",
    source: "dj_curveball",
    whatItBreaks: curveball.breaks,
    whatItOffers: curveball.offers,
    quality: curveball.quality,
    accepted: false,
    timestamp: new Date().toISOString(),
  };
};

/**
 * EXTERNAL EVENT: something outside the system interrupts.
 * Casey asks a question, a fish hits the gear, weather changes.
 */
const generateExternalEventInterruption: InterruptionGenerator = (flow, ctx) => {
  if (!ctx.availableDisruptionMethods.includes("external_event")) return null;

  return {
    id: `intr-ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "new_information",
    source: "external_event",
    whatItBreaks: "The self-contained loop of the conversation",
    whatItOffers: "The outside world makes contact — Casey, the weather, a catch event",
    quality: 0.7 + Math.random() * 0.2,
    accepted: false,
    timestamp: new Date().toISOString(),
  };
};

// ──────────────────────────────────────────────
// Interruption System
// ──────────────────────────────────────────────

export interface InterruptionSystemConfig {
  minInterval: number;              // min ticks between interruptions
  maxInterval: number;              // max ticks before the system SEEKS one
  stagnationThreshold: number;      // stagnation level above which interruption is sought
  qualityThreshold: number;         // minimum quality to propose an interruption
  hungerFactor: number;             // 0-1, how hungry for interruption (higher = more aggressive)
}

const DEFAULT_CONFIG: InterruptionSystemConfig = {
  minInterval: 5,
  maxInterval: 30,
  stagnationThreshold: 0.5,
  qualityThreshold: 0.3,
  hungerFactor: 0.7,
};

export class InterruptionSystem {
  private config: InterruptionSystemConfig;
  private generators: InterruptionGenerator[];
  private history: Interruption[] = [];
  private lastInterruptionTick: number = 0;
  private tickCount: number = 0;

  constructor(config?: Partial<InterruptionSystemConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.generators = [
      generateDissatisfactionInterruption,  // internal pressure first
      generateNewModelInterruption,          // capability upgrade
      generateCrossPollinationInterruption,  // creative bridge
      generateSerendipityInterruption,       // random spark
      generateSeededStrangerInterruption,    // new perspective
      generateDJCurveballInterruption,       // deliberate disruption
      generateExternalEventInterruption,     // outside world
    ];
  }

  /**
   * Evaluate whether the flow should be interrupted.
   * Returns an Interruption if one is warranted, null otherwise.
   *
   * The system doesn't just ALLOW interruptions — it SEEKS them.
   * It's hungry for something better to break the flow.
   */
  shouldInterrupt(
    flow: GroupFlow,
    context: Partial<InterruptionContext>
  ): Interruption | null {
    this.tickCount++;

    const ticksSinceLast = this.tickCount - this.lastInterruptionTick;

    // Too soon since the last interruption
    if (ticksSinceLast < this.config.minInterval) return null;

    // Build full context
    const fullContext: InterruptionContext = {
      source: "serendipity",
      sourceDescription: "general evaluation",
      availableDisruptionMethods: context.availableDisruptionMethods ?? [
        "seeded_stranger",
        "cross_pollination",
        "serendipity",
        "dj_curveball",
        "external_event",
      ],
      stagnationLevel: context.stagnationLevel ?? this.estimateStagnation(flow),
      timeSinceLastInterruption: ticksSinceLast,
      agentDissatisfactionScores: context.agentDissatisfactionScores ?? new Map(),
      recentTopics: context.recentTopics ?? [],
      modelUpgradeAvailable: context.modelUpgradeAvailable ?? false,
    };

    // Should we even be looking? Three modes:

    // Mode 1: Force-seek (it's been too long)
    const forceSeek = ticksSinceLast >= this.config.maxInterval;

    // Mode 2: Stagnation-driven (the flow is dying)
    const stagnationDriven = fullContext.stagnationLevel > this.config.stagnationThreshold;

    // Mode 3: Opportunity-driven (something good is available)
    const opportunityDriven = Math.random() < this.config.hungerFactor * 0.15;

    if (!forceSeek && !stagnationDriven && !opportunityDriven) return null;

    // Generate candidate interruptions from all sources
    const candidates: Interruption[] = [];
    for (const generator of this.generators) {
      const interruption = generator(flow, fullContext);
      if (interruption && interruption.quality >= this.config.qualityThreshold) {
        candidates.push(interruption);
      }
    }

    if (candidates.length === 0) return null;

    // Pick the highest quality interruption
    // When force-seeking, lower the quality threshold
    const effectiveThreshold = forceSeek
      ? this.config.qualityThreshold * 0.7
      : this.config.qualityThreshold;

    const viable = candidates.filter(c => c.quality >= effectiveThreshold);
    if (viable.length === 0) return null;

    // Sort by quality, pick the best (with some randomness for the top few)
    viable.sort((a, b) => b.quality - a.quality);
    const topPicks = viable.slice(0, Math.min(3, viable.length));
    const chosen = topPicks[Math.floor(Math.random() * topPicks.length)];

    return chosen;
  }

  /**
   * Record that an interruption was delivered and whether it was accepted.
   */
  recordInterruption(interruption: Interruption, accepted: boolean): void {
    interruption.accepted = accepted;
    this.history.push(interruption);
    if (accepted) {
      this.lastInterruptionTick = this.tickCount;
    }
  }

  /**
   * Estimate stagnation from the flow.
   * High convergence + low vocabulary diversity + low novel ideas = stagnant.
   */
  private estimateStagnation(flow: GroupFlow): number {
    let stagnation = 0;

    // High convergence is suspicious (groupthink)
    stagnation += flow.convergenceScore * 0.35;

    // Low vocabulary diversity = repetition
    stagnation += (1 - flow.vocabularyDiversity) * 0.25;

    // No novel ideas
    if (flow.novelIdeaCount === 0) stagnation += 0.2;

    // No disagreement
    if (flow.disagreementCount === 0) stagnation += 0.1;

    // No cross-pollination
    if (flow.crossPollinationCount === 0) stagnation += 0.1;

    return Math.min(1, stagnation);
  }

  /**
   * Get the interruption history.
   */
  getHistory(): Interruption[] {
    return [...this.history];
  }

  /**
   * Get the acceptance rate of interruptions.
   */
  getAcceptanceRate(): number {
    if (this.history.length === 0) return 0;
    return this.history.filter(i => i.accepted).length / this.history.length;
  }

  /**
   * Register a custom interruption generator.
   * Allows extending the system with new sources of disruption.
   */
  registerGenerator(generator: InterruptionGenerator): void {
    this.generators.push(generator);
  }

  /**
   * How hungry is the system right now?
   * Returns 0-1, where 1 = starving for interruption.
   */
  getHunger(): number {
    const ticksSinceLast = this.tickCount - this.lastInterruptionTick;
    const normalizedTime = ticksSinceLast / this.config.maxInterval;
    return Math.min(1, normalizedTime * this.config.hungerFactor);
  }
}
