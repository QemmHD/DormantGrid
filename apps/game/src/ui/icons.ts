// Procedural item icons: a pure id → spec mapping (testable) plus a canvas
// renderer cached as data URLs. 128 px, muted palette, one accent per icon.

export type Glyph =
  | 'planks' | 'bolts' | 'bricks' | 'shard' | 'cloth' | 'coil' | 'plastic' | 'bottle' | 'leaf'
  | 'nails' | 'rope' | 'tape' | 'spring' | 'battery' | 'chip' | 'fitting' | 'fuelcan'
  | 'crowbar' | 'axe' | 'pickaxe' | 'saw' | 'torch' | 'hammer' | 'hoe' | 'wateringcan' | 'flashlight' | 'kit'
  | 'knife' | 'pipe' | 'machete' | 'bat' | 'spear' | 'sledge' | 'bow' | 'crossbow' | 'nailgun' | 'rifle'
  | 'arrow' | 'mag' | 'round'
  | 'bandage' | 'pill' | 'splint' | 'spray' | 'medkit' | 'poultice'
  | 'can' | 'cracker' | 'meat' | 'egg' | 'carton' | 'cheese' | 'veg' | 'bread' | 'berries' | 'jar' | 'bowl'
  | 'water' | 'cup' | 'seed' | 'trap' | 'barricade' | 'bell' | 'turret' | 'lamp'
  | 'sack' | 'hide' | 'feather' | 'fuse' | 'chit' | 'cassette' | 'blueprint' | 'block' | 'station' | 'unknown';

export interface IconSpec {
  glyph: Glyph;
  base: string;
  accent: string;
}

const C = {
  steel: '#8e979c', rust: '#a8673f', wood: '#a98458', brick: '#a5584a', glass: '#9cc8d0', cloth: '#b8a47e',
  copper: '#c98a4a', plastic: '#d6d0c4', chem: '#8bbf6a', leaf: '#7f9a56', red: '#c4584c', bone: '#e7e1d2',
  dark: '#3d4448', accent: '#39e6d0', warm: '#e8a65a', water: '#5fb4e6', meat: '#b85a52', veg: '#d08a3c', grain: '#d8b86a',
};

const BY_ID: Record<string, [Glyph, string, string?]> = {
  'mat.scrap': ['bolts', C.steel, C.rust], 'mat.timber': ['planks', C.wood], 'mat.brick': ['bricks', C.brick],
  'mat.glass': ['shard', C.glass], 'mat.cloth': ['cloth', C.cloth], 'mat.wiring': ['coil', C.copper, C.accent],
  'mat.plastic': ['plastic', C.plastic], 'mat.chemicals': ['bottle', C.chem], 'mat.organic': ['leaf', C.leaf],
  'comp.nails': ['nails', C.steel], 'comp.rope': ['rope', C.cloth], 'comp.tape': ['tape', '#9aa0a0'],
  'comp.spring': ['spring', C.steel], 'comp.battery': ['battery', '#5a6a72', C.warm], 'comp.circuit': ['chip', '#3f6a4e', C.accent],
  'comp.fitting': ['fitting', C.copper], 'comp.fuel': ['fuelcan', C.red],
  'tool.crowbar': ['crowbar', C.red], 'tool.axe': ['axe', C.steel], 'tool.pickaxe': ['pickaxe', C.steel],
  'tool.saw': ['saw', C.steel], 'tool.torch': ['torch', '#5a6a72', C.accent], 'tool.hammer': ['hammer', C.steel],
  'tool.hoe': ['hoe', C.steel], 'tool.watering_can': ['wateringcan', '#6a8a7a'], 'tool.flashlight': ['flashlight', C.dark, C.warm],
  'tool.repair_kit': ['kit', C.rust, C.warm],
  'wpn.knife': ['knife', C.steel], 'wpn.pipe': ['pipe', C.steel], 'wpn.machete': ['machete', C.steel],
  'wpn.spiked_bat': ['bat', C.wood, C.steel], 'wpn.spear': ['spear', C.wood], 'wpn.sledge': ['sledge', C.steel],
  'wpn.bow': ['bow', C.wood], 'wpn.crossbow': ['crossbow', C.wood, C.steel], 'wpn.nailgun': ['nailgun', C.warm],
  'wpn.scrap_rifle': ['rifle', C.steel, C.wood],
  'ammo.arrow': ['arrow', C.wood], 'ammo.bolt': ['arrow', C.steel], 'ammo.nail_mag': ['mag', C.warm], 'ammo.rifle_round': ['round', C.copper],
  'med.bandage': ['bandage', C.bone], 'med.clean_bandage': ['bandage', '#f4f1e8', C.accent], 'med.splint': ['splint', C.wood],
  'med.disinfectant': ['spray', C.water], 'med.antibiotics': ['pill', C.red], 'med.painkillers': ['pill', C.bone],
  'med.poultice': ['poultice', C.leaf], 'med.first_aid': ['medkit', C.red],
  'food.canned_beans': ['can', C.rust], 'food.crackers': ['cracker', C.grain], 'food.raw_meat': ['meat', C.meat],
  'food.cooked_meat': ['meat', '#8a5a3a'], 'food.smoked_meat': ['meat', '#6a3a2a'], 'food.egg': ['egg', C.bone],
  'food.omelette': ['bowl', '#e8c85a'], 'food.milk': ['carton', C.bone, C.water], 'food.cheese': ['cheese', '#e8c85a'],
  'food.potato': ['veg', '#b8955a'], 'food.baked_potato': ['veg', '#8a6a3a'], 'food.carrot': ['veg', C.veg],
  'food.tomato': ['veg', C.red], 'food.corn': ['veg', '#e8c85a'], 'food.cabbage': ['veg', '#8aaa5a'],
  'food.pumpkin': ['veg', '#d07a2c'], 'food.wheat': ['seed', C.grain], 'food.flour': ['sack', C.bone],
  'food.flatbread': ['bread', C.grain], 'food.berries': ['berries', '#7a4a8a'], 'food.jam': ['jar', '#9a3a4a'],
  'food.canned_veg': ['can', '#6a8a4a'], 'food.veg_soup': ['bowl', C.veg], 'food.stew': ['bowl', '#8a5a3a'],
  'drink.dirty_water': ['water', '#7a7a5a'], 'drink.clean_water': ['water', C.water], 'drink.herbal_tea': ['cup', C.leaf],
  'drink.soda': ['can', '#5a7aa0', C.red],
  'trap.snare': ['rope', C.cloth, C.accent], 'trap.bear_trap': ['trap', C.steel], 'trap.tripwire': ['trap', C.copper, C.accent],
  'trap.spike_pit': ['barricade', C.wood], 'def.barricade': ['barricade', C.wood, C.steel], 'def.alarm_bell': ['bell', C.warm],
  'def.turret': ['turret', C.steel, C.accent], 'def.floodlight': ['lamp', C.dark, C.warm],
  'misc.fertilizer': ['sack', '#8a7a4a'], 'misc.feed': ['sack', C.grain], 'misc.hide': ['hide', '#9a7a5a'],
  'misc.feather': ['feather', C.bone], 'misc.grid_fuse': ['fuse', C.dark, C.accent], 'misc.guild_chit': ['chit', C.warm],
  'misc.lore_tape': ['cassette', C.dark, C.accent],
};

const BY_CATEGORY: Record<string, [Glyph, string]> = {
  material: ['bolts', C.steel], tool: ['crowbar', C.steel], weapon: ['pipe', C.steel], ammo: ['round', C.copper],
  medicine: ['medkit', C.red], food: ['can', C.rust], drink: ['water', C.water], seed: ['seed', C.leaf],
  building: ['block', C.brick], trap: ['trap', C.steel], defense: ['barricade', C.wood], station: ['station', C.wood],
  blueprint: ['blueprint', C.accent], misc: ['unknown', C.steel],
};

/** Pure mapping from item id (+ optional category) to an icon spec. Never throws. */
export function iconSpec(id: string, category?: string): IconSpec {
  const hit = BY_ID[id];
  if (hit) return { glyph: hit[0], base: hit[1], accent: hit[2] ?? C.accent };
  const prefix = id.split('.')[0];
  if (prefix === 'bp') return { glyph: 'blueprint', base: C.accent, accent: '#cffaf3' };
  if (prefix === 'seed') return { glyph: 'seed', base: C.leaf, accent: C.grain };
  if (prefix === 'piece' || prefix === 'build') return { glyph: 'block', base: C.brick, accent: C.accent };
  if (prefix === 'station') return { glyph: 'station', base: C.wood, accent: C.accent };
  const cat = category ?? ({ mat: 'material', comp: 'material', tool: 'tool', wpn: 'weapon', ammo: 'ammo', med: 'medicine', food: 'food', drink: 'drink', trap: 'trap', def: 'defense', misc: 'misc' } as Record<string, string>)[prefix];
  const c = cat ? BY_CATEGORY[cat] : undefined;
  if (c) return { glyph: c[0], base: c[1], accent: C.accent };
  return { glyph: 'unknown', base: C.steel, accent: C.accent };
}

// ---------------- canvas renderer ----------------
const cache = new Map<string, string>();
let canvas: HTMLCanvasElement | null = null;

/** Data URL for an item icon (128 px). Cached. Safe to call in any DOM context. */
export function iconURL(id: string, category?: string): string {
  const key = `${id}|${category ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.clearRect(0, 0, 128, 128);
  try {
    draw(ctx, iconSpec(id, category));
  } catch {
    /* never break UI on an icon */
  }
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export function iconImg(id: string, category?: string, cls = ''): HTMLImageElement {
  const img = new Image(64, 64);
  img.src = iconURL(id, category);
  img.alt = '';
  img.draggable = false;
  img.className = `icon ${cls}`;
  return img;
}

type Ctx = CanvasRenderingContext2D;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string, stroke = true): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,12,14,0.55)';
    ctx.stroke();
  }
}

function circle(ctx: Ctx, x: number, y: number, r: number, fill: string, stroke = true): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(10,12,14,0.55)';
    ctx.stroke();
  }
}

function line(ctx: Ctx, pts: number[], color: string, w: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w + 5;
  ctx.strokeStyle = 'rgba(10,12,14,0.55)';
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function poly(ctx: Ctx, pts: number[], fill: string): void {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10,12,14,0.55)';
  ctx.stroke();
}

/** Tool head + handle helper (diagonal handle bottom-left → top-right). */
function handle(ctx: Ctx, color = C.wood): void {
  line(ctx, [30, 104, 88, 34], color, 10);
}

function draw(ctx: Ctx, s: IconSpec): void {
  const b = s.base, a = s.accent, hi = shade(b, 1.25), lo = shade(b, 0.7);
  // soft ground shadow for every icon
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(64, 112, 38, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  switch (s.glyph) {
    case 'planks':
      for (let i = 0; i < 3; i++) {
        rr(ctx, 18 + i * 4, 30 + i * 22, 92 - i * 4, 18, 4, i % 2 ? lo : b);
        line(ctx, [30 + i * 4, 39 + i * 22, 50 + i * 4, 39 + i * 22], shade(b, 0.55), 2);
      }
      break;
    case 'bolts':
      poly(ctx, [24, 90, 46, 40, 76, 48, 66, 98], lo);
      circle(ctx, 84, 46, 16, b);
      circle(ctx, 84, 46, 6, shade(b, 0.5), false);
      rr(ctx, 70, 74, 30, 14, 3, a);
      break;
    case 'bricks':
      for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) rr(ctx, 18 + c * 46 + (r % 2) * 10 - 5, 34 + r * 22, 42, 18, 3, (r + c) % 2 ? lo : b);
      break;
    case 'shard':
      poly(ctx, [34, 100, 52, 22, 92, 58, 78, 104], b);
      line(ctx, [56, 40, 68, 80], 'rgba(255,255,255,0.7)', 3);
      break;
    case 'cloth':
      rr(ctx, 22, 44, 84, 44, 20, b);
      circle(ctx, 30, 66, 22, hi);
      circle(ctx, 30, 66, 8, lo, false);
      break;
    case 'coil':
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(64, 64, 40 - i * 7, 30 - i * 5, 0, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = i % 2 ? lo : b;
        ctx.stroke();
      }
      line(ctx, [96, 64, 112, 40], a, 5);
      break;
    case 'plastic':
      rr(ctx, 38, 30, 52, 72, 12, b);
      rr(ctx, 52, 20, 24, 14, 4, a);
      break;
    case 'bottle':
      rr(ctx, 40, 46, 48, 60, 10, b);
      rr(ctx, 54, 24, 20, 26, 4, lo);
      rr(ctx, 46, 64, 36, 22, 4, C.bone, false);
      break;
    case 'leaf':
      poly(ctx, [28, 98, 40, 46, 80, 24, 100, 30, 92, 72, 54, 96], b);
      line(ctx, [32, 96, 88, 36], lo, 3);
      break;
    case 'nails':
      for (let i = 0; i < 4; i++) line(ctx, [30 + i * 18, 30 + (i % 2) * 8, 40 + i * 18, 100], b, 5);
      break;
    case 'rope':
      ctx.beginPath();
      ctx.ellipse(64, 66, 38, 30, 0, 0, Math.PI * 2);
      ctx.lineWidth = 12;
      ctx.strokeStyle = b;
      ctx.stroke();
      line(ctx, [90, 86, 108, 106], a === C.accent ? b : a, 8);
      break;
    case 'tape':
      circle(ctx, 64, 64, 38, b);
      circle(ctx, 64, 64, 18, '#1e2326');
      break;
    case 'spring':
      line(ctx, [40, 30, 88, 42, 40, 54, 88, 66, 40, 78, 88, 90, 40, 102], b, 6);
      break;
    case 'battery':
      rr(ctx, 34, 32, 60, 72, 8, b);
      rr(ctx, 52, 22, 24, 12, 3, lo);
      line(ctx, [64, 50, 56, 70, 72, 70, 62, 90], a, 5);
      break;
    case 'chip':
      for (let i = 0; i < 4; i++) {
        line(ctx, [20, 40 + i * 16, 108, 40 + i * 16], C.steel, 3);
      }
      rr(ctx, 34, 32, 60, 64, 6, b);
      rr(ctx, 50, 48, 28, 30, 3, a);
      break;
    case 'fitting':
      rr(ctx, 26, 50, 76, 28, 6, b);
      rr(ctx, 50, 26, 28, 76, 6, hi);
      break;
    case 'fuelcan':
      rr(ctx, 30, 36, 64, 70, 8, b);
      rr(ctx, 74, 22, 14, 18, 3, C.steel);
      line(ctx, [40, 50, 84, 92], lo, 5);
      break;
    case 'crowbar':
      line(ctx, [34, 104, 86, 30, 100, 36], b, 10);
      break;
    case 'axe':
      handle(ctx);
      poly(ctx, [70, 22, 104, 36, 96, 66, 78, 52], b);
      break;
    case 'pickaxe':
      handle(ctx);
      ctx.beginPath();
      ctx.arc(84, 70, 44, -2.4, -0.7);
      ctx.lineWidth = 12;
      ctx.strokeStyle = b;
      ctx.stroke();
      break;
    case 'saw':
      poly(ctx, [24, 88, 98, 40, 104, 54, 36, 100], b);
      for (let i = 0; i < 6; i++) poly(ctx, [36 + i * 11, 96 - i * 7, 42 + i * 11, 100 - i * 7, 46 + i * 11, 90 - i * 7], lo);
      rr(ctx, 84, 28, 24, 22, 6, C.wood);
      break;
    case 'torch':
      rr(ctx, 26, 56, 54, 26, 8, b);
      line(ctx, [80, 64, 104, 46], C.steel, 6);
      circle(ctx, 106, 44, 8, a, false);
      break;
    case 'hammer':
      handle(ctx);
      rr(ctx, 64, 22, 46, 22, 4, b);
      break;
    case 'hoe':
      handle(ctx);
      poly(ctx, [80, 24, 108, 30, 106, 46, 86, 42], b);
      break;
    case 'wateringcan':
      rr(ctx, 30, 46, 52, 54, 10, b);
      line(ctx, [80, 76, 106, 46], b, 8);
      ctx.beginPath();
      ctx.arc(56, 46, 18, Math.PI, 0);
      ctx.lineWidth = 6;
      ctx.strokeStyle = lo;
      ctx.stroke();
      break;
    case 'flashlight':
      rr(ctx, 22, 54, 66, 24, 6, b);
      poly(ctx, [86, 48, 106, 40, 106, 92, 86, 84], hi);
      poly(ctx, [106, 44, 124, 30, 124, 102, 106, 88], 'rgba(232,166,90,0.45)');
      break;
    case 'kit':
      rr(ctx, 24, 40, 80, 60, 8, b);
      rr(ctx, 50, 28, 28, 16, 4, lo);
      line(ctx, [44, 70, 84, 70], a, 6);
      break;
    case 'knife':
      line(ctx, [32, 100, 54, 78], C.dark, 10);
      poly(ctx, [52, 80, 98, 24, 104, 30, 60, 86], b);
      break;
    case 'pipe':
      line(ctx, [30, 104, 96, 28], b, 13);
      line(ctx, [26, 108, 40, 94], lo, 15);
      break;
    case 'machete':
      line(ctx, [28, 104, 46, 86], C.dark, 10);
      poly(ctx, [44, 88, 92, 26, 108, 30, 54, 96], b);
      break;
    case 'bat':
      line(ctx, [30, 104, 92, 34], b, 14);
      for (let i = 0; i < 3; i++) line(ctx, [70 + i * 8, 46 - i * 8, 82 + i * 8, 58 - i * 8], a, 3);
      break;
    case 'spear':
      line(ctx, [24, 108, 90, 38], b, 7);
      poly(ctx, [86, 42, 110, 18, 96, 50], C.steel);
      break;
    case 'sledge':
      handle(ctx);
      rr(ctx, 62, 18, 48, 34, 6, b);
      break;
    case 'bow':
      ctx.beginPath();
      ctx.arc(40, 64, 50, -1.1, 1.1);
      ctx.lineWidth = 8;
      ctx.strokeStyle = b;
      ctx.stroke();
      line(ctx, [62, 20, 62, 108], C.bone, 2);
      break;
    case 'crossbow':
      line(ctx, [30, 64, 106, 64], b, 10);
      ctx.beginPath();
      ctx.arc(84, 64, 34, -1.4, 1.4);
      ctx.lineWidth = 6;
      ctx.strokeStyle = a;
      ctx.stroke();
      break;
    case 'nailgun':
      rr(ctx, 30, 40, 70, 30, 8, b);
      rr(ctx, 40, 66, 18, 36, 5, C.dark);
      rr(ctx, 96, 46, 14, 18, 3, C.steel);
      break;
    case 'rifle':
      line(ctx, [16, 76, 112, 52], b, 9);
      poly(ctx, [16, 70, 44, 66, 40, 92, 20, 96], a);
      rr(ctx, 56, 64, 12, 22, 3, C.dark);
      break;
    case 'arrow':
      line(ctx, [26, 102, 98, 30], b, 5);
      poly(ctx, [98, 30, 92, 22, 112, 16, 106, 36], C.steel);
      poly(ctx, [26, 102, 22, 88, 40, 96], C.bone);
      break;
    case 'mag':
      rr(ctx, 42, 24, 44, 80, 6, b);
      for (let i = 0; i < 4; i++) line(ctx, [52, 38 + i * 16, 76, 38 + i * 16], lo, 4);
      break;
    case 'round':
      for (let i = 0; i < 3; i++) {
        rr(ctx, 30 + i * 24, 44, 18, 52, 5, b);
        poly(ctx, [30 + i * 24, 46, 39 + i * 24, 26, 48 + i * 24, 46], C.copper);
      }
      break;
    case 'bandage':
      rr(ctx, 26, 42, 76, 44, 22, b);
      rr(ctx, 26, 56, 76, 16, 0, shade(b, 0.85), false);
      if (a !== C.accent) break;
      circle(ctx, 64, 64, 8, a, false);
      break;
    case 'pill':
      ctx.save();
      ctx.translate(64, 64);
      ctx.rotate(-0.6);
      rr(ctx, -40, -16, 80, 32, 16, C.bone);
      rr(ctx, -40, -16, 40, 32, 16, b);
      ctx.restore();
      break;
    case 'splint':
      rr(ctx, 30, 24, 16, 82, 4, b);
      rr(ctx, 82, 24, 16, 82, 4, b);
      rr(ctx, 24, 44, 80, 12, 3, C.cloth);
      rr(ctx, 24, 76, 80, 12, 3, C.cloth);
      break;
    case 'spray':
      rr(ctx, 42, 40, 44, 66, 8, b);
      rr(ctx, 52, 24, 24, 18, 3, C.bone);
      line(ctx, [58, 62, 70, 62], C.red, 4);
      line(ctx, [64, 56, 64, 68], C.red, 4);
      break;
    case 'medkit':
    case 'poultice':
      rr(ctx, 24, 36, 80, 64, 10, b);
      line(ctx, [64, 50, 64, 86], C.bone, 9);
      line(ctx, [46, 68, 82, 68], C.bone, 9);
      break;
    case 'can':
      rr(ctx, 38, 30, 52, 72, 8, C.steel);
      rr(ctx, 38, 46, 52, 40, 2, b);
      if (a !== C.accent) rr(ctx, 54, 56, 20, 20, 4, a, false);
      break;
    case 'cracker':
      for (let i = 0; i < 3; i++) rr(ctx, 26 + i * 8, 34 + i * 16, 64, 40, 6, i % 2 ? shade(b, 0.85) : b);
      break;
    case 'meat':
      ctx.beginPath();
      ctx.ellipse(58, 64, 36, 28, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = b;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,12,14,0.55)';
      ctx.stroke();
      line(ctx, [84, 46, 104, 28], C.bone, 8);
      break;
    case 'egg':
      ctx.beginPath();
      ctx.ellipse(64, 66, 28, 36, 0, 0, Math.PI * 2);
      ctx.fillStyle = b;
      ctx.fill();
      ctx.stroke();
      break;
    case 'carton':
      poly(ctx, [40, 40, 64, 22, 88, 40, 88, 104, 40, 104], b);
      rr(ctx, 48, 56, 32, 26, 4, a, false);
      break;
    case 'cheese':
      poly(ctx, [24, 90, 104, 90, 104, 60, 36, 44], b);
      circle(ctx, 70, 74, 6, shade(b, 0.75), false);
      break;
    case 'veg':
      ctx.beginPath();
      ctx.ellipse(64, 70, 34, 32, 0, 0, Math.PI * 2);
      ctx.fillStyle = b;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,12,14,0.55)';
      ctx.stroke();
      poly(ctx, [56, 40, 64, 22, 72, 40], C.leaf);
      break;
    case 'bread':
      rr(ctx, 20, 46, 88, 40, 20, b);
      for (let i = 0; i < 3; i++) line(ctx, [42 + i * 18, 54, 50 + i * 18, 76], shade(b, 0.7), 3);
      break;
    case 'berries':
      for (const [x, y] of [[50, 60], [74, 58], [62, 80], [40, 82], [84, 80]]) circle(ctx, x, y, 14, b);
      poly(ctx, [56, 40, 66, 26, 74, 42], C.leaf);
      break;
    case 'jar':
      rr(ctx, 36, 38, 56, 66, 10, b);
      rr(ctx, 40, 26, 48, 14, 3, C.steel);
      break;
    case 'bowl':
      ctx.beginPath();
      ctx.arc(64, 58, 40, 0, Math.PI);
      ctx.fillStyle = C.bone;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(64, 58, 40, 10, 0, 0, Math.PI * 2);
      ctx.fillStyle = b;
      ctx.fill();
      line(ctx, [52, 40, 56, 26], 'rgba(255,255,255,0.4)', 3);
      line(ctx, [72, 40, 76, 26], 'rgba(255,255,255,0.4)', 3);
      break;
    case 'water':
      rr(ctx, 42, 34, 44, 72, 12, 'rgba(200,220,230,0.35)');
      rr(ctx, 44, 60, 40, 44, 10, b, false);
      rr(ctx, 52, 20, 24, 16, 4, C.steel);
      break;
    case 'cup':
      rr(ctx, 34, 44, 50, 54, 8, C.bone);
      ctx.beginPath();
      ctx.arc(86, 70, 12, -1.4, 1.4);
      ctx.lineWidth = 6;
      ctx.strokeStyle = C.bone;
      ctx.stroke();
      rr(ctx, 38, 48, 42, 12, 4, b, false);
      break;
    case 'seed':
      rr(ctx, 30, 36, 68, 70, 8, '#b8a47e');
      poly(ctx, [64, 92, 64, 62, 48, 50, 64, 58, 80, 46, 64, 62], s.base);
      line(ctx, [64, 92, 64, 60], s.base, 4);
      break;
    case 'trap':
      ctx.beginPath();
      ctx.arc(64, 76, 34, Math.PI, 0);
      ctx.lineWidth = 7;
      ctx.strokeStyle = b;
      ctx.stroke();
      for (let i = 0; i < 6; i++) poly(ctx, [36 + i * 11, 76, 41 + i * 11, 62, 46 + i * 11, 76], hi);
      rr(ctx, 28, 76, 72, 10, 3, lo);
      break;
    case 'barricade':
      line(ctx, [24, 100, 104, 40], b, 9);
      line(ctx, [24, 40, 104, 100], b, 9);
      for (const [x, y] of [[40, 46], [88, 46], [64, 70]]) line(ctx, [x, y, x + 8, y - 16], a === C.accent ? C.steel : a, 4);
      break;
    case 'bell':
      poly(ctx, [40, 90, 48, 44, 64, 32, 80, 44, 88, 90], b);
      circle(ctx, 64, 96, 8, lo);
      break;
    case 'turret':
      rr(ctx, 36, 74, 56, 30, 6, lo);
      rr(ctx, 40, 44, 48, 34, 10, b);
      line(ctx, [76, 56, 112, 46], C.dark, 8);
      circle(ctx, 56, 60, 6, a, false);
      break;
    case 'lamp':
      line(ctx, [64, 108, 64, 50], b, 7);
      rr(ctx, 40, 26, 48, 26, 6, b);
      poly(ctx, [44, 52, 84, 52, 104, 96, 24, 96], 'rgba(232,166,90,0.35)');
      break;
    case 'sack':
      poly(ctx, [36, 104, 30, 56, 48, 36, 80, 36, 98, 56, 92, 104], b);
      line(ctx, [48, 38, 80, 38], lo, 5);
      break;
    case 'hide':
      poly(ctx, [24, 50, 44, 30, 84, 30, 104, 50, 96, 98, 32, 98], b);
      break;
    case 'feather':
      poly(ctx, [40, 104, 88, 24, 96, 40, 52, 100], b);
      line(ctx, [36, 108, 92, 30], lo, 3);
      break;
    case 'fuse':
      rr(ctx, 30, 48, 68, 32, 10, b);
      rr(ctx, 46, 54, 36, 20, 4, a);
      rr(ctx, 20, 56, 12, 16, 3, C.steel);
      rr(ctx, 96, 56, 12, 16, 3, C.steel);
      break;
    case 'chit':
      circle(ctx, 64, 64, 36, b);
      circle(ctx, 64, 64, 24, shade(b, 0.8), false);
      line(ctx, [54, 64, 74, 64], C.dark, 5);
      break;
    case 'cassette':
      rr(ctx, 22, 36, 84, 56, 6, b);
      rr(ctx, 34, 46, 60, 22, 4, a);
      circle(ctx, 48, 57, 6, C.dark, false);
      circle(ctx, 80, 57, 6, C.dark, false);
      break;
    case 'blueprint':
      rr(ctx, 26, 24, 76, 82, 4, '#1b4a5a');
      ctx.strokeStyle = 'rgba(57,230,208,0.85)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(34, 38 + i * 14);
        ctx.lineTo(94, 38 + i * 14);
        ctx.stroke();
      }
      ctx.strokeRect(46, 50, 36, 30);
      break;
    case 'block':
      poly(ctx, [64, 22, 104, 42, 64, 62, 24, 42], hi);
      poly(ctx, [24, 42, 64, 62, 64, 104, 24, 84], b);
      poly(ctx, [104, 42, 64, 62, 64, 104, 104, 84], lo);
      break;
    case 'station':
      rr(ctx, 20, 48, 88, 16, 4, b);
      rr(ctx, 26, 64, 10, 38, 3, lo);
      rr(ctx, 92, 64, 10, 38, 3, lo);
      rr(ctx, 44, 34, 24, 16, 3, C.steel);
      break;
    default:
      rr(ctx, 30, 30, 68, 68, 14, b);
      ctx.fillStyle = C.bone;
      ctx.font = 'bold 44px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', 64, 80);
  }
}
