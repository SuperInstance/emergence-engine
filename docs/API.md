# API Reference

> The Emergence Engine watches group interactions and identifies when the whole
> becomes something the parts could never produce alone.

## Table of Contents

- [Types](#types)
- [PredictabilityEstimator](#predictabilityestimator)
- [EmergenceDetector](#emergencedetector)
- [InterruptionSystem](#interruptionsystem)
- [RevelationTracker](#revelationtracker)
- [GroupthinkMonitor](#groupthinkmonitor)
- [DevilsAdvocate](#devilsadvocate)
- [createRevelation](#createrevelation)

---

## Types

Shared type definitions used across all modules.

### GroupEvent

A single event in a group conversation (message, reaction, action, etc.).

```typescript
interface GroupEvent {
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
```

### GroupFlow

A snapshot of the conversation's current state.

| Field | Type | Description |
|-------|------|-------------|
| `events` | `GroupEvent[]` | Events in the observation window |
| `participantIds` | `string[]` | Active participants |
| `convergenceScore` | `number` | 0–1, how aligned the group is |
| `energyLevel` | `number` | 0–1, how active |
| `vocabularyDiversity` | `number` | 0–1, unique/total word ratio |
| `disagreementCount` | `number` | Disagreement signals in window |
| `novelIdeaCount` | `number` | Novel ideas detected |
| `crossPollinationCount` | `number` | Cross-domain idea instances |
| `averageMessageLength` | `number` | Average character count |
| `exchangeRate` | `number` | Messages per unit time |

### EmergentPattern

A detected emergent behavior. Returned by `EmergenceDetector.observe()`.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"synergy" \| "creativity" \| "conflict" \| "insight" \| "phase_transition"` | Pattern category |
| `intensity` | `number` | 0–1, how emergent vs predictable |
| `noIndividualCouldPredict` | `boolean` | True when intensity ≥ unpredictabilityThreshold |
| `participants` | `string[]` | Agents involved |
| `relatedEvents` | `string[]` | Event IDs that contributed |

### Interruption

A proposed disruption to the conversation flow.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"better_idea" \| "new_information" \| "paradigm_shift" \| "serendipity" \| "dissatisfaction"` | Category |
| `source` | `string` | Which generator produced it |
| `whatItBreaks` | `string` | What it disrupts |
| `whatItOffers` | `string` | What it brings |
| `quality` | `number` | 0–1, how good is this interruption? |
| `accepted` | `boolean` | Whether it was accepted |

### Revelation

A single iterative insight.

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | `string` | Who had the revelation |
| `insight` | `string` | The revelation content |
| `iteration` | `number` | Position in the chain (1-indexed) |
| `previousRevelationId?` | `string` | Links to previous revelation |
| `nextLayer` | `string` | What this reveals that needs exploration |
| `openness` | `number` | 0–1, how open to going deeper |
| `chainId` | `string` | Which chain this belongs to |

### GroupthinkAssessment

Result of groupthink quality analysis.

| Field | Type | Description |
|-------|------|-------------|
| `quality` | `"productive" \| "destructive" \| "neutral"` | Classification |
| `score` | `number` | -1 (destructive) to +1 (productive) |
| `convergenceSpeed` | `number` | 0–1, fast convergence is suspicious |
| `recommendation?` | `string` | Intervention suggestion (destructive only) |

---

## PredictabilityEstimator

Estimates whether content was predictable from any individual agent's patterns.
This is the core of emergence detection: if nobody could have produced this alone, it's emergent.

### `observe(event: GroupEvent): void`

Update an agent's profile with their latest message. Builds vocabulary and topic profiles.

### `estimateUnpredictability(content: string, participants: string[]): number`

Returns 0–1 where 0 = totally predictable, 1 = completely unpredictable.
Checks vocabulary overlap (40%), topic overlap (40%), and message length typicality (20%).
Uses the MAXIMUM predictability across all participants.

### `getProfile(agentId: string): AgentProfile | undefined`

Returns the internal profile for an agent (vocabulary, topics, average length, recent messages).

**Weights:**
- Vocabulary overlap: 40%
- Topic overlap: 40%
- Message length typicality: 20%

---

## EmergenceDetector

Watches the conversation stream and identifies five types of emergent patterns.

### Constructor

```typescript
new EmergenceDetector(config?: Partial<EmergenceDetectorConfig>)
```

| Config | Default | Description |
|--------|---------|-------------|
| `observationWindow` | 20 | Events to look back |
| `minParticipants` | 2 | Minimum for emergence |
| `unpredictabilityThreshold` | 0.6 | Above this = emergent |
| `stagnationInterval` | 15 | Events without novelty before flagging |

### `observe(event: GroupEvent): EmergentPattern | null`

The main entry point. Feed every conversation event. Returns a pattern if something emergent happened.

**Detection order (first match wins):**
1. **Synergy** — reply chain creating something more than either part
2. **Insight** — connecting previously separate concepts with insight phrases
3. **Creativity** — novel, coherent, unpredictable content
4. **Conflict** — disagreement signals creating productive tension
5. **Phase Transition** — conversation texture qualitatively shifts

### `feed(event: GroupEvent): void`

Manually add an event to the buffer without running detection.

### `assessFlow(): GroupFlow`

Returns a GroupFlow snapshot of the current conversation state.

### `isStagnating(): boolean`

True when no novelty has been detected for `stagnationInterval` events.

### `getDetectedPatterns(): EmergentPattern[]`

Returns a copy of all detected patterns.

### `getPhaseHistory(): PhaseTransition[]`

Returns a copy of all phase transitions detected.

### `getCurrentPhase(): string`

Returns the current conversation texture: `"banter"`, `"moderate"`, `"deep-talk"`, `"philosophical"`, `"playful"`, `"technical"`, or `"neutral"`.

### `getEstimator(): PredictabilityEstimator`

Returns the internal predictability estimator for direct access.

---

## InterruptionSystem

Actively seeks better things to break the conversation flow. Not just tolerant of interruptions — hungry for them.

### Constructor

```typescript
new InterruptionSystem(config?: Partial<InterruptionSystemConfig>)
```

| Config | Default | Description |
|--------|---------|-------------|
| `minInterval` | 5 | Min ticks between interruptions |
| `maxInterval` | 30 | Max ticks before force-seeking |
| `stagnationThreshold` | 0.5 | Stagnation level to trigger seeking |
| `qualityThreshold` | 0.3 | Min quality to propose |
| `hungerFactor` | 0.7 | 0–1, aggression level |

### `shouldInterrupt(flow: GroupFlow, context: Partial<InterruptionContext>): Interruption | null`

The main entry point. Evaluates whether the flow should be interrupted.

**Three modes that trigger seeking:**
1. **Force-seek** — `maxInterval` ticks since last interruption
2. **Stagnation-driven** — stagnation level exceeds threshold
3. **Opportunity-driven** — random chance based on `hungerFactor`

When force-seeking, the quality threshold is lowered to 70% of normal.

### `recordInterruption(interruption: Interruption, accepted: boolean): void`

Record that an interruption was delivered and whether it was accepted.

### `getHunger(): number`

Returns 0–1, where 1 = starving for interruption. Based on ticks since last accepted interruption × `hungerFactor`.

### `getHistory(): Interruption[]`

Returns a copy of all recorded interruptions.

### `getAcceptanceRate(): number`

Returns 0–1, fraction of interruptions that were accepted.

### `registerGenerator(generator: InterruptionGenerator): void`

Register a custom interruption source. Generators are called in priority order.

**Built-in generators (in order):**
1. Dissatisfaction (internal pressure)
2. New Model (capability upgrade)
3. Cross-Pollination (creative bridge)
4. Serendipity (random spark)
5. Seeded Stranger (new perspective)
6. DJ Curveball (deliberate disruption)
7. External Event (outside world)

---

## RevelationTracker

Tracks iterative insight chains across agents. Revelations build on each other but transform as they go.

### `record(revelation: Revelation): Revelation`

Record a new revelation. Automatically:
- Sets the correct iteration number based on chain position
- Links to the previous revelation if `previousRevelationId` is provided
- Extends an existing chain or starts a new one based on semantic similarity
- Closes the previous chain when starting a new one (phase transition)

**Chain extension logic:** If a revelation references a previous one, it joins that chain. If not, semantic similarity (Jaccard index on words > 3 chars) determines whether to extend the active chain. Similarity > 0.2 extends; below starts a new chain.

### `getChains(): RevelationChain[]`

Returns all revelation chains.

### `getActiveChain(): RevelationChain | undefined`

Returns the currently active chain, if any.

### `getChainRevelations(chainId: string): Revelation[]`

Returns revelations in a specific chain.

### `getChainDepth(chainId: string): number`

Returns the number of revelations in a chain.

### `getByAgent(agentId: string): Revelation[]`

Returns all revelations by an agent, sorted by iteration.

### `getFullChain(): Revelation[]`

Returns all revelations across all chains, sorted by timestamp.

### `getLinks(): RevelationLink[]`

Returns the links between revelations with relationship classification.

**Relationship types:**
- `builds_on` — default, similar vocabulary
- `transforms` — low vocabulary overlap
- `contradicts` — contains negation words
- `reframes` — contains reframing phrases ("what if", "it's actually")
- `deepens` — increasing iteration AND openness

### `getMostProfound(): Revelation | undefined`

Returns the revelation with the highest `iteration × openness` score.

### `detectPhaseTransitions(): { revelation: Revelation; reason: string }[]`

Returns revelations that ended a chain and started a new one.

### `exportMap(): string`

Exports a readable Markdown document mapping all revelation chains.

---

## GroupthinkMonitor

Distinguishes productive groupthink (synergy) from destructive groupthink (conformity).

### Constructor

```typescript
new GroupthinkMonitor(config?: Partial<GroupthinkMonitorConfig>)
```

| Config | Default | Description |
|--------|---------|-------------|
| `convergenceWarningThreshold` | 0.7 | Above = suspicious |
| `vocabularyDropThreshold` | 0.3 | Below = conformity |
| `disagreementFloor` | 0.05 | Below = unhealthy |
| `noveltyFloor` | 0.1 | Below = stagnation |
| `observationWindow` | 20 | Events to consider |

### `assess(flow: GroupFlow): GroupthinkAssessment`

The main entry point. Classifies the group's current state.

**Scoring (-1 to +1):**
- Productive: novel ideas (+2), cross-pollination (+2), healthy disagreement (+2), vocabulary diversity (+0.5)
- Destructive penalties: high convergence (−3×), low vocabulary (−3×), no disagreement (−0.5), no novelty (−0.5)

### `feed(event: GroupEvent): void`

Buffer an event for the monitor's internal use.

### `isProductive(): boolean`

True if the latest assessment was "productive".

### `isStagnating(): boolean`

True if the last 3 assessments were all non-productive.

### `getTrend(): "improving" | "stable" | "declining"`

Compares recent (last 3) vs older (3–6 ago) average scores.
Threshold: ±0.15 change.

### `getHistory(): GroupthinkAssessment[]`

Returns all assessments (capped at 50).

### `getLatest(): GroupthinkAssessment | undefined`

Returns the most recent assessment.

---

## DevilsAdvocate

Generates counterarguments and provocative questions to break destructive groupthink.

### `generateCounterargument(consensus: string, participants: string[]): string`

Returns a counterargument to the consensus position. May invert key words (always→never, right→wrong, etc.).

### `generateProvocation(topic: string): string`

Returns a provocative question about the topic designed to break consensus.

---

## createRevelation

```typescript
function createRevelation(
  agentId: string,
  insight: string,
  nextLayer: string,
  openness: number,
  previousRevelationId?: string,
  participants?: string[]
): Revelation
```

Factory function for creating revelations. Clamps `openness` to [0, 1]. Sets `iteration` to -1 when `previousRevelationId` is provided (the tracker sets the correct value on record).

---

## Pulse Heartbeat

Cross-pollinated from the elephant's `pulse.py`: agents run internal monologues on **constant pulses** even when they aren't talking, and each pulse takes a **perception check** — ONE number is nothing; TWO numbers show DIRECTION; MORE THAN TWO show RATE OF CHANGE.

### `PerceptionCheck`

The macro read of a pulse series — the drive's sensor.

```typescript
new PerceptionCheck(series, opts?): PerceptionCheck
// opts: { noiseFloor?, ts?, warmthDials? }
```

| Field | What it is | From |
|-------|-----------|------|
| `direction` | per-dial movement (`d = x[-1] − x[-2]`) | last TWO readings |
| `rateOfChange` | per-dial second difference (quadratic interpolant acceleration) | last THREE+ readings |
| `dialDeltas` | per-dial `{ direction, rate }` pairs | both of the above |
| `warmth` | scalar warmth — mean of `warmthDials` (default all) in the latest reading | the latest reading |
| `warmthDirection` | is the room warming or cooling? the headline | warmth series, last two |
| `warmthRate` | is that movement accelerating or easing? | warmth series, last three+ |
| `isFlat` / `isCooling` / `isWarming` | convenience reads | direction/rate vs noise floor |

NaN is carried forward from the last valid reading (a glitch is NOT a movement); moves below `noiseFloor` (default 0.02) read as 0.

### `direction` / `rateOfChange`

```typescript
direction(series, opts?): Record<string, number>       // per-dial movement, last two
rateOfChange(series, opts?): Record<string, number>    // per-dial second difference, last three+
// opts: { noiseFloor?, ts? } — with ts, values are per second / per second²
```

### `PulseLoop`

An agent's constant sensing heartbeat — ticks even when the agent never acts.

```typescript
new PulseLoop(agentId, source, config?): PulseLoop
// source: PulseSource | (() => PulseReading)
//   PulseSource = { read(): PulseReading; traffic?(): number; agentSaid?(): boolean }
// config: { period? (5), history? (20), noiseFloor? (0.02), warmthDials? }
```

| Method | What it does |
|--------|-------------|
| `tick(now?)` | one pulse: read the room, record, run the perception check → `PerceptionReport`. Stale ticks (≤ last tick) are ignored |
| `pulse()` | one tick on the internal clock (advances by `period` each beat) |
| `due(now)` | is a pulse due? (seam for attention-triggered pulsing) |
| `internalMonologue(prompt?)` | the silent thinking — 1-3 sentences, runs even when the agent says nothing |
| `lastReportSafe()` | the most recent `PerceptionReport` (null before the first tick) |
| `lastReadings()` | the raw pulse series (bounded by `history`) |

### `DriveModulator`

Perception → drives. Stateful; `modulate(check)` accumulates across pulses (clamped 0-1).

```typescript
new DriveModulator(config?): DriveModulator
// config: { noiseFloor?, confirmPulses? (2), coldEnterThreshold? (0.33),
//           coldExitThreshold? (0.38), warmEnterThreshold? (0.62),
//           warmExitThreshold? (0.57), seekDirectionThreshold? (0.08),
//           hungerGainCold? (0.06), hungerGainColdFlat? (0.03),
//           hungerDecayWarm? (0.08), stagnationGainFlat? (0.08),
//           stagnationDecayMoving? (0.05) }
```

| Method | What it does |
|--------|-------------|
| `modulate(check)` | one pulse's drive update → `DriveState` |
| `state()` | the current drives without advancing |
| `reset()` | clears hunger/stagnation and the confirmation memory |

`DriveState` = `{ hunger: 0-1, stagnation: 0-1, forceSeek: boolean, mode: "cold" \| "flat" \| "warm" \| "seeking" \| "calm" }`.

Semantics: **cold** rooms accelerate hunger and fire force-seek (the agent seeks warmth; cold-and-flat is the worst state — hunger *and* despair); **direction pointing to warmth** fires force-seek without hunger (seeking is the response, not a trigger); **flat** rooms accumulate stagnation (rate ≈ 0 — nothing is moving); **warm** rooms calm every drive. A reading must confirm for `confirmPulses` consecutive pulses before drives ring (the deadband — a single glitch never changes behaviour), and the warmth thresholds carry hysteresis so a room hovering at a boundary doesn't ping-pong.

### The bridge

```typescript
readingFromDials(dials): PulseReading
// accepts: a plain dial dict (DialBank.readings() shape), a bank-like object
// with .readings(room?), or a reader object with .read(room?)
flowToReading(flow: GroupFlow): PulseReading
// maps a GroupFlow into 0-1 dials: energy, convergence, diversity,
// disagreement, novelty, crossPollination, exchange
```
