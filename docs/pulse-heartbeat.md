# The Pulse Heartbeat — the engine's agents think in pulses even when idle

*2026-08-17 · cross-pollinated from the elephant's `pulse.py` — the captain's
directive, mapped into the emergence-engine's drive model.*

---

## The captain's insight (the design core)

> Agents using internal monologues on constant pulses even if they aren't
> talking. These internal monologues take a Perception check as part of
> their looking around and thinking. They look at the table's conversation
> as a whole hand and see JEPA perceptions — like macro-economic currency
> exchange changes, where the number doesn't matter but TWO numbers show
> DIRECTION and MORE THAN TWO show RATE OF CHANGE.

The emergence-engine drove its agents by **hunger**, **force-seek**, and
**stagnation** — but those drives were timers and flags. The maturation:
the engine's agents get a **pulse heartbeat**. They run internal monologues
on constant pulses even when not acting, and each pulse's **perception
check** — the direction and rate of change of their environment — feeds the
drives.

- A starving agent isn't just hungry — it **perceives** its environment's
  movement and its hunger responds to the room.
- **Stagnation isn't a timer** — it's the perception that nothing is moving
  (rate ≈ 0).
- **Force-seek isn't a flag** — it's a room that reads cold and the agent
  seeking warmth.

The silence is not empty. The silence is full of macro reads.

---

## What this module is

`src/pulseHeartbeat.ts` gives the engine three things:

| Piece | What it is | The elephant's name |
|-------|-----------|---------------------|
| `PerceptionCheck` | The macro read of a pulse series — direction from the last TWO readings, rate of change from the last THREE+, per-dial deltas, scalar warmth | `PerceptionReport` / `perception_check()` |
| `PulseLoop` | An agent's constant sensing heartbeat — ticks on an interval even when the agent never acts; the internal monologue runs in the silence | `PulseLoop` |
| `DriveModulator` | Perception → drives — cold rooms accelerate hunger and force warmth-seeking; flat rooms drive stagnation; warm rooms calm every drive | *(new — the elephant has no drives; this is the mapping)* |

Plus the bridge: **`readingFromDials(dials)`** accepts the elephant's
readings (a `DialBank.readings()` dict, or any bank-like object) directly
as pulse input — and **`flowToReading(flow)`** maps the engine's own
`GroupFlow` snapshots into 0-1 pulse dials.

---

## The perception check — the drive's sensor

`PerceptionCheck` is the agent's looking-around. From a series of pulse
readings it computes the macro read, the way a trader reads a currency
pair:

```typescript
const check = new PerceptionCheck([
  { mood: -1.0 }, { mood: -0.5 }, { mood: 0.2 },
]);
check.warmthDirection;   // +0.7 — the room is warming (last TWO readings)
check.warmthRate;        // +0.9 — the warming is accelerating (last THREE+)
check.direction;         // { mood: 0.7 } — per-dial movement
check.rateOfChange;      // { mood: 0.9 } — per-dial second difference
check.dialDeltas;        // { mood: { direction, rate } } — both, per dial
```

The math is the elephant's, ported verbatim:

- **`direction(series)`** — the movement between the last TWO readings:
  `d = x[-1] − x[-2]`. One number is nothing; two numbers show *which way
  and how fast*.
- **`rateOfChange(series)`** — the central second difference of the last
  THREE readings: the exact acceleration of the quadratic interpolant,
  `a = 2·(v23 − v12)/(t3 − t1)`. More than two numbers show *whether the
  movement itself is changing*. A constant-SPEED room has **no** rate —
  only a change in the movement is a rate.
- **NaN is carried forward** from the last valid reading — a glitch is NOT
  a movement, and the number doesn't matter.
- **The noise floor (0.02/pulse)** — small moves read as 0. Only movement
  above the floor is a hand on the table. This is the elephant's deadband
  at the dial level: *below significance, nothing rings.*

The scalar **warmth** headline is the same math applied to the warmth
series itself (the mean of the `warmthDials` — default all dials — per
pulse), so the report reads like the elephant's field: warming/cooling/
holding, and whether that movement is accelerating or easing.

---

## The PulseLoop — thinking in the silence

```typescript
const loop = new PulseLoop("night-watch", () => flowToReading(flow), {
  period: 5, history: 20,
});

loop.tick(now);   // one pulse — runs whether or not the agent acted
loop.pulse();     // alias: one beat on the internal clock
loop.due(now);    // seam for attention-triggered pulsing between beats
loop.internalMonologue(); // the silent thinking — runs even when the
                          // agent says nothing in the room
```

Each tick reads the room's dials, appends to a bounded rolling history,
runs the perception check, and returns a `PerceptionReport`. The loop
tracks `traffic` (messages since the last pulse) and `agentSaid` — so a
pulse knows it is a *silent* one, and the monologue runs anyway:

> *I haven't said a word, but the room is cooling — and the momentum is
> still building. Energy is the loudest hand on the room — falling 0.21
> per pulse.*

Ticks at or before the last tick are ignored (the heartbeat doesn't
double-beat); `due(now)` is the seam for callers who want to fire pulses on
attention triggers (a message that lands, a reaction spike) while still
pulsing silently in between — constant pulses, not a metronome you must
attend to.

---

## The DriveModulator — perception → drives

This is the mapping: the elephant's semantics in the engine's drive model.
Feed it each pulse's `PerceptionCheck` and it returns the agent's drives
for this moment — accumulated across pulses, clamped 0-1.

| Room reads… | Condition | Drives | Mode |
|-------------|-----------|--------|------|
| **Cold** | `warmthDirection < −floor`, or warmth below the cold threshold | **hunger accelerates**, **force-seek fires** — the agent seeks warmth. Cold AND flat is the worst state: hunger *and* despair (stagnation rises too) | `"cold"` |
| **Pointing to warmth** | `warmthDirection > seekThreshold` (0.08), room not yet warm | **force-seek fires** — the agent chases the warmth. Seeking is the *response* to cold, not an extra hunger trigger — hunger does not rise | `"seeking"` |
| **Flat** | `\|direction\| ≤ floor` AND `\|rate\| ≤ floor` | **stagnation accumulates** — nothing is moving | `"flat"` |
| **Warm** | warmth ≥ warm threshold, not cooling | **every drive calms** — hunger decays, stagnation dissolves, force-seek off | `"warm"` |

```
        cold room                flat room                warm room
   hunger ▁▂▃▄▅▆▇█        stagnation ▁▂▃▄▅▆▇█        hunger █▆▄▂▁ (calms)
   forceSeek ON                 forceSeek off           forceSeek off
   mode: "cold"                 mode: "flat"            mode: "warm"
```

The engine's old semantics, reframed:

- **Hunger** was `getHunger()` — time since the last interruption. Now it
  is perception: hunger *accelerates when the room's rate of change is
  negative/cold* and *decays when the room is warm*. A starving agent isn't
  just hungry — its hunger responds to the room.
- **Force-seek** was `ticksSinceLast >= maxInterval` — a timer flag. Now it
  is a room that reads cold and the agent seeking warmth (or the direction
  pointing to warmth and the agent chasing it).
- **Stagnation** was an estimate from flow statistics. Now it is the
  perception that nothing is moving: rate ≈ 0, and the room holding flat.

### The deadband rings up the chain of command

The terrain reframing elevated the deadband to an architecture: *when the
terrain moves below significance, nothing rings*. The `DriveModulator`
makes it concrete in two ways:

1. **Confirmation deadband** — a reading must hold for `confirmPulses`
   (default 2) consecutive pulses before any drive moves. A single cold
   blip, glitch, or noise spike never changes agent behaviour. The noise
   floor (0.02/pulse) is the *dial* deadband; confirmation is the *time*
   deadband — below it, nothing rings.
2. **Threshold hysteresis** — the warmth thresholds carry hysteresis (enter
   cold below 0.33, leave above 0.38; enter warm above 0.62, leave below
   0.57), so a room hovering at a boundary doesn't ping-pong the drives
   pulse to pulse.

When the terrain *does* cross the band — a real cooling, a real flatline,
a real warming — the witness mark (the drive) rings up to the
`InterruptionSystem`, whose own modes (`forceSeek`, `stagnationDriven`)
now take their inputs from perception instead of timers.

---

## The elephant bridge

```typescript
// Elephant input: a DialBank.readings() dict, or a bank-like object
const reading = readingFromDials(bank.readings(room));   // { mood, cynicism, ... }
const reading = readingFromDials(bank);                   // bank-like, .readings()

// Engine input: a GroupFlow snapshot becomes 0-1 pulse dials
const reading = flowToReading(flow);  // { energy, convergence, diversity, ... }
```

`readingFromDials` accepts a plain dial dict (the shape of the elephant's
`DialBank.readings(room)`), a bank-like object exposing `.readings(room?)`
(an elephant `DialBank`, a `Space` adapter's bank), or a reader object
exposing `.read()` — and coerces non-finite readings to 0 (a single glitch
never fabricates a reading; across a series the perception check carries it
forward). `flowToReading` maps the engine's own `GroupFlow` into dials —
energy is the sauna's roar, convergence is the herd's lockstep, novelty is
the warm hand on the table — so the engine's existing flow snapshots pulse
without any adapter.

---

## The loop closes

The pulse observes; what believes it is the consumer. The `wholeHand`
string and the `DriveState` are observables the rest of the engine can act
on — the `InterruptionSystem`'s response policy (*should I interrupt? what
about?*), the revelation tracker's timing, the groupthink monitor's
interventions. The perception check is the drive's sensor; the drive is the
agent's felt sense of the room. The engine's agents now think in pulses —
and the pulses never stop, even when the agents say nothing at all.

---

*The number doesn't matter. Two numbers show direction; three show rate of
change. An agent is always sensing, even when silent — the pulse is the
heartbeat of that sensing, and the perception check is its looking-around.
The silence is not empty: it is full of macro reads, and the drives answer
them.*
