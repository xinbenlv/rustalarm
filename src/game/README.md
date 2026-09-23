# Game simulation

Deterministic tile-space gameplay, independent of the DOM and renderer.

```text
index.ts -> types.ts + data.ts + engine.ts
engine.ts -> pathfinding.ts
engine.test.ts -> normal skirmish and debug behavior
bootcamp.test.ts -> model whitelist, training rules and skirmish isolation
```

`GameOptions.mode` defaults to `skirmish`. Bootcamp uses the verified model catalog
in `../bootcamp/catalog.js` for initial entities, production and spawn validation.
It starts with a supported construction yard, maintains 99,999,999 local credits,
completes local production immediately, bypasses faction/tech/producer requirements,
and retains occupancy, exploration, bounds and terrain checks. Naval production
searches for available water; unavailable terrain rejects recruitment explicitly.

Bootcamp opponents remain actual damageable entities. Their AI and autonomous unit
updates are disabled, including retaliation and pursuit. Automatic elimination is
disabled in training. Unsupported transformations (yard to MCV) and support units
are rejected. Skirmish follows the existing AI, prerequisites and victory rules.
Each player may keep one active building of each type, including defenses and
superweapon buildings. A player may rebuild a building after losing or selling it.

The Debug Panel applies credits, map reveal and instant production independently to
the friendly side or enemy side. Friendly includes the local player and allied players.
Credit removal stops at zero. A manual credit adjustment persists in Bootcamp while
production remains free. Audio muting remains global.

Run `node --import tsx --test src/game/*.test.ts`. The existing simulation class
exceeds the standard file-length limit; preserving its private state boundaries
avoids an unrelated engine rewrite during this integration.

`commandMove(..., append=true)` queues destinations in entity waypoints. Arrival
advances the queue; ordinary orders, stop, deployment and boarding cancel it.
The renderer draws routes from this shared state in either presentation. Player
colors use the original rules.ini HSV values and multiplayer ordering.

Selected infantry, vehicle, aircraft and naval producers accept a map right-click
as a rally point. Newly produced units move to a passable cell near that point.
Without a rally point, skirmish units retain the existing nearby exit behavior.
