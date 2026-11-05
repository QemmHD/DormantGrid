// UI harness (?ui=harness&screen=...): mounts the UI on a mock GameAPI so
// every screen can be screenshotted headlessly without the 3D game.
import { Rng, type GameSave, type ItemStack } from '@dg/shared';
import {
  RECIPE_MAP, addItem, craft as simCraft, generateSurvivor, getItem, maxDurability, moveSlot, newGame, sortInventory, splitSlot, totalWeight,
} from '@dg/sim';
import { Bus, loadSettings, type GameAPI, type GameMode, type ScreenId } from '../game/api';
import { Input } from '../input/input';
import { audio } from '../audio/audio';
import { UI } from './ui';

export async function runHarness(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const screen = params.get('screen') ?? 'hud';
  const save: GameSave = newGame(1337, 'standard', { x: 226, z: 658 });
  const inv = save.player.inventory;
  const stock: [string, number][] = [
    ['mat.scrap', 23], ['mat.timber', 31], ['mat.brick', 12], ['mat.glass', 4], ['mat.cloth', 9], ['mat.wiring', 6],
    ['comp.nails', 18], ['tool.crowbar', 1], ['wpn.pipe', 1], ['food.canned_beans', 2], ['drink.clean_water', 3],
    ['med.bandage', 2], ['seed.potato', 5], ['food.berries', 7], ['bp.crossbow', 1],
  ];
  for (const [id, n] of stock) addItem(inv, id, n, { d: maxDurability(id) ? (maxDurability(id) ?? 0) * 0.6 : undefined, t: 8 });
  save.player.quick = ['tool.crowbar', 'wpn.pipe', 'food.canned_beans', null];
  save.player.equipped = 'tool.crowbar';
  save.player.hunger = 64;
  save.player.thirst = 18;
  save.player.stamina = 82;
  save.player.sleep = 47;
  save.player.health = 71;
  save.player.conditions = [{ id: 'bleeding', t: 1 }, { id: 'wellfed', t: 3 }];
  const rng = new Rng(9);
  for (let i = 0; i < 4; i++) save.world.survivors.push(generateSurvivor(rng, i + 1, 230 + i, 660));
  save.world.flags['lore:' + 'grid-01'] = true;

  const bus = new Bus();
  const input = new Input(document.getElementById('view')!);
  let mode: GameMode = 'play';
  const storage: (ItemStack | null)[] = Array.from({ length: 24 }, () => null);
  addItem(storage, 'mat.brick', 20);
  let ui: UI | null = null;
  const api: GameAPI = {
    bus,
    input,
    audio,
    settings: loadSettings(),
    save,
    get mode() {
      return mode;
    },
    hour: 9.5,
    useSlot: (i) => {
      const s = inv[i];
      if (!s) return;
      const def = getItem(s.id);
      if (def?.category === 'tool' || def?.category === 'weapon') save.player.equipped = save.player.equipped === s.id ? null : s.id;
      else if (--s.n <= 0) inv[i] = null;
      bus.emit({ type: 'inventory' });
    },
    dropSlot: (i) => {
      inv[i] = null;
      bus.emit({ type: 'inventory' });
    },
    moveSlot: (a, b) => {
      moveSlot(inv, a, inv, b);
      bus.emit({ type: 'inventory' });
    },
    splitSlot: (i) => {
      splitSlot(inv, i);
      bus.emit({ type: 'inventory' });
    },
    sortInventory: () => {
      sortInventory(inv);
      bus.emit({ type: 'inventory' });
    },
    setQuick: (q, id) => {
      save.player.quick[q] = id;
      bus.emit({ type: 'inventory' });
    },
    selectQuick: (q) => {
      save.player.equipped = save.player.quick[q] ?? null;
      bus.emit({ type: 'inventory' });
    },
    carryWeight: () => ({ kg: totalWeight(inv), max: 40 }),
    craftInfo: () => ({ stations: ['hands', 'workbench1', 'campfire'], blueprints: ['bp.crossbow'], rank: 1 }),
    suggestedRecipe: () => null,
    craft: (id, n) => {
      const r = RECIPE_MAP.get(id);
      if (!r) return false;
      let ok = false;
      for (let k = 0; k < n; k++) ok = simCraft(r, inv, { stations: ['hands', 'workbench1', 'campfire'], blueprints: ['bp.crossbow'], rank: 1 }) || ok;
      if (ok) bus.emit({ type: 'inventory' });
      return ok;
    },
    startBuild: (piece, tier) => bus.emit({ type: 'build', piece, tier, ok: tier < 3, reason: tier < 3 ? undefined : 'Not enough support' }),
    stopBuild: () => {
      mode = 'play';
      bus.emit({ type: 'mode', mode });
    },
    storage: () => storage,
    moveToStorage: (i) => {
      moveSlot(inv, i, storage, storage.findIndex((x) => !x));
      bus.emit({ type: 'inventory' });
    },
    moveFromStorage: (i) => {
      moveSlot(storage, i, inv, inv.findIndex((x) => !x));
      bus.emit({ type: 'inventory' });
    },
    setPaused: () => {},
    applySettings: () => bus.emit({ type: 'settings' }),
    newGame: async () => ui?.hideMenu(),
    continueGame: async () => ui?.hideMenu(),
    hasSave: () => true,
    exportSave: () => JSON.stringify(save),
    importSave: async (json) => {
      try {
        JSON.parse(json);
        return true;
      } catch {
        return false;
      }
    },
    openScreen: (id: ScreenId | null) => ui?.open(id),
    takePerk: () => false,
    setDifficulty: () => {},
  };
  ui = new UI(api);
  // fake world backdrop
  const view = document.getElementById('view')!;
  view.style.background = 'linear-gradient(180deg,#4d6f92 0%,#b7c2c6 45%,#5b5a4c 46%,#3d3f42 100%)';
  ui.setClock('09:30', 'Day 3 · Spring');
  ui.setMinimap((ctx, w, h) => {
    ctx.fillStyle = '#2a3036';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4a4f55';
    for (let i = 0; i < 6; i++) ctx.fillRect(20 + i * 34, 30 + (i % 3) * 40, 22, 26);
    ctx.fillStyle = '#39e6d0';
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2 - 12);
    ctx.lineTo(w / 2 + 8, h / 2 + 8);
    ctx.lineTo(w / 2 - 8, h / 2 + 8);
    ctx.fill();
  });
  ui.setMapDraw((ctx, w, h) => {
    ctx.fillStyle = '#20262c';
    ctx.fillRect(0, 0, w, h);
    const cols = ['#5a6670', '#8a8f7a', '#39e6d0', '#e8a65a'];
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = cols[i % 4];
      ctx.globalAlpha = 0.5;
      ctx.fillRect((i % 3) * (w / 3) + 6, Math.floor(i / 3) * (h / 3) + 6, w / 3 - 12, h / 3 - 12);
    }
    ctx.globalAlpha = 1;
  });
  ui.setJournalSource(() => [
    { title: 'Find shelter', text: 'Build a foundation, three walls and a roof at Haven Lot.', done: true },
    { title: 'First light', text: 'Reboot the control node in Market Row.', done: false },
  ]);
  ui.setDeviceReport(() => 'harness report');
  const loop = () => {
    input.update();
    ui!.update(1 / 60);
    input.endFrame();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  bus.emit({ type: 'net', status: 'syncing' });
  bus.emit({ type: 'hint', text: 'That crate is firewood and nails. Hold **Use** to take it apart.' });
  bus.emit({ type: 'prompt', text: 'Take apart Crate', sub: 'Crowbar', key: 'E' });
  bus.emit({ type: 'progress', value: 0.62 });
  bus.emit({ type: 'pickup', item: 'mat.timber', n: 2 });
  bus.emit({ type: 'pickup', item: 'mat.timber', n: 1 });
  bus.emit({ type: 'pickup', item: 'comp.nails', n: 4 });
  bus.emit({ type: 'subtitle', who: 'Marta', text: 'If you’re going to break it, at least break it into something useful.' });
  bus.emit({ type: 'district', name: 'Haven Lot', state: 'Stabilized', blurb: 'Where the lights came back first.' });
  if (screen === 'menu') ui.showMenu({ hasSave: true, username: 'night_owl' });
  else if (screen === 'build') {
    mode = 'build';
    bus.emit({ type: 'mode', mode });
    api.startBuild('wall', 1);
  } else if (screen === 'dead') {
    mode = 'dead';
    bus.emit({ type: 'mode', mode });
  } else if (screen !== 'hud') ui.open(screen as ScreenId);
}

