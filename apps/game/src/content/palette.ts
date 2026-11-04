// DORMANT GRID palette — single source of truth for colors in code.
// Mirrors docs/STYLE_BIBLE.md. Values are 0xRRGGBB numbers for three.js.
import type { DistrictKey } from '@dg/shared';

export interface DistrictPalette {
  ground: number;
  road: number;
  wallA: number;
  wallB: number;
  wallC: number;
  roof: number;
  trim: number;
  foliage: number;
  /** district-specific secondary accent (signage, doors, tarps) */
  accent: number;
}

export const PALETTES: Record<DistrictKey, DistrictPalette> = {
  haven: {
    ground: 0x5b5a4c,
    road: 0x3d3f42,
    wallA: 0x8a7a66,
    wallB: 0x6f6a5f,
    wallC: 0x9c8f78,
    roof: 0x4a3f38,
    trim: 0xc9b48f,
    foliage: 0x56664a,
    accent: 0xd08a3c,
  },
  downtown: {
    ground: 0x4c5054,
    road: 0x2f3236,
    wallA: 0x6e7479,
    wallB: 0x58606a,
    wallC: 0x8d8f8c,
    roof: 0x3a3e44,
    trim: 0xb7b2a6,
    foliage: 0x4d5a4a,
    accent: 0xa8423a,
  },
  residential: {
    ground: 0x56594a,
    road: 0x393b3d,
    wallA: 0x9a8c7a,
    wallB: 0x7d8580,
    wallC: 0xa59a86,
    roof: 0x5a4640,
    trim: 0xd2c8b4,
    foliage: 0x5a6b4b,
    accent: 0x6f8aa0,
  },
  market: {
    ground: 0x5a5448,
    road: 0x3b3936,
    wallA: 0x9b7f63,
    wallB: 0x86735f,
    wallC: 0xb09a7c,
    roof: 0x5b4434,
    trim: 0xd9c49c,
    foliage: 0x5b6648,
    accent: 0xc0603a,
  },
  industrial: {
    ground: 0x4a4944,
    road: 0x2e2e2c,
    wallA: 0x6b6458,
    wallB: 0x5a5e5c,
    wallC: 0x7e7466,
    roof: 0x3d3a36,
    trim: 0xa39a84,
    foliage: 0x4b5444,
    accent: 0xc79a2e,
  },
  hospital: {
    ground: 0x55595a,
    road: 0x36393b,
    wallA: 0xa3a6a2,
    wallB: 0x8a9496,
    wallC: 0xb8b6ac,
    roof: 0x4b5154,
    trim: 0xd6d6cf,
    foliage: 0x52604f,
    accent: 0x9e4a4a,
  },
  waterworks: {
    ground: 0x4b5552,
    road: 0x32383a,
    wallA: 0x6a7a78,
    wallB: 0x56676a,
    wallC: 0x7f8a82,
    roof: 0x37444a,
    trim: 0xa6b2aa,
    foliage: 0x4a5d4e,
    accent: 0x4f7f96,
  },
  rail: {
    ground: 0x4f4a42,
    road: 0x332f2b,
    wallA: 0x7a5e4c,
    wallB: 0x665a50,
    wallC: 0x8a7462,
    roof: 0x3e3530,
    trim: 0xb39c80,
    foliage: 0x515a45,
    accent: 0x8c3f30,
  },
  outskirts: {
    ground: 0x5c6646,
    road: 0x5a5040,
    wallA: 0x8c7658,
    wallB: 0x75684f,
    wallC: 0x9a8a6a,
    roof: 0x5c4434,
    trim: 0xc4b08a,
    foliage: 0x4f6a3e,
    accent: 0xb5823a,
  },
};

/** Grid power: the one glowing accent players learn to read as infrastructure. */
export const GRID_ACCENT = 0x39e6d0;
/** Dimmed / offline Grid conduit */
export const GRID_ACCENT_DIM = 0x1d5a55;
/** Danger / machine hostile accent (Custodian eyes, alarms). */
export const DANGER_ACCENT = 0xe0533d;

export interface LightRig {
  /** directional sun/moon */
  sun: number;
  sunIntensity: number;
  /** hemisphere sky / ground */
  sky: number;
  ground: number;
  hemiIntensity: number;
  /** window glow / practical light color */
  practical: number;
}

/** Cold blue-gray: ruins, unrestored districts. */
export const LIGHT_RUIN: LightRig = {
  sun: 0xb8c4d0,
  sunIntensity: 1.6,
  sky: 0x8a98a8,
  ground: 0x3a3d42,
  hemiIntensity: 0.9,
  practical: 0x9fb4c8,
};

/** Warm amber: restored, inhabited districts. */
export const LIGHT_RESTORED: LightRig = {
  sun: 0xffe2b8,
  sunIntensity: 2.0,
  sky: 0xc9c2b0,
  ground: 0x5a4c3c,
  hemiIntensity: 1.0,
  practical: 0xffb560,
};

export const LIGHT_NIGHT: LightRig = {
  sun: 0x6f86b0,
  sunIntensity: 0.35,
  sky: 0x2a3446,
  ground: 0x14161c,
  hemiIntensity: 0.45,
  practical: 0xffa850,
};

export interface FogSpec {
  color: number;
  near: number;
  far: number;
}

/** Index by RestorationState 0..4 (Ruin, Stabilized, Powered, Inhabited, Thriving). Daytime values. */
export const FOG_BY_STATE: readonly FogSpec[] = [
  { color: 0x7d8792, near: 40, far: 210 },
  { color: 0x868c90, near: 50, far: 240 },
  { color: 0x939089, near: 60, far: 270 },
  { color: 0xa39a88, near: 70, far: 300 },
  { color: 0xb0a48c, near: 80, far: 330 },
] as const;

export const FOG_NIGHT: FogSpec = { color: 0x1a2030, near: 25, far: 170 };

export const SKY = {
  dayZenith: 0x6f8296,
  dayHorizon: 0xb4b8b4,
  duskZenith: 0x3c4a66,
  duskHorizon: 0xd08a5a,
  nightZenith: 0x0c1220,
  nightHorizon: 0x1e2838,
  stormZenith: 0x3a4048,
  stormHorizon: 0x6a7074,
} as const;

export const MATERIAL_TINTS = {
  rust: 0x8a4e32,
  concrete: 0x8e8c86,
  brick: 0x8c5444,
  timber: 0x8a6a48,
  glass: 0x7f9aa4,
  tarp: 0x4f6670,
  blood: 0x5a1a16,
  spark: 0xffc46a,
  dust: 0x9a9284,
} as const;

/** UI design tokens. CSS strings for the DOM overlay. */
export const UI_TOKENS = {
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontMono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  color: {
    bg: '#14171a',
    panel: 'rgba(20, 23, 26, 0.86)',
    panelSolid: '#1c2024',
    panelRaised: '#252a2f',
    line: 'rgba(230, 222, 205, 0.14)',
    text: '#ece6d8',
    textDim: '#a39d90',
    textFaint: '#6e6a62',
    grid: '#39e6d0',
    gridDim: '#1d5a55',
    amber: '#f0a856',
    danger: '#e0533d',
    ok: '#8cc68a',
    warn: '#e6c25a',
    hunger: '#d9a05b',
    thirst: '#6fb3d6',
    stamina: '#d6d27a',
    sleep: '#9a8fd0',
    health: '#d9605a',
  },
  /** colorblind-safe swaps (deuteranopia/protanopia friendly) */
  colorblind: {
    ok: '#5aa0e6',
    danger: '#f0a030',
    health: '#f0a030',
  },
  space: [0, 4, 8, 12, 16, 24, 32, 48] as const,
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  /** minimum touch target in CSS px (44pt) */
  touch: 44,
  textSize: { small: 13, body: 15, large: 18, title: 28, hero: 44 },
  ease: {
    out: 'cubic-bezier(0.22, 1, 0.36, 1)',
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  duration: { fast: 120, base: 220, slow: 420 },
} as const;
