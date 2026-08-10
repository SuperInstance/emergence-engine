// src/index.ts
// Emergence Engine — iterative revelations, groupthink quality, interruption system.
//
// The system isn't a closed loop. It's an OPEN loop that's hungry for interruption.
// This is what makes The Tap alive: not a closed loop, but an open one that's
// hungry for the unexpected.
//
// Architecture:
//   EmergenceDetector  → watches for patterns no individual could produce
//   InterruptionSystem → actively seeks better things to break the flow
//   RevelationTracker  → builds iterative insight chains across agents
//   GroupthinkMonitor  → distinguishes synergy from conformity

export { EmergenceDetector, PredictabilityEstimator } from "./emergence-detector.js";
export type { EmergenceDetectorConfig } from "./emergence-detector.js";

export { InterruptionSystem } from "./interruption.js";
export type {
  InterruptionSystemConfig,
  InterruptionSource,
  InterruptionContext,
  InterruptionGenerator,
} from "./interruption.js";

export { RevelationTracker, createRevelation } from "./revelation.js";
export type { RevelationChain, RevelationLink } from "./revelation.js";

export { GroupthinkMonitor, DevilsAdvocate } from "./groupthink.js";
export type { GroupthinkMonitorConfig } from "./groupthink.js";

export type {
  GroupEvent,
  GroupFlow,
  EmergentPattern,
  Interruption,
  Revelation,
  GroupthinkAssessment,
  GroupthinkQuality,
  PhaseTransition,
} from "./types.js";
