# Multiplayer Expedition Architecture Plan

Status: proposed architecture and staged implementation plan  
Scope: capped expedition rooms for approximately 10–20 players  
Primary route: `/three`  
Initial roles: one Darwin, one Syms Covington, remaining players as animals  

## Purpose

This document defines an architecture for adding multiplayer to Young Darwin
without replacing the existing single-player simulation or making human-played
actors special cases throughout the codebase.

The intended end state supports:

- Capped, isolated expedition rooms.
- Unique Darwin and Syms roles.
- Multiple human-played animals.
- Independent travel between island regions.
- Human-to-human conversation when both characters are occupied.
- AI or scripted control when an actor is not human-controlled.
- Darwin observing the actual behavior of human-played animals.
- Structured procedures such as measuring, handling, feeding, trapping,
  collecting, and releasing.
- Consistent shared world outcomes when actions happen concurrently.
- Optional classroom session records and instructor controls.

The multiplayer experience should remain a playable historical simulation. It
should not become a generic chat room, deathmatch, or quiz wrapper. Animal play
must remain a genuine embodied perspective rather than an avatar skin.

## Architectural Summary

Every character or consequential creature is a stable **actor**. An actor's
identity is separate from whatever currently controls it. Its controller can be
a human player, an AI provider, or authored scripted behavior.

Every consequential interaction is a server-owned **interaction session**.
Clients request interactions; the room validates, routes, resolves, and records
them. UI components do not call an LLM or mutate shared world state directly.

```text
Next.js / React Three Fiber clients
        |
        | WebSocket commands, snapshots, and events
        v
Authoritative expedition room
  |- players and role reservations
  |- actors and control leases
  |- interaction sessions
  |- shared clock, weather, and world consequences
  |- movement validation and zone interest management
  `- bounded semantic event log
        |
        +--> asynchronous AI gateway (only for AI-controlled responses)
        |
        `--> optional snapshot/event persistence
```

The room is authoritative over rules and outcomes. Clients retain prediction
and presentation responsibility so that controls remain responsive and the
server does not need to render Three.js or run the full browser scene.

## Non-Goals For The First Multiplayer Release

- Synchronizing decorative vegetation, particles, water, ambient audio, or
  every background animal.
- Server-side rendering or full server-side Rapier simulation.
- Hard physical collision between remote players.
- Peer-to-peer hosting.
- Built-in voice chat. Voice can be added later through a separate WebRTC/SFU
  service without changing the interaction protocol.
- Supporting every wildlife asset as a player character immediately.
- Treating arbitrary dialogue text as an authoritative gameplay command.
- Requiring multiplayer in order to play `/three`.

## Current Runtime Seams

The current code already provides useful starting points:

- `three-game/playable/playableModes.js` separates playable asset, controller
  profile, toolbar, camera, and abilities for Darwin, finch, and tortoise.
- `three-game/store.js` owns the current local expedition and scene state.
- `threeRuntimeState` in `three-game/store.js` is the hot-path local pose and
  motion mirror.
- `PlayerController.jsx` publishes a local pose while retaining responsive
  client-side movement and collision.
- `ActiveZoneContent.jsx` mounts only the client's current region.
- `SymsCovington.jsx` and `AnimalModeDarwinNpc.jsx` are locally simulated NPCs.
- `SpecimenActor.jsx` and the wildlife catalog already give fauna stable actor
  concepts, behavior profiles, and runtime poses.

The primary seams that need abstraction are:

- `openNpcEncounter` and `submitNpcEncounter` in `three-game/store.js` currently
  create a local conversation and call `/api/three-encounter` directly.
- `openExamine` and `sendExamineMessage` in `three-game/store.js` currently
  create a local examination and call `/api/three-examine` directly.
- `setPlayableMode` assumes one local player and one locally hidden animal
  specimen actor.
- Syms and animal-mode Darwin movement are browser-local, so multiple clients
  would currently simulate conflicting copies.
- Zone, time, weather, specimen collection, traps, moved props, and damage are
  currently owned by a single browser store.

Do not synchronize the entire Zustand store. Split state by ownership and move
only shared, consequential state behind explicit commands.

## Technology And Deployment Direction

Use a dedicated TypeScript realtime room service alongside the Next.js app.
Colyseus is the recommended first implementation candidate because its room,
maximum-client, reconnection, matchmaking, and server-owned schema concepts
closely match this design. Keep the domain protocol independent of Colyseus so
another WebSocket room host or Cloudflare Durable Object could replace it.

Initial deployment should favor one process owning each room. A room can live in
memory while occupied and periodically write a compact snapshot plus selected
events. Redis or another distributed presence/matchmaking layer is unnecessary
until rooms must move across multiple server processes.

Do not place authoritative room lifetime solely inside ordinary request/response
API routes. Existing Next API routes may remain the local single-player AI
provider and can later become internal AI-service endpoints authenticated by the
room server.

## Actor Model

An actor is the stable identity addressed by movement, observation,
conversation, procedures, and world events.

```ts
type ActorKind = 'human' | 'animal' | 'specimen' | 'npc';
type ControlType = 'human' | 'ai' | 'scripted' | 'uncontrolled';

interface ActorState {
  actorId: string;
  kind: ActorKind;
  roleId?: string;
  typeId?: string;
  speciesId?: string;
  zoneId: string;
  position: { x: number; y: number; z: number };
  yaw: number;
  velocity?: { x: number; y: number; z: number };
  actionState?: string;
  capabilities: string[];
  control: ControlLease;
}

interface ControlLease {
  type: ControlType;
  playerId?: string;
  acquiredAt: number;
  expiresAt?: number;
  fallbackPolicy: 'wait' | 'release-role' | 'ai-takeover' | 'scripted';
}
```

Actor identity must not change when its controller changes. If the Syms player
disconnects, the actor remains `syms`; only its control lease changes.

### Role Rules

- Darwin has one reservable room role.
- Syms has one reservable room role.
- Animal roles occupy the remaining room seats.
- Role claims are atomic server commands; the client cannot assign itself.
- A disconnected player's role remains reserved for a configurable grace
  period, initially 30–60 seconds.
- AI takeover must be visible to players and allowed by room policy. It must
  never silently impersonate a disconnected human.
- An instructor/spectator role may be added without a world actor.

### Animal Identity

Support both models in the protocol:

1. **Species role:** the room spawns a session actor with a species/controller
   profile. Multiple players may be finches. This is the recommended initial
   implementation.
2. **Actor possession:** a player takes control of a particular authored
   specimen actor. Its occupied state must be replicated so every client hides
   the original autonomous actor and renders the controlled actor instead.

Do not make initial multiplayer depend on possessing authored specimen spawns.
Species roles avoid conflicts with collection state and are easier to respawn.

## State Ownership

| State | Owner | Replication/persistence |
| --- | --- | --- |
| Input, camera, audio, graphics, typing draft | Local client | None |
| Local predicted pose | Local client, corrected by room | Sent at bounded rate |
| Remote pose, velocity, action/animation | Room | Replicated to interested clients |
| Role and control lease | Room | Reliable and included in snapshots |
| Current zone per actor | Room | Reliable |
| Room clock and weather seed/state | Room | Snapshot plus sparse changes |
| Collected actor IDs and specimen outcomes | Room | Reliable, optionally persisted |
| Traps, shared droppings/traces, broken/moved props | Room | Reliable, zone-scoped |
| Decorative ecology and particles | Local client | None |
| Personal camera/UI settings | Local client | Browser persistence only |
| Personal notebook drafts | Player/private store | Persist privately if desired |
| Shared expedition log | Room | Bounded log, optionally persisted |
| Conversation transcript | Interaction session | Retention controlled by room policy |

Use an authoritative mutable room snapshot plus an append-only audit/event log.
Do not require full event sourcing to reconstruct every frame. Persist semantic
events and periodic snapshots, not movement packets.

## Protocol

Shared protocol types belong in `game-core`, contain no React or Three.js
dependencies, and are imported by both client and room server.

```ts
interface ClientCommand<T = unknown> {
  commandId: string;
  roomId: string;
  playerId: string;
  actorId: string;
  sequence: number;
  kind: string;
  payload: T;
}

interface ServerEvent<T = unknown> {
  eventId: string;
  roomVersion: number;
  kind: string;
  audience: 'room' | 'zone' | 'participants' | 'player';
  causedByCommandId?: string;
  payload: T;
}
```

Protocol rules:

- Validate every command payload and message size at the room boundary.
- Treat command IDs as idempotency keys for consequential actions.
- Use server time and room sequence numbers for resolution.
- Never trust client-provided distance, role, inventory, or outcome claims.
- Movement samples can be coalesced; actions and interaction transitions must
  be reliable and ordered.
- Version protocol messages explicitly before public deployment.
- A reconnect receives the latest snapshot followed by events after its
  snapshot version.

### Initial Command Families

- `room.claimRole`, `room.releaseRole`, `room.ready`
- `actor.move`, `actor.enterZone`, `actor.performAction`
- `interaction.request`, `interaction.accept`, `interaction.decline`
- `interaction.message`, `interaction.react`, `interaction.cancel`
- `world.collectSpecimen`, `world.documentSpecimen`
- `world.placeSnare`, `world.checkSnare`, `world.releaseAnimal`
- `world.transferItem`, `world.moveProp`, `world.breakProp`
- `journal.publishObservation` for an explicitly shared field record

Text does not mutate inventory, movement, following, collection, or trust.
Gameplay changes require a structured command even if dialogue inspired them.

## Interaction Sessions

```ts
type InteractionKind =
  | 'conversation'
  | 'observation'
  | 'procedure'
  | 'transfer'
  | 'capture'
  | 'cooperative-task';

type InteractionPhase =
  | 'requested'
  | 'accepted'
  | 'active'
  | 'awaiting-response'
  | 'resolved'
  | 'declined'
  | 'cancelled'
  | 'expired';

interface InteractionSession {
  interactionId: string;
  kind: InteractionKind;
  initiatorActorId: string;
  targetActorId: string;
  participantActorIds: string[];
  phase: InteractionPhase;
  controllerSnapshot: Record<string, ControlLease>;
  contextSnapshot: Record<string, unknown>;
  turns?: InteractionTurn[];
  outcome?: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}
```

The controller snapshot records who was responsible when the interaction
started. A later disconnect invokes an explicit fallback transition rather than
silently redirecting a pending human response to an LLM.

### Interaction Policies

| Interaction | Target acceptance | Concurrency | Authority |
| --- | --- | --- | --- |
| Passive observation | Usually none | Shared/read-only | Evidence resolver |
| Conversation | Required for a human | Normally exclusive per target | Participants/room |
| Sketching | None | Shared/read-only | Observer authors note |
| Measurement/handling | Required or contested by authored rule | Exclusive | Procedure resolver |
| Item transfer | Required | Exclusive and atomic | Room transaction |
| Cooperative task | Required | Definition-specific | Room transaction |
| Capture attempt | Governed by room policy, not a modal per attack | Exclusive during resolution | Tool/action resolver |

Passive observation must not lock or interrupt the animal player. Invasive
procedures should offer behavioral choices or allow the animal to move away.

### Locking

- Read-only observations can overlap.
- Social conversations may be exclusive for their target to prevent multiple
  simultaneous modal conversations.
- Procedures, transfers, capture resolution, and collection take an exclusive,
  expiring actor lock.
- Locks are owned by interaction ID and released on resolution, cancellation,
  timeout, zone departure, or disconnect policy.
- Never hold a lock while synchronously awaiting an LLM response.

## Controller Providers

Interaction routing should use providers behind one gateway:

```ts
interface InteractionControllerProvider {
  begin(session: InteractionSession): void;
  receiveTurn(session: InteractionSession, turn: InteractionTurn): void;
  cancel(session: InteractionSession, reason: string): void;
}
```

The interface is event-driven. Providers eventually submit a response command;
the room loop does not await a provider call.

### Human Provider

- Sends an interaction request or turn to the controlling player's client.
- Accepts only responses from that player's active control lease.
- Provides bounded response time and explicit decline/cancel behavior.
- May offer private historical role guidance, suggested replies, or action
  choices, but never substitutes text without the player's action.

### AI Provider

- Creates an asynchronous AI job containing an immutable context snapshot and
  request ID.
- Sends the result back to the room as a provider response.
- The room verifies that the session and request are still current before
  applying it.
- AI output is presentation or proposed structured data; deterministic room
  validation still controls state changes.
- Existing `/api/three-encounter` and `/api/three-examine` behavior can back the
  first local AI provider.

### Scripted Provider

- Supplies deterministic openers, fallback responses, and authored behavior.
- Keeps single-player and multiplayer functional when an LLM is unavailable.
- Handles fixed feedback that does not benefit from generation.

## Human Darwin And Human Syms

Expected conversation flow:

1. Darwin enters Syms's interaction radius.
2. The client displays `E - Speak with Syms` based on replicated actor data.
3. Darwin sends `interaction.request` with kind `conversation`.
4. The room validates control, zone, distance, availability, and rate limits.
5. Human Syms receives `Darwin wants to speak` with accept/decline controls.
6. Acceptance opens the same canonical session for both players.
7. Messages are relayed through the room and appended to the bounded transcript.
8. Walking away, changing zones, closing the panel, or timeout ends the session.

When Syms is human-controlled:

- The LLM must not speak as Syms.
- `SymsCovington.jsx` must not mount a competing local NPC actor.
- Existing follow/wait/range directives apply only to AI/scripted Syms.
- A human Syms follows, waits, travels, or assists through ordinary controls and
  structured cooperative actions.
- Trust should not be assigned by an LLM scoring human conversation. Social or
  assessment consequences should derive from explicit actions and authored
  rules.

Optional private Syms assistance may provide:

- A short role and historical knowledge brief.
- Recent expedition/specimen context.
- Suggested period-appropriate replies.
- Reminders about labels, containers, supplies, and field tasks.

Suggested text is never sent automatically and is not visible to Darwin until
the Syms player chooses to send it.

## Observation Of Human-Played Animals

Do not ask the animal player to retrospectively write what the animal did. That
would interrupt embodied play and permit prose to contradict visible behavior.

Instead, maintain a bounded semantic behavior stream per consequential actor:

```ts
interface SemanticBehaviorEvent {
  eventId: string;
  actorId: string;
  zoneId: string;
  type:
    | 'fed'
    | 'drank'
    | 'rested'
    | 'perched'
    | 'took-flight'
    | 'landed'
    | 'fled-from'
    | 'approached'
    | 'entered-water'
    | 'left-trace'
    | 'reacted';
  at: number;
  position: { x: number; y: number; z: number };
  data: Record<string, unknown>;
}
```

Keep approximately 30–60 seconds of bounded semantic evidence per actor. Do not
store every transform as an enduring event. Generate semantic events from
validated actions and server-observed thresholds.

Expected observation flow:

1. Darwin selects a remote animal actor in observation mode.
2. The room validates zone, range, and broad facing/visibility constraints.
3. It opens a read-only observation session and records an evidence window.
4. The animal continues playing without a modal interruption.
5. Darwin may watch silently or ask a field-inquiry question.
6. A deterministic evidence resolver selects relevant observed events and known
   subject facts.
7. An LLM may phrase the evidence as concise naturalistic observation, but may
   not introduce behavior absent from the evidence.
8. Darwin chooses which facts to save and writes the field note personally.

Example:

```text
Evidence
- finch fed twice on dry seeds
- Darwin approached within 1.4 m
- finch moved away, then took flight to an opuntia perch

Permitted presentation
"It picks repeatedly at dry seeds between the stones. When you close the
distance, it retreats and then takes flight to the cactus."
```

If the evidence does not answer a question, return uncertainty rather than
inventing an action. The observation window should remain usable after the
animal leaves so Darwin can finish writing without holding the target in place.

The instructor may choose whether animal players see a subtle `being observed`
indicator. Observation telemetry and transcript retention must be disclosed in
the room setup.

## Procedures And Animal Reactions

Questions such as `what color is it?` can resolve from visible evidence without
interrupting the subject. Attempts such as `measure its shell`, `touch it`, or
`offer it food` become structured procedure interactions.

Example reaction prompt:

```text
Darwin approaches with a pocket rule.

[Remain still] [Withdraw] [Turn away] [Walk off]
```

The animal chooses behavior, not narrative prose. The choice produces a real
action/animation that the room records and the other clients render. The
procedure resolver combines:

- The selected procedure and period tool.
- Actor capabilities and species data.
- Current pose, range, terrain, and movement.
- The animal's response or actual departure.
- Known measurement uncertainty.

If the animal moves out of range, the interaction expires naturally. A future
freeform animal-intent field may map text into allowed actions, but prose must
never directly establish physical facts.

## Capture, Collection, And Player Continuity

Before enabling capture of human-played animals, define a room-level policy:

- Observation only.
- Handling and release.
- Nonlethal capture.
- Historical collection with immediate role reassignment.
- Human-player animals cannot be captured.

Do not ask for an out-of-character consent modal on every capture attempt. The
session policy sets the permitted mode up front; in-world actions then resolve
according to gameplay rules.

A captured animal player must not be removed from the lesson. Supported outcomes
should include:

- Release after observation or measurement.
- Respawn as another individual of the same species.
- Select a different available animal role.
- Enter a short captured/specimen perspective before reassignment.

Capture resolution must be atomic. The room checks tool, range, actor state,
cooldowns, and policy, then commits one outcome. Duplicate or delayed commands
must not collect the same actor twice.

## Movement And Remote Presentation

Retain local prediction in `PlayerController`:

1. Apply local controls immediately.
2. Publish bounded input/pose samples, initially 15–20 Hz.
3. Validate maximum displacement, controller profile, zone bounds, terrain,
   transition legality, and action constraints in the room.
4. Broadcast authoritative/coalesced snapshots to interested clients.
5. Interpolate remote actors with an initial 100–150 ms buffer.
6. Smooth small local corrections and snap only when divergence is unsafe.

Do not transmit bones or per-frame animation poses. Replicate velocity,
grounded/flight state, facing, and semantic action ID; remote models derive
animation locally.

Initially disable hard player-player collision. Interactions use proximity
checks, while avatars pass or softly separate visually. Revisit networked body
collision only if it becomes a meaningful mechanic.

## Zones And Interest Management

Each client continues to mount only its own active region. The room tracks each
actor's `zoneId` independently.

- Full remote actor snapshots go only to clients in the same zone.
- The roster may expose coarse presence such as `Darwin - Post Office Bay` for
  other zones.
- Zone-scoped world state loads on entry and can unload locally on departure.
- The room validates travel against the canonical route graph.
- Travel loading remains local and does not pause the room.
- Shared clock and weather continue while any one client is loading or using a
  modal.

No multiplayer interaction may pause the global room. Conversation and examine
UI must become non-pausing overlays. A delicate procedure may lock movement for
its participants, but other players and the world continue.

## Consequential Fauna Versus Ambient Ecology

- Human-played animals are room actors.
- Collectable, documentable, trapped, injured, or otherwise consequential
  specimen actors must eventually have room-authoritative semantic state.
- Decorative or distant ambient fauna may remain client-local.
- Ambient fauna promoted into an interaction becomes a stable room actor before
  a consequential result is allowed.
- Existing distance-tier rendering and animation LOD remain client concerns.

Do not network every ecology prop or wildlife animation just because multiplayer
exists.

## LLM Boundary

LLMs may:

- Speak for an AI-controlled historical actor.
- Suggest private replies to a human role player.
- Phrase canonical observation evidence naturally.
- Summarize a completed interaction or expedition log.
- Admit uncertainty when evidence is insufficient.

LLMs may not:

- Speak for a connected human-controlled actor.
- Decide whether a role is available.
- Commit collection, transfer, damage, capture, travel, or inventory changes.
- Invent behavior for a human-played animal when behavioral evidence exists.
- Interpret conversation text as an automatic world mutation.
- Block the room simulation while generating.

All AI jobs require room/session identity, idempotency keys, timeouts, rate
limits, and stale-result rejection. API keys remain server-side.

## Client UI

### Lobby

- Create/join room with short code.
- Player count and room capacity.
- Role cards with available, reserved, occupied, and reconnecting states.
- Ready state and room policy summary.
- Animal species selection and capability preview.
- Instructor/spectator controls when authorized.

### In-Game Presence

- Compact roster with role, zone, and connection status.
- Subtle same-zone nameplates or role markers.
- Reconnection and control-transfer notices.
- Optional latency indicator in diagnostics, not normal HUD clutter.

### Interaction UI

- `E - Speak with Syms` becomes a server request for a human target.
- Incoming conversation requests are small and non-blocking until accepted.
- Both participants see the same canonical conversation session.
- Observation does not open a modal on the animal player's screen.
- Procedure reactions use a compact accessible action strip with keyboard and
  touch bindings.
- Timeouts, walking away, and disconnects produce clear in-world outcomes.

### Instructor Controls

- Start, pause session clock, lock/unlock joining, and end session.
- View and reassign abandoned roles.
- Remove a participant.
- Configure capture/collection and observation-notification policy.
- Export the shared expedition record when enabled.

Instructor pause is a room-level command. An individual player's modal is not.

## Suggested Repository Layout

Names are provisional, but ownership boundaries should remain:

```text
game-core/
  multiplayer/
    protocol.ts              # versioned command/event envelopes
    roomState.ts             # serializable shared state types
    validation.ts            # pure payload and transition validation
  actors/
    actorTypes.ts
    controlLeases.ts
    capabilities.ts
  interactions/
    interactionTypes.ts
    interactionPolicies.ts
    interactionReducer.ts
    observationEvidence.ts
    procedureResolver.ts

three-game/
  multiplayer/
    MultiplayerClient.ts
    interactionGateway.ts
    remoteActorRuntime.js     # hot-path interpolation, outside React state
    roomStore.js              # low-frequency replicated/UI state
  components/world/
    RemotePlayerActors.jsx
    RemoteActor.jsx
  ui/multiplayer/
    MultiplayerLobby.jsx
    Roster.jsx
    IncomingInteraction.jsx
    HumanConversation.jsx
    ProcedureReaction.jsx

multiplayer-server/
  src/
    rooms/ExpeditionRoom.ts
    state/
    commands/
    interactions/
    providers/
      HumanProvider.ts
      AiProvider.ts
      ScriptedProvider.ts
    persistence/
```

Keep hot-path remote transforms in mutable runtime structures similar to
`threeRuntimeState`; do not drive 20 remote actors through high-frequency
Zustand/React updates.

## Single-Player Compatibility

Introduce an `interactionGateway` before implementing network UI:

```ts
interface InteractionGateway {
  request(input: InteractionRequest): Promise<InteractionHandle>;
  sendTurn(interactionId: string, input: InteractionTurnInput): void;
  react(interactionId: string, reaction: InteractionReaction): void;
  cancel(interactionId: string): void;
}
```

- `LocalInteractionGateway` preserves existing single-player scripted/LLM
  behavior.
- `RoomInteractionGateway` sends commands to the expedition room.
- UI reads normalized interaction state and does not know which gateway or
  controller provider supplied it.

Refactor `openNpcEncounter`, `submitNpcEncounter`, `openExamine`, and
`sendExamineMessage` to use the gateway before changing their presentation.
The first refactor milestone should produce no player-visible behavior change.

## Progressive Delivery Plan

### Phase 0: Domain Foundation And Local Adapter

Deliverables:

- Stable actor IDs and actor descriptors for Darwin, Syms, player animals, and
  consequential specimens.
- Versioned shared protocol and interaction types in `game-core`.
- Pure interaction reducer/state machine with timeouts and lock rules.
- `LocalInteractionGateway` wrapping the current encounter and examine calls.
- Existing single-player NPC and examination UI migrated to normalized sessions.

Acceptance:

- `/three` single-player behavior remains functionally unchanged.
- Existing encounter, examination, collection, and animal-mode smoke paths pass.
- Interaction transition and idempotency unit tests exist.
- No networking dependency is required for single-player.

### Phase 1: Room, Lobby, Roles, And Presence

Deliverables:

- Standalone room service and WebSocket client.
- Create/join room, short codes, capped seats, and role reservations.
- Darwin, Syms, finch, and tortoise session actors.
- Remote avatar rendering, interpolation, and same-zone interest filtering.
- Reconnect grace period and explicit role release.
- Single fixed-region multiplayer test before enabling travel.

Acceptance:

- Darwin and Syms cannot be claimed twice under concurrent requests.
- 20 simulated clients can join, move, disconnect, and reconnect without room
  inconsistency.
- Local controls remain responsive under representative latency.
- Remote players do not drive high-frequency React rerenders.

### Phase 2: Zone Travel And Shared Room State

Deliverables:

- Independent actor zone transitions validated against the route graph.
- Zone-scoped interest subscriptions and late-join snapshots.
- Shared room clock and weather.
- Initial shared consequential state: collected actors, traps, and selected
  moved/broken props.

Acceptance:

- Players in different zones do not receive unnecessary transform traffic.
- Returning to a zone reconstructs its shared consequences consistently.
- One player's travel/loading/modal never pauses other clients.

### Phase 3: Human Syms Conversation

Deliverables:

- Human and AI controller providers.
- Conversation request/accept/decline/timeout flow.
- Canonical paired transcript and bounded message rate.
- Suppression of local Syms NPC when the actor has a human lease.
- Optional private Syms historical/contextual assistance.
- Clear disconnect and optional AI-takeover transition.

Acceptance:

- When Syms is human-controlled, no LLM call generates Syms's dialogue.
- Both participants see identical ordered turns.
- Text alone cannot change inventory, follow state, travel, or world state.
- Disconnect during a conversation releases locks and follows room policy.

### Phase 4: Human-Animal Observation

Deliverables:

- Semantic behavior events for movement modes and authored animal actions.
- Bounded per-actor evidence buffers.
- Remote player animals as observation-mode targets.
- Deterministic evidence selection and uncertainty handling.
- LLM presentation grounded exclusively in selected evidence.
- Personal Darwin field-note saving from the multiplayer session.

Acceptance:

- A finch that feeds and flies produces corresponding observation evidence.
- A finch that never feeds is not described as feeding.
- The animal player is not interrupted by passive observation.
- Multiple observers can watch without locking the animal.
- Observation remains usable after the subject leaves range.

### Phase 5: Procedures, Cooperation, And Transfers

Deliverables:

- Procedure definitions and capability checks.
- Animal reaction UI and animations/actions.
- Measurement, handling, offering food, assisting, and item transfer.
- Exclusive actor locks for invasive operations.
- Atomic shared inventory/supply changes.

Acceptance:

- Leaving range or declining cleanly expires a procedure.
- Duplicate transfer/measurement commands do not duplicate outcomes.
- The recorded fact matches the selected reaction and resolved world state.

### Phase 6: Capture, Collection, And Player Continuity

Deliverables:

- Room capture/collection policy.
- Authoritative contested capture resolution.
- Captured/released/collected actor state.
- Respawn, role reassignment, or captured-perspective continuation.
- Classroom-safe UI explaining the configured consequence model.

Acceptance:

- One actor cannot be collected twice.
- A captured student always has an immediate supported continuation path.
- Policy-disabled actions are rejected before changing shared state.

### Phase 7: Classroom Hardening And Persistence

Deliverables:

- Instructor controls and permissions.
- Snapshot persistence and join-in-progress recovery.
- Optional shared expedition export and assessment hooks.
- Transcript retention controls, moderation strategy, and disclosure.
- Operational metrics, structured logs, and deployment runbooks.

Acceptance:

- A room can recover from a process restart within the documented persistence
  window.
- Exported records distinguish human text, AI text, scripted text, observed
  evidence, and authoritative outcomes.
- Session deletion/retention behavior is documented and testable.

## Testing Strategy

### Unit Tests

- Role claim races and lease expiry.
- Command validation, authorization, and idempotency.
- Interaction state transitions and actor locks.
- Controller fallback transitions.
- Observation evidence selection and non-invention.
- Procedure and capture resolution.
- Zone route validation.

### Integration Tests

- Two clients complete a human Darwin/Syms conversation.
- Human Syms disconnects before accepting and while responding.
- Darwin observes a human finch performing known actions.
- Two observers inspect one animal concurrently.
- Procedure request resolves, declines, times out, and loses range.
- Two clients race to collect or transfer the same object.
- Join-in-progress receives current roles, actors, and zone consequences.

### Load And Network Tests

- 20 headless clients moving and producing bounded actions.
- Latency, jitter, delayed packets, duplicate commands, and reconnects.
- Message-rate abuse and oversized text payloads.
- Slow AI response returning after cancellation or controller change.
- Browser render cost for 19 remote avatars in one zone.

### Existing Project Verification

- General implementation: `npm run check`.
- Interaction/HUD changes: `npm run three:e2e:smoke`.
- Visual remote-avatar/UI changes: `npm run three:screenshot:fast` when useful.
- Broad readiness claims: `npm run build` plus multiplayer integration/load
  tests supplied by the room service.

## Security, Safety, And Privacy

- Use signed room/player identity; a short room code is discovery, not authority.
- Authorize every command against the active actor control lease.
- Rate-limit movement, interaction requests, and text separately.
- Bound transcript length, message size, and retained behavior history.
- Never expose LLM or infrastructure credentials to clients.
- Decide whether classroom conversations are stored before enabling export.
- Label human, AI, scripted, and generated-summary authorship in records.
- Provide instructor removal and room-lock controls.
- Prefer generated or instructor-approved display names for classroom sessions.

## Observability

Track at minimum:

- Active rooms, connected clients, joins, leaves, and reconnects.
- Room tick duration and outbound message rate.
- Command rejection counts by reason.
- Interaction count, completion, timeout, and cancellation rate.
- AI job latency, failure, stale-result rejection, and cost by room.
- Snapshot persistence age and recovery failures.

Use IDs in logs, not full private conversation text by default.

## Decisions Required Before Each Later Phase

These are deliberately unresolved product decisions, not blockers for Phase 0:

1. Are animal species roles unlimited, capped per species, or tied to authored
   individual actors?
2. Can animal players see when passive observation begins?
3. Which room capture/collection policies ship, and which is the default?
4. What happens to an animal player's role after historical collection?
5. Are personal journals private, shared by choice, or visible to instructors?
6. Are human conversation transcripts retained, and for how long?
7. Does disconnected Darwin or Syms transfer to AI, reopen the role, or wait?
8. May players travel independently, or can an instructor require group travel?
9. Should human Syms receive LLM suggestions by default or only on request?
10. Which additional animal locomotion/controller families are required for the
    first classroom multiplayer session?

Record answers as explicit room-policy fields rather than scattering feature
flags through UI components.

## Rules For Future Agents

- Preserve the single-player path through the local interaction gateway.
- Keep protocol and interaction reducers pure and independent of React/Three.
- Do not synchronize the whole Zustand store.
- Do not let clients commit shared outcomes directly.
- Do not let dialogue text mutate world state without a structured command.
- Do not let an LLM speak for a connected human-controlled actor.
- Do not invent observed behavior when human-player evidence is available.
- Do not pause the room for one player's conversation, examination, or loading.
- Do not network decorative simulation without a demonstrated gameplay need.
- Use stable actor IDs, command IDs, interaction IDs, and room sequence numbers.
- Add tests for race conditions and disconnects with every consequential action.
- Update this document when protocol ownership or phase acceptance criteria
  materially change.

## First Implementation Task

The first coding task should be a behavior-preserving refactor, not a WebSocket
prototype:

1. Define actor, controller, interaction, command, and event types in
   `game-core`.
2. Implement and unit-test the pure interaction state machine.
3. Add `LocalInteractionGateway`.
4. Route current Syms encounter and examination store actions through it.
5. Verify that current single-player interactions remain unchanged.

This establishes the boundary needed for both human and AI providers and
prevents the later networking work from becoming a second parallel gameplay
implementation.
