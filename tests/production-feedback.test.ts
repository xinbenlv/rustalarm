import assert from 'node:assert/strict';
import { test } from 'node:test';
import { productionSound } from '../src/hud/notifications';
import { GameEngine } from '../src/game/engine';
import { aircraftIsDocked } from '../src/game/aircraft';
import type { GameEvent } from '../src/game/types';

test('production completion announces readiness once and placement does not repeat the voice', () => {
  const event = (text: string): GameEvent => ({ id: 1, time: 0, owner: 0, kind: 'complete', text });
  assert.equal(productionSound(event('爱国者导弹已就绪，请选择放置位置。')), 'constructioncomplete');
  assert.equal(productionSound(event('爱国者导弹建造完成。')), undefined);
  assert.equal(productionSound(event('入侵者战机训练完成。')), 'unitready');
  assert.equal(productionSound({ ...event('警告：我方基地正在遭受攻击！'), kind: 'warning' }), undefined);
});

test('only a landed fighter exactly on a living friendly pad is docked', () => {
  const game = new GameEngine({ map: { width: 40, height: 40, cells: Array(1600).fill('land'), spawns: [{ x: 5, y: 5 }] },
    players: [{ id: 0, name: 'Player', country: 'america', team: 0 }], startingUnits: 0 });
  const airport = game.spawnEntity('airforce_command', 0, 20.5, 20);
  const fighter = game.spawnEntity('harrier', 0, 20.5, 19.5);
  assert.equal(aircraftIsDocked(fighter, game.entities), true);
  fighter.order = { kind: 'move', x: 10, y: 10 };
  assert.equal(aircraftIsDocked(fighter, game.entities), true, 'Issuing an order does not teleport the plane into the air');
  fighter.flightHeight = 2;
  assert.equal(aircraftIsDocked(fighter, game.entities), false);
  fighter.order = { kind: 'idle' }; fighter.flightHeight = 0; fighter.x -= .5;
  assert.equal(aircraftIsDocked(fighter, game.entities), false);
  fighter.x += .5; airport.owner = 1;
  assert.equal(aircraftIsDocked(fighter, game.entities), false);
  airport.owner = 0; airport.hp = 0;
  assert.equal(aircraftIsDocked(fighter, game.entities), false);
});
