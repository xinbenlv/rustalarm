"""转换器合成光棱塔的待机和充能帧。"""
import math
from PIL import Image, ImageChops


def compose(exporter, lookup, base, mask, entry, palette):
    frames, masks, sequences = [], [], {}
    for action, name in [('ready', 'gapris_b'), ('fireup', 'gapris_a')]:
        data, filename = lookup(name)
        if not data:
            raise ValueError('Missing prism animation: ' + name)
        original = exporter.shp_frames(data)
        count = len(original)
        if count % 2 == 0 and max(original[count // 2].tobytes(), default=0) <= 1:
            count //= 2
        sequences[action] = [len(frames), count, 0]
        for source in original[:count]:
            frame, remap = base.copy(), mask.copy()
            layer = exporter.colorize(source, palette)
            offset = ((base.width - layer.width) // 2, (base.height - layer.height) // 2)
            frame.alpha_composite(layer, offset)
            erase = Image.new('L', base.size, 255)
            erase.paste(Image.eval(layer.getchannel('A'), lambda alpha: 255 - alpha), offset)
            remap.putalpha(ImageChops.multiply(remap.getchannel('A'), erase))
            frames.append(frame); masks.append(remap)
        entry['originalLayers'].append(filename + '.shp')
    columns = min(8, len(frames))
    size = (base.width * columns, base.height * math.ceil(len(frames) / columns))
    atlas, remaps = Image.new('RGBA', size), Image.new('RGBA', size)
    for index, (frame, remap) in enumerate(zip(frames, masks)):
        offset = (index % columns * base.width, index // columns * base.height)
        atlas.paste(frame, offset); remaps.paste(remap, offset)
    entry.update(width=size[0], height=size[1], frames=len(frames), columns=columns, facings=1, sequences=sequences)
    return atlas, remaps
