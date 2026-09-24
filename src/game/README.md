# Game simulation

Deterministic tile-space gameplay, independent of the DOM and renderer.

```text
index.ts -> types.ts + data.ts + engine.ts
engine.ts -> pathfinding.ts
engine.test.ts -> normal skirmish and debug behavior
bootcamp.test.ts -> model whitelist, training rules and skirmish isolation
snapshot.ts + snapshot-validation.ts -> explicit state contract and validation
snapshot.test.ts -> independent restoration and identical simulation continuation
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
普通建筑和防御建筑允许重复建造。四类超级武器建筑各限一座。
超级武器和谭雅达到限额后，按钮保留并变暗。
玩家失去限额单位后，可以重新生产。
每座空指部提供四个飞机名额。现役飞机和训练队列共同占用名额。
飞机起飞后仍占用名额。机场消失后，引擎暂停超额飞机的生产。
`aircraft.ts` 提供原版停机坐标、停机位归属和停靠判定。
战机完成移动、停止或失去目标后，自动返回所属机场。
战机发射导弹后返航着陆，装弹后继续攻击。
兵营、战车工厂和船坞保存各自的集结点。
玩家双击生产建筑后，引擎将生产建筑设为主工厂。
`behavior.test.ts` 验证返航装弹、集结点、限额和兵种行为。
`combat-fidelity.test.ts` 验证光棱聚光、分裂和战机爬升。
光棱塔最多接收八座己方空闲塔的支援。
光棱坦克命中非建筑目标后分裂光束。
`support.ts` 保存原版充能时间、供电要求和按钮图标。
空降充能不受停电影响。存档保留聚光和导弹状态。

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

`captureSnapshot()` copies all simulation state, including timers, random state,
debug flags and neutral definitions. `fromSnapshot()` validates the complete snapshot
before restoring the engine. The spatial snapshot retains bucket order and removed
entities until the next scheduled refresh. Restoration rebuilds the entity lookup
and building occupancy without advancing time or updating fog.
