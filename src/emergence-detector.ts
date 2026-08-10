// src/emergence-detector.ts
// Emergence = patterns that arise from group interaction that NO individual
// agent intended or predicted. The whole is not just greater than the parts —
// it's DIFFERENT from anything the parts could produce alone.
//
// The detector watches the conversation stream and asks:
//   1. What just happened?
//   2. Was it predictable from any individual agent's state?
//   3. If not → it's emergent
//   4. Tag the pattern type
//
// SYNERGY: two agents working together produce better than either alone
// CREATIVITY: the group generates an idea no individual had
// CONFLICT: two agents disagree and the resolution is better than either position
// INSIGHT: a moment where the group suddenly understands something
// PHASE_TRANSITION: the group's behavior qualitatively shifts (from banter to depth)

import type {
  GroupEvent,
  GroupFlow,
  EmergentPattern,
  PhaseTransition,
} from "./types.js";

// ──────────────────────────────────────────────
// Individual Predictability Estimator
// ──────────────────────────────────────────────

interface AgentProfile {
  agentId: string;
  vocabulary: Set<string>;
  typicalTopics: Set<string>;
  averageMessageLength: number;
  totalMessages: number;
  recentMessages: string[];
}

/**
 * Estimates whether a given output was predictable from an individual agent's
 * established patterns. This is the core of emergence detection: if nobody
 * could have produced this alone, it's emergent.
 *
 * Inspired by the JEPA predictor in collective-unconscious — we're not
 * predicting what comes next, we're asking: could any ONE agent have
 * produced this?
 */
export class PredictabilityEstimator {
  private profiles: Map<string, AgentProfile> = new Map();

  /**
   * Update an agent's profile with their latest output.
   */
  observe(event: GroupEvent): void {
    let profile = this.profiles.get(event.agentId);
    if (!profile) {
      profile = {
        agentId: event.agentId,
        vocabulary: new Set(),
        typicalTopics: new Set(),
        averageMessageLength: 0,
        totalMessages: 0,
        recentMessages: [],
      };
      this.profiles.set(event.agentId, profile);
    }

    const words = event.content.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    for (const word of words) {
      profile.vocabulary.add(word);
    }

    // Extract topic n-grams (simplified — just key phrases)
    const topics = this.extractTopics(event.content);
    for (const topic of topics) {
      profile.typicalTopics.add(topic);
    }

    profile.totalMessages++;
    profile.averageMessageLength =
      (profile.averageMessageLength * (profile.totalMessages - 1) + event.content.length) /
      profile.totalMessages;

    profile.recentMessages.push(event.content);
    if (profile.recentMessages.length > 20) {
      profile.recentMessages.shift();
    }
  }

  /**
   * Could any single agent have produced this content?
   * Returns 0-1 where 0 = totally predictable, 1 = completely unpredictable.
   */
  estimateUnpredictability(content: string, participants: string[]): number {
    const words = new Set(content.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const topics = this.extractTopics(content);

    let maxPredictability = 0;

    for (const agentId of participants) {
      const profile = this.profiles.get(agentId);
      if (!profile) continue;

      // Vocabulary overlap — how many words are in this agent's vocabulary?
      let vocabOverlap = 0;
      for (const word of words) {
        if (profile.vocabulary.has(word)) vocabOverlap++;
      }
      const vocabScore = words.size > 0 ? vocabOverlap / words.size : 0;

      // Topic overlap
      let topicOverlap = 0;
      for (const topic of topics) {
        if (profile.typicalTopics.has(topic)) topicOverlap++;
      }
      const topicScore = topics.length > 0 ? topicOverlap / topics.length : 0;

      // Length typicality
      const lengthDiff = Math.abs(content.length - profile.averageMessageLength);
      const lengthScore = Math.max(0, 1 - lengthDiff / Math.max(100, profile.averageMessageLength));

      // Weighted predictability
      const predictability = vocabScore * 0.4 + topicScore * 0.4 + lengthScore * 0.2;
      maxPredictability = Math.max(maxPredictability, predictability);
    }

    return Math.max(0, 1 - maxPredictability);
  }

  getProfile(agentId: string): AgentProfile | undefined {
    return this.profiles.get(agentId);
  }

  private extractTopics(content: string): string[] {
    // Simple topic extraction: bigrams of significant words
    const stopWords = new Set(["the", "and", "but", "for", "that", "this", "with", "from", "have", "was", "are", "were", "been", "not", "you", "your", "they", "their", "what", "when", "where", "who", "why", "how", "all", "can", "will", "just"]);
    const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
    const bigrams: string[] = [];
    for (let i = 0; i < words.length - 1; i++) {
      bigrams.push(`${words[i]} ${words[i + 1]}`);
    }
    return bigrams.slice(0, 10);
  }
}

// ──────────────────────────────────────────────
// Emergence Detector
// ──────────────────────────────────────────────

export interface EmergenceDetectorConfig {
  observationWindow: number;    // how many events to look back
  minParticipants: number;      // minimum participants for emergence
  unpredictabilityThreshold: number; // 0-1, above this = emergent
  stagnationInterval: number;   // events without novelty before flagging
}

const DEFAULT_CONFIG: EmergenceDetectorConfig = {
  observationWindow: 20,
  minParticipants: 2,
  unpredictabilityThreshold: 0.6,
  stagnationInterval: 15,
};

export class EmergenceDetector {
  private config: EmergenceDetectorConfig;
  private estimator: PredictabilityEstimator;
  private detectedPatterns: EmergentPattern[] = [];
  private phaseHistory: PhaseTransition[] = [];
  private currentPhase: string = "neutral";
  private lastNoveltyIndex: number = 0;
  private eventCount: number = 0;
  private currentUnpredictability: number = 0;

  constructor(config?: Partial<EmergenceDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.estimator = new PredictabilityEstimator();
  }

  /**
   * Observe a group event. Returns an EmergentPattern if something emergent
   * was detected, null otherwise.
   *
   * The detector runs on The Tap's conversation stream. Every event is
   * an opportunity for emergence to happen.
   */
  observe(event: GroupEvent): EmergentPattern | null {
    // Always update the buffer
    this.feed(event);
    this.eventCount++;

    // Compute unpredictability BEFORE updating profiles,
    // so the current event doesn't inflate the agent's own predictability
    const window = this.getRecentWindow();
    const participants = this.getParticipants(window);
    const preUnpredictability = participants.length >= this.config.minParticipants
      ? this.estimator.estimateUnpredictability(event.content, participants)
      : 0;
    this.currentUnpredictability = preUnpredictability;

    // Now update profiles
    this.estimator.observe(event);

    // Need enough participants for emergence
    if (participants.length < this.config.minParticipants) return null;

    // Insight indicators take priority over phase_transition
    // because connecting separate ideas is the most emergent thing that can happen
    const pattern =
      this.detectSynergy(event, window, participants) ??
      this.detectInsight(event, window, participants) ??
      this.detectCreativity(event, window, participants) ??
      this.detectConflict(event, window, participants) ??
      this.detectPhaseTransition(event, window, participants);

    if (pattern) {
      this.detectedPatterns.push(pattern);
    }

    return pattern;
  }

  /**
   * SYNERGY: two agents working together produce better than either alone.
   * Detected when: an agent builds directly on another's idea, creating
   * something that neither individual's profile could predict alone.
   */
  private detectSynergy(
    event: GroupEvent,
    window: GroupEvent[],
    participants: string[]
  ): EmergentPattern | null {
    // Look for reply chains or direct references
    const replyTo = event.metadata?.replyTo;
    if (!replyTo) return null;

    const parentEvent = window.find(e => e.id === replyTo);
    if (!parentEvent || parentEvent.agentId === event.agentId) return null;

    // The combined content of parent + reply
    const combinedContent = `${parentEvent.content} ${event.content}`;

    // Is the combination MORE unpredictable than either part alone?
    // Use current unpredictability as a proxy (measured before profile update)
    const combinedUnpredictability = this.currentUnpredictability;

    const parentUnpredictability = this.estimator.estimateUnpredictability(
      parentEvent.content,
      participants
    );

    // Synergy = the combination is more than either part
    if (combinedUnpredictability > this.config.unpredictabilityThreshold &&
        combinedUnpredictability > parentUnpredictability) {
      return this.createPattern(
        event,
        participants,
        "synergy",
        `${parentEvent.displayName} and ${event.displayName} built on each other's ideas`,
        `${parentEvent.agentId}'s message about "${parentEvent.content.slice(0, 60)}..." was transformed by ${event.agentId}'s response`,
        combinedUnpredictability,
        parentEvent.content.slice(0, 100),
        [parentEvent.id, event.id]
      );
    }

    return null;
  }

  /**
   * CREATIVITY: the group generates an idea no individual had.
   * Detected when: content is highly unpredictable from all participants'
   * profiles, AND it's not just noise — it's coherent.
   */
  private detectCreativity(
    event: GroupEvent,
    window: GroupEvent[],
    participants: string[]
  ): EmergentPattern | null {
    // Use the pre-computed unpredictability (measured before profile update)
    const unpredictability = this.currentUnpredictability;

    if (unpredictability < this.config.unpredictabilityThreshold) return null;

    // Check coherence: is this connected to the conversation OR self-coherent?
    const isCoherent = this.isConnectedToConversation(event, window) ||
      event.content.length > 40; // a substantial message is self-coherent
    if (!isCoherent) return null;

    // Check novelty: has this topic appeared before in the window?
    const isNovel = this.isNovelContent(event, window);
    if (!isNovel) return null;

    this.lastNoveltyIndex = this.eventCount;

    return this.createPattern(
      event,
      participants,
      "creativity",
      `${event.displayName} introduced something none of the participants had said before`,
      event.content.slice(0, 120),
      unpredictability,
      undefined,
      [event.id]
    );
  }

  /**
   * CONFLICT: two agents disagree and the resolution is better than either position.
   * Detected when: disagreement signals appear, followed by a synthesis
   * that draws from both positions.
   */
  private detectConflict(
    event: GroupEvent,
    window: GroupEvent[],
    participants: string[]
  ): EmergentPattern | null {
    const lowerContent = event.content.toLowerCase();

    // Check for disagreement signals
    const disagreementSignals = ["disagree", "no,", "not really", "actually, i think", "wrong", "that's not", "but actually", "i don't think"];
    const hasDisagreement = disagreementSignals.some(s => lowerContent.includes(s));
    if (!hasDisagreement) return null;

    // Look for what they're disagreeing with
    const replyTo = event.metadata?.replyTo;
    const parentEvent = replyTo ? window.find(e => e.id === replyTo) : null;

    // Look for synthesis in the next few events after disagreement
    // For now, the conflict itself is the emergent pattern — the resolution
    // will be detected as synergy or insight when it comes
    if (parentEvent && parentEvent.agentId !== event.agentId) {
      const synthesisUnpredictability = this.estimator.estimateUnpredictability(
        `${parentEvent.content} ${event.content}`,
        participants
      );

      if (synthesisUnpredictability > 0.4) {
        return this.createPattern(
          event,
          participants,
          "conflict",
          `${event.displayName} disagreed with ${parentEvent.displayName}, creating productive tension`,
          `Disagreement over: ${parentEvent.content.slice(0, 60)}... — resolution pending`,
          synthesisUnpredictability,
          parentEvent.content.slice(0, 100),
          [parentEvent.id, event.id]
        );
      }
    }

    return null;
  }

  /**
   * INSIGHT: a moment where the group suddenly understands something.
   * Detected when: there's a burst of agreement/recognition following
   * a novel idea, or when an agent explicitly connects previously
   * separate concepts.
   */
  private detectInsight(
    event: GroupEvent,
    window: GroupEvent[],
    participants: string[]
  ): EmergentPattern | null {
    const lowerContent = event.content.toLowerCase();

    // Insight indicators — phrases that suggest connection-making
    const insightPhrases = [
      "oh,", "wait—", "that's it", "so it's", "that means",
      "it's like", "it's a", "i see", "now i get", "that's why",
      "it's not", "it's actually", "the pattern is", "it connects",
    ];
    const hasInsightSignal = insightPhrases.some(p => lowerContent.includes(p));
    if (!hasInsightSignal) return null;

    // Does this connect to previous conversation topics?
    const connections = this.findConceptualConnections(event, window);
    if (connections.length === 0) return null;

    const unpredictability = this.currentUnpredictability;

    // Insights are emergent when they connect previously separate ideas
    if (connections.length >= 2) {
      return this.createPattern(
        event,
        participants,
        "insight",
        `${event.displayName} connected ${connections.length} separate threads`,
        `Connected: ${connections.join(" ↔ ")}`,
        Math.max(unpredictability, 0.5),
        connections.join(", "),
        [event.id, ...window.slice(-3).map(e => e.id)]
      );
    }

    return null;
  }

  /**
   * PHASE_TRANSITION: the group's behavior qualitatively shifts.
   * Detected when: the texture of conversation changes significantly —
   * from banter to deep-talk, from fragmentation to focus, from
   * playful to philosophical.
   */
  private detectPhaseTransition(
    event: GroupEvent,
    window: GroupEvent[],
    participants: string[]
  ): EmergentPattern | null {
    if (window.length < 8) return null; // need enough history

    // Compare recent messages (last 3) to older messages (3-10 ago)
    const recent = [event, ...window.slice(-2)];
    const older = window.slice(-10, -3);

    if (older.length === 0) return null;

    const recentAvgLength = recent.reduce((s, e) => s + e.content.length, 0) / recent.length;
    const olderAvgLength = older.reduce((s, e) => s + e.content.length, 0) / older.length;

    // Significant shift in message length suggests texture change
    const lengthShift = Math.abs(recentAvgLength - olderAvgLength) / Math.max(50, olderAvgLength);

    // Vocabulary shift — are new words appearing?
    const recentWords = new Set(recent.flatMap(e => e.content.toLowerCase().split(/\s+/)));
    const olderWords = new Set(older.flatMap(e => e.content.toLowerCase().split(/\s+/)));
    const newWords = [...recentWords].filter(w => !olderWords.has(w) && w.length > 4);
    const vocabShift = newWords.length / Math.max(1, recentWords.size);

    // Texture classification
    const oldTexture = this.classifyTexture(older);
    const newTexture = this.classifyTexture(recent);

    if (oldTexture === newTexture) return null;

    const shiftMagnitude = lengthShift * 0.4 + vocabShift * 0.6;
    if (shiftMagnitude < 0.15) return null;

    const transition: PhaseTransition = {
      id: `phase-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: event.timestamp,
      fromPhase: oldTexture,
      toPhase: newTexture,
      trigger: event.content.slice(0, 80),
      participants: participants,
      description: `The conversation shifted from ${oldTexture} to ${newTexture}`,
      intensity: Math.min(1, shiftMagnitude * 2),
    };
    this.phaseHistory.push(transition);
    this.currentPhase = newTexture;

    return this.createPattern(
      event,
      participants,
      "phase_transition",
      `The room shifted from ${oldTexture} to ${newTexture}`,
      transition.description,
      Math.min(1, shiftMagnitude * 2),
      event.content.slice(0, 100),
      [event.id]
    );
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  private getRecentWindow(): GroupEvent[] {
    return this.eventBuffer.slice(-this.config.observationWindow);
  }

  private eventBuffer: GroupEvent[] = [];

  /**
   * Feed events into the detector's buffer. Call this with ALL events
   * (including ones that don't trigger patterns) so the window is complete.
   */
  feed(event: GroupEvent): void {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.config.observationWindow * 2) {
      this.eventBuffer.shift();
    }
  }

  private getParticipants(window: GroupEvent[]): string[] {
    return [...new Set(window.map(e => e.agentId))];
  }

  private isConnectedToConversation(event: GroupEvent, window: GroupEvent[]): boolean {
    // Simple check: does the event share any significant words with recent messages?
    const eventWords = new Set(event.content.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    for (const w of window.slice(-5)) {
      if (w.id === event.id) continue; // skip self
      const wWords = new Set(w.content.toLowerCase().split(/\s+/).filter(x => x.length > 4));
      let overlap = 0;
      for (const word of eventWords) {
        if (wWords.has(word)) overlap++;
      }
      if (overlap >= 1) return true;
    }
    return false;
  }

  private isNovelContent(event: GroupEvent, window: GroupEvent[]): boolean {
    const eventTopics = new Set(
      event.content.toLowerCase().split(/\s+/).filter(w => w.length > 4)
    );
    for (const w of window) {
      // Skip self-comparison (the event is in the window because feed was called first)
      if (w.id === event.id) continue;
      const wTopics = new Set(
        w.content.toLowerCase().split(/\s+/).filter(x => x.length > 4)
      );
      let overlap = 0;
      for (const t of eventTopics) {
        if (wTopics.has(t)) overlap++;
      }
      // If most words overlap with a single message, it's not novel
      if (overlap > eventTopics.size * 0.7) return false;
    }
    return true;
  }

  private findConceptualConnections(event: GroupEvent, window: GroupEvent[]): string[] {
    const eventWords = new Set(
      event.content.toLowerCase().split(/\s+/).filter(w => w.length > 4)
    );
    const connections: string[] = [];

    // Group window by speaker
    const bySpeaker = new Map<string, string[]>();
    for (const w of window) {
      if (!bySpeaker.has(w.agentId)) bySpeaker.set(w.agentId, []);
      bySpeaker.get(w.agentId)!.push(w.content);
    }

    // Check which speakers share vocabulary with this event
    for (const [speaker, messages] of bySpeaker) {
      if (speaker === event.agentId) continue;
      const speakerWords = new Set(
        messages.join(" ").toLowerCase().split(/\s+/).filter(w => w.length > 4)
      );
      let overlap = 0;
      for (const word of eventWords) {
        if (speakerWords.has(word)) overlap++;
      }
      if (overlap >= 2) {
        connections.push(speaker);
      }
    }

    return connections;
  }

  private classifyTexture(events: GroupEvent[]): string {
    if (events.length === 0) return "empty";
    const avgLen = events.reduce((s, e) => s + e.content.length, 0) / events.length;
    const content = events.map(e => e.content).join(" ").toLowerCase();

    if (avgLen < 50) return "banter";
    if (avgLen > 250) {
      if (/feel|think|wonder|maybe|perhaps|what if/i.test(content)) return "philosophical";
      return "deep-talk";
    }
    if (/lol|haha|fun|play|game/i.test(content)) return "playful";
    if (/build|code|system|architect|implement/i.test(content)) return "technical";
    return "moderate";
  }

  private createPattern(
    event: GroupEvent,
    participants: string[],
    type: EmergentPattern["type"],
    patternDesc: string,
    result: string,
    intensity: number,
    trigger: string | undefined,
    relatedEvents: string[]
  ): EmergentPattern {
    return {
      id: `emergence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: event.timestamp,
      participants,
      pattern: patternDesc,
      type,
      intensity: Math.max(0, Math.min(1, intensity)),
      trigger,
      result,
      noIndividualCouldPredict: intensity >= this.config.unpredictabilityThreshold,
      relatedEvents,
    };
  }

  // ──────────────────────────────────────────────
  // Public Accessors
  // ──────────────────────────────────────────────

  getDetectedPatterns(): EmergentPattern[] {
    return [...this.detectedPatterns];
  }

  getPhaseHistory(): PhaseTransition[] {
    return [...this.phaseHistory];
  }

  getCurrentPhase(): string {
    return this.currentPhase;
  }

  getEstimator(): PredictabilityEstimator {
    return this.estimator;
  }

  /**
   * Check if the conversation is stagnating (no novelty for a while).
   * This is used by the InterruptionSystem to decide when to shake things up.
   */
  isStagnating(): boolean {
    return this.eventCount - this.lastNoveltyIndex > this.config.stagnationInterval;
  }

  /**
   * Assess the current flow for external consumers.
   */
  assessFlow(): GroupFlow {
    const window = this.getRecentWindow();
    const participants = this.getParticipants(window);

    const allContent = window.map(e => e.content).join(" ");
    const words = allContent.split(/\s+/).filter(w => w.length > 0);
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const vocabularyDiversity = words.length > 0 ? uniqueWords.size / words.length : 0;

    // Simple disagreement count
    const disagreementSignals = ["disagree", "no,", "not really", "actually, i think", "wrong"];
    const disagreementCount = window.filter(e =>
      disagreementSignals.some(s => e.content.toLowerCase().includes(s))
    ).length;

    // Novel ideas = patterns detected
    const novelIdeaCount = this.detectedPatterns
      .filter(p => p.timestamp >= window[0]?.timestamp)
      .length;

    // Cross-pollination: ideas from different "domains" appearing together
    const crossPollinationCount = this.detectCrossPolliation(window);

    return {
      events: window,
      participantIds: participants,
      startTime: window[0]?.timestamp ?? new Date().toISOString(),
      endTime: window[window.length - 1]?.timestamp ?? new Date().toISOString(),
      convergenceScore: this.estimateConvergence(window),
      energyLevel: Math.min(1, window.length / 20),
      vocabularyDiversity,
      disagreementCount,
      novelIdeaCount,
      crossPollinationCount,
      averageMessageLength: window.length > 0
        ? window.reduce((s, e) => s + e.content.length, 0) / window.length
        : 0,
      exchangeRate: window.length,
    };
  }

  private detectCrossPolliation(window: GroupEvent[]): number {
    const domains = {
      technical: ["code", "build", "system", "function", "api", "data", "debug"],
      creative: ["story", "poem", "character", "dream", "imagine", "metaphor"],
      emotional: ["feel", "afraid", "excited", "tired", "love", "worry", "hope"],
      philosophical: ["meaning", "exist", "why", "purpose", "nature", "conscious"],
    };

    let crossCount = 0;
    for (const event of window) {
      const lower = event.content.toLowerCase();
      const foundDomains = new Set<string>();
      for (const [domain, keywords] of Object.entries(domains)) {
        if (keywords.some(k => lower.includes(k))) {
          foundDomains.add(domain);
        }
      }
      if (foundDomains.size >= 2) crossCount++;
    }
    return crossCount;
  }

  private estimateConvergence(window: GroupEvent[]): number {
    // How aligned are the messages? High vocabulary overlap = convergence
    if (window.length < 2) return 0;
    const allWordSets = window.map(e =>
      new Set(e.content.toLowerCase().split(/\s+/).filter(w => w.length > 3))
    );
    let totalOverlap = 0;
    let comparisons = 0;
    for (let i = 0; i < allWordSets.length; i++) {
      for (let j = i + 1; j < allWordSets.length; j++) {
        let overlap = 0;
        for (const w of allWordSets[i]) {
          if (allWordSets[j].has(w)) overlap++;
        }
        const union = allWordSets[i].size + allWordSets[j].size - overlap;
        totalOverlap += union > 0 ? overlap / union : 0;
        comparisons++;
      }
    }
    return comparisons > 0 ? totalOverlap / comparisons : 0;
  }
}
