"""Combine original building bases with directional VXL turrets and barrels."""
from PIL import Image, ImageChops
import export_assets as e
import export_voxels as v


def compose(key, rules, base, mask, entry, pal):
    turret = rules.get('turretanim', '').lower()
    if not turret or rules.get('turretanimisvoxel', '').lower() not in ('true', 'yes'):
        return base, mask
    parts = [turret]
    if 'tur' in turret:
        parts.append(turret.replace('tur', 'barl'))
    name = key + '-turret'
    if not v.export(name, turret, parts=parts, pal=pal):
        raise ValueError('Missing building turret: ' + turret)
    sprite = e.manifest['sprites'][name]
    pixels = Image.open(e.OUT / 'sprites' / (name + '.png')).convert('RGBA')
    remap = Image.open(e.OUT / 'sprites' / (name + '-remap.png')).convert('RGBA')
    width, height = base.size
    sheet = Image.new('RGBA', (width * 8, height * 4))
    masks = Image.new('RGBA', sheet.size)
    tw, th = sprite['frameWidth'], sprite['frameHeight']
    offset = (round(width / 2 + int(rules.get('turretanimx', 0)) - tw / 2),
              round(height / 2 + int(rules.get('turretanimy', 0)) - th / 2))
    for frame in range(32):
        tx, ty = frame % 8 * tw, frame // 8 * th
        gun = pixels.crop((tx, ty, tx + tw, ty + th))
        gunmask = remap.crop((tx, ty, tx + tw, ty + th))
        image, color = base.copy(), mask.copy()
        image.alpha_composite(gun, offset)
        erase = Image.new('L', color.size, 255)
        erase.paste(Image.eval(gun.getchannel('A'), lambda a: 255 - a), offset)
        color.putalpha(ImageChops.multiply(color.getchannel('A'), erase))
        color.alpha_composite(gunmask, offset)
        position = (frame % 8 * width, frame // 8 * height)
        sheet.paste(image, position); masks.paste(color, position)
    entry.update(width=sheet.width, height=sheet.height, frames=32, columns=8,
                 facings=32, facingConvention='world-xy')
    entry['originalLayers'].extend(sprite['originalFile'].split(','))
    return sheet, masks
