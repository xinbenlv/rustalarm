/** 支援规则保存充能时间、供电要求和独立的按钮图标。 */
export const SUPPORT_ABILITIES: Record<string, { name: string; building: string; duration: number; powered: boolean; showTimer: boolean; cameo: string }> = {
  paradrop: { name: '空降部队', building: 'airforce_command', duration: 240, powered: false, showTimer: false, cameo: 'apar' },
  chronosphere: { name: '超时空传送', building: 'chronosphere', duration: 420, powered: true, showTimer: true, cameo: 'chro' },
  lightning: { name: '闪电风暴', building: 'weather_control', duration: 600, powered: true, showTimer: true, cameo: 'bolt' },
  ironCurtain: { name: '铁幕装置', building: 'iron_curtain', duration: 300, powered: true, showTimer: true, cameo: 'ircr' },
  nuke: { name: '核弹攻击', building: 'nuclear_silo', duration: 600, powered: true, showTimer: true, cameo: 'nuke' },
};

export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds - 1e-8));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
