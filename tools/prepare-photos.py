# Original photos -> everything the page needs. Five rolls; a roll either holds photographs or is an empty placeholder.
#   assets/frames/<roll>-NN.jpg        lightbox / spreads (long edge 2200 px)
#   assets/thumbs/<roll>-NN.jpg        contact sheet (360 px high)
#   assets/frames/<roll>-strip.jpg     the roll's frames laid out as they sit on the film, cut into rows that fit a texture
#   assets/thumbs/<roll>-amb-<ch>.jpg  a tiny blurred plate that tints the stage during that chapter
#   assets/embed/*.webp                smaller copies for the single-file build
#   src/rolls.js                       generated roll, chapter and frame data (geometry in mm, captions, EXIF)
# Usage: python -I tools/prepare-photos.py "<folder with the original photos>"
import os, sys, json, datetime
from PIL import Image, ImageOps, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
SPEC = json.load(open(os.path.join(ROOT, 'tools', 'rolls.json'), encoding='utf-8'))
# mm. A chapter opens with a blank title slot; ROWS = how many rows the strip texture is cut into (max 8192 px wide).
LEADER, TAIL, GAP, IMG_H, PORTRAIT_W, LANDSCAPE_W, TITLE, ROWS, MAX_TEX = 60, 24, 2, 24, 16, 36, 16, 2, 8192
MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split()
for d in ('frames', 'thumbs', 'embed'): os.makedirs(os.path.join(ROOT, 'assets', d), exist_ok=True)
A = lambda *p: os.path.join(ROOT, 'assets', *p)


def border_box(im):
    """Inner box of a photo that carries a baked black rounded border."""
    g = im.convert('L'); g.thumbnail((600, 900)); w, h = g.size; px = g.load()
    dark = lambda vals: sorted(vals)[int(len(vals) * .9)] < 14
    def run(n, line):
        k = 0
        while k < n * .08 and dark(line(k)): k += 1
        return k
    l = run(w, lambda x: [px[x, y] for y in range(h // 5, h * 4 // 5)])
    r = run(w, lambda x: [px[w - 1 - x, y] for y in range(h // 5, h * 4 // 5)])
    t = run(h, lambda y: [px[x, y] for x in range(w // 5, w * 4 // 5)])
    b = run(h, lambda y: [px[x, h - 1 - y] for x in range(w // 5, w * 4 // 5)])
    k, pad = im.width / w, im.width * .012          # pad clears the rounded corners
    return (round(l * k + pad), round(t * k + pad), round(im.width - r * k - pad), round(im.height - b * k - pad))


def fit(im, ratio):
    """Centre-crop to a width / height ratio."""
    w, h = im.size
    if w / h > ratio: nw = round(h * ratio); l = (w - nw) // 2; return im.crop((l, 0, l + nw, h))
    nh = round(w / ratio); t = (h - nh) // 2; return im.crop((0, t, w, t + nh))


def frame_width(im):
    """Width on the film in mm (the image is always 24 mm high): half-frame, full frame, or the picture's own shape."""
    a = im.width / im.height
    if abs(a - 2 / 3) < .03: return PORTRAIT_W
    if abs(a - 3 / 2) < .06: return LANDSCAPE_W
    return max(8, round(IMG_H * a))


def exif_of(path, shift):
    ex = Image.open(path).getexif(); sub = ex.get_ifd(0x8769); out = {}
    date, fl, fn, t, iso, lens = sub.get(0x9003), sub.get(0x920A), sub.get(0x829D), sub.get(0x829A), sub.get(0x8827), sub.get(0xA434)
    if date:
        d = datetime.datetime.strptime(date, '%Y:%m:%d %H:%M:%S') + datetime.timedelta(hours=shift)
        out['when'] = f'{d.day} {MONTHS[d.month - 1]} · {d:%H:%M}'; out['day'] = d.strftime('%Y-%m-%d')
    if lens and fl and fn and t:                    # files without a lens tag carry no usable exposure data
        parts = [f'{round(float(fl))} mm', f'f/{float(fn):.1f}'.replace('.0', ''), f'1/{round(1 / float(t))} s']
        if iso: parts.append(f'ISO {iso}')
        out['exif'] = ' · '.join(parts)
    return out


def photo_roll(R, no):
    key = R['key']
    # Pass 1: load, crop, and lay every frame out along the film (f = mm from the leader tip).
    frames, chapters, images, breaks, f = [], [], [], [], LEADER
    for ci, ch in enumerate(R['chapters']):
        t = f; f += TITLE; first = len(frames); breaks.append(t)
        for fr in ch['frames']:
            path = os.path.join(SRC, fr['file'])
            im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
            if fr.get('border'): im = im.crop(border_box(im))
            w = frame_width(im); im = fit(im, w / IMG_H)
            a = f + GAP / 2; b = a + w; breaks.append(f); f += w + GAP
            rec = {'id': os.path.splitext(fr['file'])[0].split(' ')[0].split('-')[0].split('_Snapseed')[0], 't': fr['title'], 'zh': fr['zh'], 'o': 'l' if im.width > im.height else 'p', 'c': ci, 'a': a, 'b': b}
            if fr.get('pick'): rec['pick'] = 1
            rec.update(exif_of(path, fr.get('tz', SPEC['tz_shift_hours'])))
            frames.append(rec); images.append(im)
        days = sorted({x['day'] for x in frames[first:] if 'day' in x})
        out = {k: ch[k] for k in ('key', 'series', 'title', 'zh', 'blurb', 'accent')}
        out.update(t=t, b=f, first=first, count=len(frames) - first, days=days)
        chapters.append(out)
    end = f; span = end - LEADER
    # The strip texture: the frame section of the film cut into ROWS rows at slot boundaries, so no image is split.
    cuts = [LEADER]
    for r in range(1, ROWS): cuts.append(min(breaks, key=lambda x: abs(x - (LEADER + span * r / ROWS))))
    cuts.append(end)
    rows = [{'f0': cuts[r], 'f1': cuts[r + 1]} for r in range(ROWS)]
    lmax = max(r['f1'] - r['f0'] for r in rows); S = min(32, MAX_TEX // lmax)
    strip = Image.new('RGB', (lmax * S, ROWS * IMG_H * S), (0, 0, 0))
    # Pass 2: write the images.
    for i, (rec, im) in enumerate(zip(frames, images)):
        nn = f'{key}-{i + 1:02d}'
        big = im.copy(); big.thumbnail((2200, 2200), Image.LANCZOS)
        big.save(A('frames', nn + '.jpg'), quality=88, optimize=True, progressive=True)
        rec['w'], rec['h'] = big.size
        th = im.resize((round(360 * im.width / im.height), 360), Image.LANCZOS); th.save(A('thumbs', nn + '.jpg'), quality=84, optimize=True)
        emb = im.copy(); emb.thumbnail((1500, 1500), Image.LANCZOS); emb.save(A('embed', nn + '.webp'), quality=80, method=6)
        th.save(A('embed', nn + '-t.webp'), quality=78, method=6)
        # In a row the film runs right to left (the leader end is on the right), images unmirrored.
        r = next(k for k, row in enumerate(rows) if row['f0'] <= rec['a'] < row['f1'])
        strip.paste(im.resize((round((rec['b'] - rec['a']) * S), IMG_H * S), Image.LANCZOS), (round((rows[r]['f1'] - rec['b']) * S), r * IMG_H * S))
        ch = chapters[rec['c']]
        if i == ch['first']:
            amb = im.resize((48, 32) if rec['o'] == 'l' else (32, 48), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
            amb.save(A('thumbs', f'{key}-amb-{ch["key"]}.jpg'), quality=80); amb.save(A('embed', f'{key}-amb-{ch["key"]}.webp'), quality=70)
        rec.pop('day', None)
    strip.save(A('frames', key + '-strip.jpg'), quality=90, optimize=True)
    strip.save(A('embed', key + '-strip.webp'), quality=84, method=6)
    print(f'{key}: {len(frames)} frames, {len(chapters)} chapters, film {LEADER + span + TAIL} mm, strip {strip.size} at {S} px/mm, rows {rows}')
    return dict(span=span, len=LEADER + span + TAIL, atlas={'rows': rows, 'lmax': lmax}, frames=frames, chapters=chapters)


def empty_roll(R):
    """A placeholder roll: blank half-frames, no chapters, no pictures."""
    frames, f = [], LEADER
    for _ in range(R['blank']):
        a = f + GAP / 2; frames.append({'o': 'p', 'a': a, 'b': a + PORTRAIT_W, 'blank': 1}); f += PORTRAIT_W + GAP
    return dict(span=f - LEADER, len=f + TAIL, frames=frames, chapters=[], placeholder=1)


rolls = []
for no, R in enumerate(SPEC['rolls'], 1):
    out = {'key': R['key'], 'no': no, 'stock': R['stock'], 'name': R['name'], 'zh': R['zh'], 'blurb': R['blurb'], 'accent': R['accent'],
           'base': SPEC['film']['base'], 'edge': SPEC['film']['edge'], 'metal': int(R['metal'], 16), 'metalness': R['metalness'], 'roughness': R['roughness'], 'title': TITLE}
    out.update(empty_roll(R) if R.get('placeholder') else photo_roll(R, no))
    rolls.append(out)

with open(os.path.join(ROOT, 'src', 'rolls.js'), 'w', encoding='utf-8', newline='\n') as fh:
    fh.write('// GENERATED by tools/prepare-photos.py from tools/rolls.json and the original photos. Do not edit by hand.\n')
    fh.write('// Geometry is in millimetres along the film, measured from the leader tip: a..b is a frame\'s image; a chapter\n')
    fh.write('// runs t..b and opens with a title slot `title` mm wide; atlas.rows are the stretches of film per texture row.\n')
    fh.write('export const ROLLS = ' + json.dumps(rolls, ensure_ascii=False, indent=1) + ';\n')
total = sum(os.path.getsize(A('embed', n)) for n in os.listdir(A('embed')))
print(f'embed {total / 1e6:.1f} MB, frames {sum(os.path.getsize(A("frames", n)) for n in os.listdir(A("frames"))) / 1e6:.1f} MB')
