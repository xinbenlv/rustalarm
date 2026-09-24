import type { Entity, Point } from './types';
import { getDefinition } from './data';

export const AIRCRAFT_RELOAD_SECONDS = 18;
export const AIRCRAFT_CRUISE_HEIGHT = 150;
export const AIRCRAFT_CLIMB_SPEED = AIRCRAFT_CRUISE_HEIGHT / (50 / 15);
export const AIRCRAFT_ACCELERATION = 6 / (7 / 15);

// GAAIRC 的 DockingOffset 使用 256 单位每格，原点位于建筑中心。
export const AIRCRAFT_DOCK_OFFSETS: readonly Point[] = [
  { x: 0, y: -.5 }, { x: 0, y: .5 },
  { x: 1, y: -.5 }, { x: 1, y: .5 },
];

export function aircraftPads(factory: Entity): Point[] {
  return AIRCRAFT_DOCK_OFFSETS.map(offset => ({ x: factory.x + offset.x, y: factory.y + offset.y }));
}

export function aircraftIsDocked(aircraft: Entity, factories: readonly Entity[]): boolean {
  return (aircraft.flightHeight === undefined ? aircraft.order.kind === 'idle' : aircraft.flightHeight < .1) && factories.some(factory =>
    factory.type === 'airforce_command' && factory.hp > 0 && factory.owner === aircraft.owner &&
    aircraftPads(factory).some(pad => Math.hypot(aircraft.x - pad.x, aircraft.y - pad.y) < .1));
}

export function freeAircraftPad(factory: Entity, entities: readonly Entity[], ignoreId?: number): number | undefined {
  const pads = aircraftPads(factory);
  const index = pads.findIndex((pad, index) => !entities.some(e =>
    e.id !== ignoreId && e.hp > 0 && getDefinition(e.type).category === 'aircraft' &&
    ((e.owner === factory.owner && e.homeAirfieldId === factory.id && e.aircraftPadIndex === index) ||
      ((e.flightHeight ?? 0) < .1 && Math.hypot(e.x - pad.x, e.y - pad.y) < .4))));
  return index < 0 ? undefined : index;
}

export function assignAircraftDock(aircraft: Entity, entities: readonly Entity[]): Point | undefined {
  const factories = entities.filter(e => e.hp > 0 && e.owner === aircraft.owner && getDefinition(e.type).producer === 'aircraft');
  const home = factories.find(e => e.id === aircraft.homeAirfieldId);
  if (home && aircraft.aircraftPadIndex !== undefined) return aircraftPads(home)[aircraft.aircraftPadIndex];
  aircraft.homeAirfieldId = undefined; aircraft.aircraftPadIndex = undefined;
  factories.sort((a, b) => Math.hypot(a.x - aircraft.x, a.y - aircraft.y) - Math.hypot(b.x - aircraft.x, b.y - aircraft.y));
  for (const factory of factories) {
    const index = freeAircraftPad(factory, entities, aircraft.id);
    if (index === undefined) continue;
    aircraft.homeAirfieldId = factory.id; aircraft.aircraftPadIndex = index;
    return aircraftPads(factory)[index];
  }
}
