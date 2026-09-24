/** 素材校验覆盖支援图标、导弹朝向和光棱塔充能帧。 */
export const SUPPORT_CAMEOS = ['apar', 'para', 'chro', 'bolt', 'ircr', 'nuke'] as const;
export const combatAssetPaths = [...SUPPORT_CAMEOS.map(key => `/assets/cameos/${key}.png`), '/assets/sprites/dragon.png'];

export function missingCombatAssets(manifest: { cameos?: Record<string, unknown>; sprites?: Record<string, unknown> }): string[] {
  const missing = SUPPORT_CAMEOS.filter(key => !manifest.cameos?.[key]).map(key => `cameos.${key}`);
  const dragon = manifest.sprites?.dragon as { frames?: number } | undefined;
  if (dragon?.frames !== 32) missing.push('sprites.dragon');
  for (const key of ['gapris', 'gapris-snow']) {
    const tower = manifest.sprites?.[key] as { sequences?: { fireup?: number[] } } | undefined;
    if (!tower?.sequences?.fireup?.[1]) missing.push(`sprites.${key}.fireup`);
  }
  return missing;
}
