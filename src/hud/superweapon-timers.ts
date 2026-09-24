import type { GameEngine } from '../game';
import { formatCountdown } from '../game/support';
import { t } from '../i18n';

/** 公共倒计时包含全部存活玩家，不受本地视野限制。 */
export function superweaponTimers(game: GameEngine) {
  return game.players.filter(player => !player.defeated).flatMap(player =>
    game.getSupport(player.id).filter(ability => ability.showTimer).map(ability => ({
      ...ability, owner: player.id, playerName: player.name, color: player.color ?? '#ffffff',
    })));
}

export function renderSuperweaponTimers(container: HTMLElement, game: GameEngine) {
  const timers = superweaponTimers(game), keep = new Set<string>();
  const rows = Math.max(1, Math.min(timers.length, Math.floor(((container.parentElement?.clientHeight ?? 600) - 70) / 26)));
  const columns = Math.ceil(timers.length / rows);
  container.hidden = timers.length === 0;
  container.style.gridTemplateRows = `repeat(${rows}, 26px)`;
  for (const [index, timer] of timers.entries()) {
    const key = `${timer.owner}:${timer.id}`;
    keep.add(key);
    let row = container.querySelector<HTMLElement>(`[data-timer="${key}"]`);
    if (!row) {
      row = document.createElement('div'); row.dataset.timer = key;
      container.append(row);
    }
    const label = `${t(timer.name)}  ${formatCountdown(timer.remaining)}`;
    if (row.textContent !== label) row.textContent = label;
    row.style.color = timer.color;
    row.style.gridRow = String(rows - index % rows);
    row.style.gridColumn = String(columns - Math.floor(index / rows));
    row.classList.toggle('ready', timer.ready);
    row.title = `${t(timer.playerName)} — ${label}${timer.paused ? ` · ${t('电力不足')}` : ''}`;
    row.setAttribute('aria-label', row.title);
  }
  for (const row of Array.from(container.children)) if (!keep.has((row as HTMLElement).dataset.timer!)) row.remove();
}
