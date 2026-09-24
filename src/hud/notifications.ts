import type { GameEvent } from '../game/types';
import { t } from '../i18n';

export interface BattleNotice { text: string; until: number; warn: boolean }

export function productionSound(event: GameEvent): string | undefined {
  if (event.kind !== 'complete') return;
  if (event.text.endsWith('训练完成。')) return 'unitready';
  if (event.text.endsWith('已就绪，请选择放置位置。')) return 'constructioncomplete';
}

// 界面刷新保留现有节点，语言切换只更新文字。
export function renderBattleNotices(root: HTMLElement, notices: readonly BattleNotice[]): void {
  const visible = notices.slice(-3);
  const keys = new Set(visible.map(n => JSON.stringify([n.text, n.warn])));
  for (const child of Array.from(root.children)) {
    if (!keys.has((child as HTMLElement).dataset.notice!)) child.remove();
  }
  for (const notice of visible) {
    const key = JSON.stringify([notice.text, notice.warn]);
    let node = Array.from(root.children).find(child => (child as HTMLElement).dataset.notice === key) as HTMLElement | undefined;
    if (!node) {
      node = document.createElement('div'); node.dataset.notice = key;
      node.className = `notice${notice.warn ? ' warn' : ''}`; root.append(node);
    }
    const text = t(notice.text);
    if (node.textContent !== text) node.textContent = text;
  }
}
