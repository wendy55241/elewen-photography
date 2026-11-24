// Cartridge labels, painted once in 2D and wrapped round the cylinder (u = circumference).
// Same canvas size and two-face layout as Overture's canisterLabel. One house style in metallic blue: the loaded roll
// has a light label with its frame count, the empty rolls a dark one with their number in outline.
const W = 2048, H = 820;

function grain(g, amount = .06, seed = 7) {
  const d = g.getImageData(0, 0, W, H), px = d.data;
  for (let i = 0; i < px.length; i += 4) { seed = (seed * 1664525 + 1013904223) >>> 0; const n = ((seed >>> 24) - 128) * amount; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
  g.putImageData(d, 0, 0);
}
const spaced = s => s.split('').join(String.fromCharCode(8202));
function text(g, s, x, y, font, color, align = 'center', base = 'middle') { g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = base; g.fillText(s, x, y); }
function seam(g, color, alpha = .3) { g.save(); g.strokeStyle = color; g.globalAlpha = alpha; g.lineWidth = 3; for (const x of [W * .5, 2]) { g.beginPath(); g.moveTo(x, H * .1); g.lineTo(x, H * .9); g.stroke(); } g.restore(); }
// Brushed metal: fine horizontal hairlines over a vertical tone ramp.
function brushed(g, y0, y1, stops, seed = 3) {
  const ramp = g.createLinearGradient(0, y0, 0, y1); stops.forEach(([p, c]) => ramp.addColorStop(p, c)); g.fillStyle = ramp; g.fillRect(0, y0, W, y1 - y0);
  for (let y = y0; y < y1; y += 2) { seed = (seed * 1103515245 + 12345) >>> 0; g.fillStyle = `rgba(${seed & 1 ? '255,255,255' : '0,0,0'},${((seed >>> 8) % 60) / 1000})`; g.fillRect(0, y, W, 1); }
}
const BLUES = ['#79b4ff', '#6aa5f2', '#8fc0ff', '#4f8ae0', '#a9c9f5', '#5a96ea'];

function loaded(g, roll) {
  g.fillStyle = '#e4ebf5'; g.fillRect(0, 0, W, H);
  brushed(g, H * .8, H, [[0, '#17335e'], [.5, '#0b1a33'], [1, '#12284b']]); brushed(g, 0, H * .05, [[0, '#12284b'], [1, '#0b1a33']], 9);
  const n = roll.frames.length, face = x0 => {
    const L = x0 - 300;
    text(g, roll.name[0], L - 4, H * .25, 'italic 400 168px "Bodoni Moda", serif', '#0a1830', 'left');
    text(g, roll.name[1], L - 4, H * .45, '400 168px "Bodoni Moda", serif', '#0a1830', 'left');
    const blk = g.createLinearGradient(L + 418, H * .135, L + 568, H * .135 + 150); blk.addColorStop(0, '#1d4f9e'); blk.addColorStop(.45, '#6aa5f2'); blk.addColorStop(.6, '#cfe6ff'); blk.addColorStop(1, '#2f6fd0');
    g.fillStyle = blk; g.fillRect(L + 418, H * .135, 150, 150);
    text(g, String(n), L + 493, H * .135 + 80, '900 96px "Archivo", sans-serif', '#0a1830');
    text(g, 'EXP', L + 420, H * .39, '800 24px "Archivo", sans-serif', '#0a1830', 'left');
    text(g, 'HALF-FRAME', L + 420, H * .435, '700 19px "Archivo", sans-serif', '#0a1830', 'left');
    text(g, `ROLL ${String(roll.no).padStart(2, '0')}`, L + 420, H * .475, '700 19px "Archivo", sans-serif', '#0a1830', 'left');
    g.fillStyle = '#0a1830'; g.fillRect(L, H * .585, 568, 3);
    const cw = (568 - (roll.chapters.length - 1) * 10) / roll.chapters.length;
    roll.chapters.forEach((c, i) => { g.fillStyle = BLUES[i % BLUES.length]; g.fillRect(L + i * (cw + 10), H * .625, cw, 54); });
    text(g, spaced(roll.chapters.map(c => c.series.toUpperCase()).join(' · ')), L, H * .735, '700 15px "Archivo", sans-serif', '#0a1830', 'left');
    text(g, spaced(`${roll.stock}  ·  ELEWEN PHOTOGRAPHY  ·  C-41`), x0 - 16, H * .9, '600 22px "Archivo", sans-serif', '#cfe1fb');
  };
  face(W * .25 - 40); face(W * .75 - 40); seam(g, '#0a1830', .22); grain(g, .04);
}

function empty(g, roll) {
  brushed(g, 0, H, [[0, '#0d1d38'], [.35, '#16335f'], [.5, '#1d4179'], [.65, '#132b52'], [1, '#0a172d']], 5 + roll.no);
  g.fillStyle = '#060d1a'; g.fillRect(0, H * .84, W, H * .16); g.fillRect(0, 0, W, H * .05);
  const no = String(roll.no).padStart(2, '0'), face = x0 => {
    const L = x0 - 300;
    g.font = '900 430px "Archivo", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round';
    g.lineWidth = 7; g.strokeStyle = '#9ec5ff'; g.strokeText(no, L - 14, H * .72);
    text(g, roll.name[0], L + 500, H * .2, 'italic 400 70px "Bodoni Moda", serif', '#e4ebf5', 'right');
    text(g, roll.name[1], L + 600, H * .3, '400 70px "Bodoni Moda", serif', '#e4ebf5', 'right');
    g.fillStyle = '#9ec5ff'; g.fillRect(L + 420, H * .37, 180, 3);
    text(g, 'EMPTY', L + 600, H * .43, '800 26px "Archivo", sans-serif', '#9ec5ff', 'right');
    text(g, 'COMING SOON', L + 600, H * .485, '700 19px "Archivo", sans-serif', '#7c98c4', 'right');
    text(g, spaced(`${roll.stock}  ·  ELEWEN PHOTOGRAPHY`), x0, H * .92, '600 22px "Archivo", sans-serif', '#7c98c4');
  };
  face(W * .25 - 40); face(W * .75 - 40); seam(g, '#9ec5ff', .16); grain(g, .035, 11);
}

export const LABEL_FONTS = ['900 80px "Archivo"', '800 80px "Archivo"', '700 30px "Archivo"', 'italic 400 80px "Bodoni Moda"', '400 80px "Bodoni Moda"', '600 30px "Manrope"', '700 30px "Manrope"'];

export function paintLabel(roll) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  (roll.placeholder ? empty : loaded)(canvas.getContext('2d'), roll);
  return canvas;
}
