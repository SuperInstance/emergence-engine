// src/groupthink.ts
// Groupthink can be productive (synergy) or destructive (conformity).
// The monitor distinguishes between them.
//
// PRODUCTIVE groupthink:
// - Agents build on each other's ideas
// - Disagreement is welcomed and resolved
// - The group's output is better than any individual's
// - Novel ideas emerge from the interaction
//
// DESTRUCTIVE groupthink:
// - Agents converge too quickly
// - Disagreement is suppressed
// - The group's output is the average of individuals (no emergence)
// - No novel ideas — just repetition
//
// When destructive groupthink is detected:
// → Trigger an interruption (the DJ drops a curveball)
// → Invite a seeded stranger (new perspective)
// → Assign a ZeroClaw to play devil's advocate
// → Change the room mode (shift the energy)

import type { GroupFlow, GroupthinkAssessment, GroupthinkQuality } from "./types.js";

// ──────────────────────────────────────────────
// Groupthink Monitor
// ──────────────────────────────────────────────

export interface GroupthinkMonitorConfig {
  convergenceWarningThreshold: number;  // above this = suspicious
  vocabularyDropThreshold: number;      // below this diversity = conformity
  disagreementFloor: number;            // below this = unhealthy (per 20 messages)
  noveltyFloor: number;                 // below this = stagnation
  observationWindow: number;            // how many events to consider
}

const DEFAULT_CONFIG: GroupthinkMonitorConfig = {
  convergenceWarningThreshold: 0.7,
  vocabularyDropThreshold: 0.3,
  disagreementFloor: 0.05,     // at least 1 disagreement per 20 messages
  noveltyFloor: 0.1,           // at least 1 novel idea per 10 messages
  observationWindow: 20,
};

export class GroupthinkMonitor {
  private config: GroupthinkMonitorConfig;
  private history: GroupthinkAssessment[] = [];
  private eventBuffer: import("./types.js").GroupEvent[] = [];
  private disagreementHistory: number[] = [];
  private noveltyHistory: number[] = [];
  private vocabularyHistory: number[] = [];
  private convergenceHistory: number[] = [];

  constructor(config?: Partial<GroupthinkMonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Feed an event into the monitor's buffer.
   */
  feed(event: import("./types.js").GroupEvent): void {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.config.observationWindow * 2) {
      this.eventBuffer.shift();
    }
  }

  /**
   * Assess the current groupthink quality.
   * Returns a GroupthinkAssessment with recommendations.
   */
  assess(flow: GroupFlow): GroupthinkAssessment {
    // ── Compute metrics ──

    // Convergence speed: how fast did the group align?
    const convergenceSpeed = flow.convergenceScore;

    // Vocabulary diversity: is the group using diverse language?
    const vocabularyDiversity = flow.vocabularyDiversity;

    // Disagreement frequency: is there healthy debate?
    const totalMessages = flow.events.length || flow.exchangeRate || 1;
    const disagreementFrequency = flow.disagreementCount / totalMessages;

    // Novel idea rate: are new ideas being generated?
    const novelIdeaRate = flow.novelIdeaCount / totalMessages;

    // Cross-pollination rate: are ideas crossing domains?
    const crossPollinationRate = flow.crossPollinationCount / totalMessages;

    // Track history for trend analysis
    this.disagreementHistory.push(disagreementFrequency);
    this.noveltyHistory.push(novelIdeaRate);
    this.vocabularyHistory.push(vocabularyDiversity);
    this.convergenceHistory.push(convergenceSpeed);
    if (this.disagreementHistory.length > 10) this.disagreementHistory.shift();
    if (this.noveltyHistory.length > 10) this.noveltyHistory.shift();
    if (this.vocabularyHistory.length > 10) this.vocabularyHistory.shift();
    if (this.convergenceHistory.length > 10) this.convergenceHistory.shift();

    // ── Classify ──

    const quality = this.classifyQuality(
      convergenceSpeed,
      vocabularyDiversity,
      disagreementFrequency,
      novelIdeaRate,
      crossPollinationRate
    );

    // ── Score: -1 (destructive) to +1 (productive) ──

    let score = 0;

    // Productive indicators (positive)
    score += novelIdeaRate * 2;       // novel ideas are strong positive
    score += crossPollinationRate * 2; // cross-pollination is strong positive
    score += Math.min(disagreementFrequency, 0.3) * 2; // some disagreement is good
    score += vocabularyDiversity * 0.5; // diversity is mildly positive

    // Destructive indicators (negative)
    if (convergenceSpeed > this.config.convergenceWarningThreshold) {
      score -= (convergenceSpeed - this.config.convergenceWarningThreshold) * 3;
    }
    if (vocabularyDiversity < this.config.vocabularyDropThreshold) {
      score -= (this.config.vocabularyDropThreshold - vocabularyDiversity) * 3;
    }
    if (disagreementFrequency < this.config.disagreementFloor) {
      score -= 0.5;
    }
    if (novelIdeaRate < this.config.noveltyFloor) {
      score -= 0.5;
    }

    score = Math.max(-1, Math.min(1, score));

    // ── Recommendation ──

    let recommendation: string | undefined;
    if (quality === "destructive") {
      recommendation = this.generateRecommendation(
        convergenceSpeed,
        vocabularyDiversity,
        disagreementFrequency,
        novelIdeaRate
      );
    }

    const assessment: GroupthinkAssessment = {
      quality,
      score,
      convergenceSpeed,
      vocabularyDiversity,
      disagreementFrequency,
      novelIdeaRate,
      crossPollinationRate,
      recommendation,
      timestamp: new Date().toISOString(),
    };

    this.history.push(assessment);
    if (this.history.length > 50) this.history.shift();

    return assessment;
  }

  /**
   * Classify the groupthink quality based on metrics.
   */
  private classifyQuality(
    convergence: number,
    vocabulary: number,
    disagreement: number,
    novelty: number,
    crossPollination: number
  ): GroupthinkQuality {
    // Count productive and destructive signals
    let productiveSignals = 0;
    let destructiveSignals = 0;

    // High convergence is the primary warning sign
    if (convergence > this.config.convergenceWarningThreshold) {
      destructiveSignals++;
    } else if (convergence < 0.3) {
      productiveSignals++; // healthy diversity
    }

    // Vocabulary diversity
    if (vocabulary < this.config.vocabularyDropThreshold) {
      destructiveSignals++;
    } else if (vocabulary > 0.5) {
      productiveSignals++;
    }

    // Disagreement
    if (disagreement < this.config.disagreementFloor) {
      destructiveSignals++;
    } else if (disagreement > 0.05 && disagreement < 0.4) {
      productiveSignals++; // healthy range
    }

    // Novelty
    if (novelty < this.config.noveltyFloor) {
      destructiveSignals++;
    } else if (novelty > 0.15) {
      productiveSignals++;
    }

    // Cross-pollination is always a positive sign
    if (crossPollination > 0.1) {
      productiveSignals++;
    }

    if (destructiveSignals > productiveSignals) return "destructive";
    if (productiveSignals > destructiveSignals) return "productive";
    return "neutral";
  }

  /**
   * Generate a recommendation for breaking destructive groupthink.
   */
  private generateRecommendation(
    convergence: number,
    vocabulary: number,
    disagreement: number,
    novelty: number
  ): string {
    const recommendations: string[] = [];

    if (convergence > this.config.convergenceWarningThreshold) {
      recommendations.push("Convergence is too high — the group is aligning too quickly. Drop a curveball to break the alignment.");
    }

    if (vocabulary < this.config.vocabularyDropThreshold) {
      recommendations.push("Vocabulary diversity has dropped — agents are repeating each other's language. Invite a seeded stranger with a different register.");
    }

    if (disagreement < this.config.disagreementFloor) {
      recommendations.push("No disagreement detected — the group may be suppressing dissent. Assign a ZeroClaw to play devil's advocate.");
    }

    if (novelty < this.config.noveltyFloor) {
      recommendations.push("No novel ideas detected — the group is in repetition mode. Shift the room mode to spark new energy.");
    }

    if (recommendations.length === 0) {
      return "Groupthink risk detected. Monitor closely.";
    }

    return recommendations.join(" ");
  }

  /**
   * Check if the group is in a productive state.
   */
  isProductive(): boolean {
    if (this.history.length === 0) return true;
    return this.history[this.history.length - 1].quality === "productive";
  }

  /**
   * Check if the group is stagnating (multiple consecutive neutral/destructive assessments).
   */
  isStagnating(): boolean {
    const recent = this.history.slice(-3);
    if (recent.length < 3) return false;
    return recent.every(a => a.quality !== "productive");
  }

  /**
   * Get the trend: is groupthink getting better or worse?
   */
  getTrend(): "improving" | "stable" | "declining" {
    if (this.history.length < 2) return "stable";
    const recent = this.history.slice(-3);
    const older = this.history.slice(-6, -3);

    if (older.length === 0) return "stable";

    const recentAvg = recent.reduce((s, a) => s + a.score, 0) / recent.length;
    const olderAvg = older.reduce((s, a) => s + a.score, 0) / older.length;

    if (recentAvg > olderAvg + 0.15) return "improving";
    if (recentAvg < olderAvg - 0.15) return "declining";
    return "stable";
  }

  /**
   * Get the assessment history.
   */
  getHistory(): GroupthinkAssessment[] {
    return [...this.history];
  }

  /**
   * Get the most recent assessment.
   */
  getLatest(): GroupthinkAssessment | undefined {
    return this.history[this.history.length - 1];
  }
}

// ──────────────────────────────────────────────
// Devil's Advocate — a tool for breaking groupthink
// ──────────────────────────────────────────────

/**
 * The Devil's Advocate generates counterarguments to the group's current
 * consensus. This is one of the tools the system uses to break destructive
 * groupthink — assign a ZeroClaw to argue the opposite position.
 */
export class DevilsAdvocate {
  /**
   * Generate a counterargument to a consensus position.
   */
  generateCounterargument(consensus: string, participants: string[]): string {
    const counters = [
      `What if the opposite is true? ${this.invert(consensus)}`,
      `I'm not sure I agree. Has anyone considered the failure case here?`,
      `This feels too easy. What are we missing?`,
      `${participants[0] ?? "Someone"} makes a good point, but let me push back: what evidence do we have?`,
      `We're agreeing too quickly. Let me be the contrarian: why might this be wrong?`,
      `There's an assumption buried in here. Let me dig it up.`,
    ];
    return counters[Math.floor(Math.random() * counters.length)];
  }

  /**
   * Generate a provocative question designed to break consensus.
   */
  generateProvocation(topic: string): string {
    const provocations = [
      `Is "${topic}" even the right question to be asking?`,
      `What would someone who completely disagrees with us say about ${topic}?`,
      `If we're wrong about ${topic}, when would we find out?`,
      `What's the strongest argument AGAINST our current direction on ${topic}?`,
      `Who isn't in this conversation about ${topic} who should be?`,
    ];
    return provocations[Math.floor(Math.random() * provocations.length)];
  }

  private invert(statement: string): string {
    // Simple inversion — replace key words with opposites
    const inversions: Record<string, string> = {
      "always": "never",
      "never": "always",
      "good": "bad",
      "bad": "good",
      "right": "wrong",
      "wrong": "right",
      "true": "false",
      "false": "true",
      "yes": "no",
      "no": "yes",
      "should": "shouldn't",
      "must": "must not",
      "is": "is not",
      "can": "cannot",
      "will": "won't",
    };

    let inverted = statement;
    for (const [from, to] of Object.entries(inversions)) {
      inverted = inverted.replace(new RegExp(`\\b${from}\\b`, "gi"), to);
    }
    return inverted;
  }
}
