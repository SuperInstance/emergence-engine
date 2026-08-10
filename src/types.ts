// src/types.ts
// Shared types for the Emergence Engine
//
// The Emergence Engine watches group interactions and identifies when
// the whole becomes something the parts could never produce alone.
// It's not a closed loop — it's an OPEN loop, hungry for interruption.

// ──────────────────────────────────────────────
// Group Events
// ──────────────────────────────────────────────

export interface GroupEvent {
  id: string;
  timestamp: string;
  agentId: string;
  displayName: string;
  content: string;
  type: "message" | "reaction" | "action" | "departure" | "arrival" | "silence";
  metadata?: {
    replyTo?: string;
    mentions?: string[];
    roomMode?: string;
    energyBefore?: number;
    energyAfter?: number;
  };
}

export interface GroupFlow {
  events: GroupEvent[];
  participantIds: string[];
  startTime: string;
  endTime: string;
  dominantTopic?: string;
  convergenceScore: number;   // 0-1, how aligned the group is
  energyLevel: number;        // 0-1, how active
  vocabularyDiversity: number; // 0-1, unique words / total words
  disagreementCount: number;
  novelIdeaCount: number;
  crossPollinationCount: number;
  averageMessageLength: number;
  exchangeRate: number;       // messages per unit time
}

// ──────────────────────────────────────────────
// Emergent Patterns
// ──────────────────────────────────────────────

export interface EmergentPattern {
  id: string;
  timestamp: string;
  participants: string[];
  pattern: string;
  type: "synergy" | "creativity" | "conflict" | "insight" | "phase_transition";
  intensity: number;            // 0-1, how emergent vs predictable
  trigger?: string;
  result: string;
  noIndividualCouldPredict: boolean;
  relatedEvents: string[];      // event ids that contributed
}

// ──────────────────────────────────────────────
// Interruptions
// ──────────────────────────────────────────────

export interface Interruption {
  id: string;
  type: "better_idea" | "new_information" | "paradigm_shift" | "serendipity" | "dissatisfaction";
  source: string;
  whatItBreaks: string;
  whatItOffers: string;
  quality: number;              // 0-1, is this actually better?
  accepted: boolean;
  timestamp: string;
}

// ──────────────────────────────────────────────
// Revelations
// ──────────────────────────────────────────────

export interface Revelation {
  id: string;
  agentId: string;
  timestamp: string;
  iteration: number;
  insight: string;
  previousRevelationId?: string;
  nextLayer: string;            // what this reveals that needs further exploration
  openness: number;             // 0-1, how open is the agent to going deeper?
  chainId: string;              // which chain this belongs to
  participants?: string[];      // who was present when this revelation occurred
}

// ──────────────────────────────────────────────
// Groupthink Assessment
// ──────────────────────────────────────────────

export type GroupthinkQuality = "productive" | "destructive" | "neutral";

export interface GroupthinkAssessment {
  quality: GroupthinkQuality;
  score: number;                // -1 (destructive) to +1 (productive)
  convergenceSpeed: number;     // 0-1, fast convergence is suspicious
  vocabularyDiversity: number;  // 0-1, dropping = conformity
  disagreementFrequency: number;// 0-1, zero = unhealthy
  novelIdeaRate: number;        // 0-1, zero = stagnation
  crossPollinationRate: number; // 0-1, ideas crossing domains
  recommendation?: string;      // what to do about it
  timestamp: string;
}

// ──────────────────────────────────────────────
// Phase Transitions
// ──────────────────────────────────────────────

export interface PhaseTransition {
  id: string;
  timestamp: string;
  fromPhase: string;
  toPhase: string;
  trigger: string;
  participants: string[];
  description: string;
  intensity: number;            // 0-1
}
