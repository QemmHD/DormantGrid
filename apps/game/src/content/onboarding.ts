// Guided first ten minutes. Each step shows one short contextual prompt and
// completes on a trigger the client detects. Touch and desktop variants.

export type OnboardingTrigger =
  | 'moved' // walked 6+ meters
  | 'looked' // rotated camera 90+ degrees
  | 'brokeProp' // destroyed any prop
  | 'pickedUp' // collected any material
  | 'openedInventory'
  | 'craftedCrowbar' // crafted tool.crowbar
  | 'equippedTool'
  | 'deconstructedPiece' // removed a building piece
  | 'openedBuild'
  | 'placedFoundation'
  | 'placedWalls' // 3+ walls
  | 'placedRoof'
  | 'placedBed'
  | 'ateOrDrank'
  | 'nightfall'
  | 'slept'
  | 'survivedNight';

export interface OnboardingStep {
  id: string;
  trigger: OnboardingTrigger;
  /** short header, 2-4 words */
  title: string;
  touch: string;
  desktop: string;
  /** optional world marker target hint for the client */
  marker?: 'nearestCrate' | 'nearestRuin' | 'havenPlot' | 'workbench' | 'bed' | null;
  /** seconds before the hint gently pulses again if not done */
  nudgeAfter?: number;
}

export const ONBOARDING: readonly OnboardingStep[] = [
  {
    id: 'move',
    trigger: 'moved',
    title: 'Get moving',
    touch: 'Drag anywhere on the left side to walk.',
    desktop: 'Walk with W A S D.',
    nudgeAfter: 8,
  },
  {
    id: 'look',
    trigger: 'looked',
    title: 'Look around',
    touch: 'Swipe on the right side to look around.',
    desktop: 'Move the mouse to look. Click to capture it.',
    nudgeAfter: 8,
  },
  {
    id: 'break',
    trigger: 'brokeProp',
    title: 'Everything is something',
    touch: 'That crate is firewood and nails. Hold the hand button to take it apart.',
    desktop: 'That crate is firewood and nails. Hold E to take it apart.',
    marker: 'nearestCrate',
    nudgeAfter: 15,
  },
  {
    id: 'pickup',
    trigger: 'pickedUp',
    title: 'Collect',
    touch: 'Materials fly to you. Walk close to grab the rest.',
    desktop: 'Materials fly to you. Walk close to grab the rest.',
    nudgeAfter: 10,
  },
  {
    id: 'inventory',
    trigger: 'openedInventory',
    title: 'Check your pack',
    touch: 'Tap the pack icon to see what you\'re carrying.',
    desktop: 'Press Tab to see what you\'re carrying.',
    nudgeAfter: 12,
  },
  {
    id: 'craft',
    trigger: 'craftedCrowbar',
    title: 'Make a crowbar',
    touch: 'Open Craft and make a crowbar. Bare hands only get you so far.',
    desktop: 'Open Craft (C) and make a crowbar. Bare hands only get you so far.',
    nudgeAfter: 20,
  },
  {
    id: 'equip',
    trigger: 'equippedTool',
    title: 'Tool up',
    touch: 'Tap the crowbar in a quick slot to hold it.',
    desktop: 'Press 1 to hold the crowbar.',
    nudgeAfter: 10,
  },
  {
    id: 'deconstruct',
    trigger: 'deconstructedPiece',
    title: 'Salvage the ruins',
    touch: 'Hold the hand button on a wall or door of that ruin. Mind what\'s above it.',
    desktop: 'Hold E on a wall or door of that ruin. Mind what\'s above it.',
    marker: 'nearestRuin',
    nudgeAfter: 25,
  },
  {
    id: 'buildOpen',
    trigger: 'openedBuild',
    title: 'Plan a shelter',
    touch: 'Night comes fast. Tap the hammer to open Build.',
    desktop: 'Night comes fast. Press B to open Build.',
    marker: 'havenPlot',
    nudgeAfter: 15,
  },
  {
    id: 'foundation',
    trigger: 'placedFoundation',
    title: 'Foundation first',
    touch: 'Pick Foundation, aim at the marked plot, and tap Place.',
    desktop: 'Pick Foundation, aim at the marked plot, and click to place.',
    marker: 'havenPlot',
    nudgeAfter: 20,
  },
  {
    id: 'walls',
    trigger: 'placedWalls',
    title: 'Four walls, roughly',
    touch: 'Add walls around the edge. Tap Rotate to turn them. Green means it fits.',
    desktop: 'Add walls around the edge. R rotates. Green means it fits.',
    nudgeAfter: 25,
  },
  {
    id: 'roof',
    trigger: 'placedRoof',
    title: 'Keep the rain out',
    touch: 'Put a roof on it. Pieces need support, so build from the walls.',
    desktop: 'Put a roof on it. Pieces need support, so build from the walls.',
    nudgeAfter: 25,
  },
  {
    id: 'bed',
    trigger: 'placedBed',
    title: 'Somewhere to wake up',
    touch: 'Craft a bedroll and place it inside. It\'s also where you\'ll respawn.',
    desktop: 'Craft a bedroll and place it inside. It\'s also where you\'ll respawn.',
    marker: 'bed',
    nudgeAfter: 25,
  },
  {
    id: 'eat',
    trigger: 'ateOrDrank',
    title: 'Look after yourself',
    touch: 'Your meters are dropping. Eat or drink something from your pack.',
    desktop: 'Your meters are dropping. Eat or drink something from your pack.',
    nudgeAfter: 20,
  },
  {
    id: 'night',
    trigger: 'nightfall',
    title: 'Dusk',
    touch: 'The machines see better in the dark than you do. Head inside.',
    desktop: 'The machines see better in the dark than you do. Head inside.',
  },
  {
    id: 'sleep',
    trigger: 'slept',
    title: 'Rest',
    touch: 'Tap your bed to sleep until morning.',
    desktop: 'Press E at your bed to sleep until morning.',
    marker: 'bed',
    nudgeAfter: 15,
  },
  {
    id: 'morning',
    trigger: 'survivedNight',
    title: 'You made it',
    touch: 'First night survived. Somebody saw your fire. You have company.',
    desktop: 'First night survived. Somebody saw your fire. You have company.',
  },
] as const;

/** Small contextual hints shown once, outside the main onboarding chain. */
export const CONTEXT_HINTS: Record<string, string> = {
  heavyLoad: 'You\'re carrying too much. You\'ll move slower until you drop or store something.',
  lowStamina: 'Out of breath. Stop for a moment and your stamina comes back.',
  bleeding: 'You\'re bleeding. Use a bandage, or make one from cloth.',
  fracture: 'That\'s a fracture. A splint will stop the limp.',
  sick: 'You\'re sick. Rest, drink clean water, and take medicine if you have it.',
  firstDrone: 'A drone. If it sees you, it calls for help. Break line of sight.',
  firstNode: 'A Grid control node. Clear the machines around it, then try to reboot it.',
  firstSurvivor: 'A new survivor. Tap them to see their skills and give them a job.',
  firstRaidWarning: 'A raid is coming. Close gaps in your walls and give your guards weapons.',
  protectedBuilding: 'This building belongs to the town. Confirm to take it apart anyway.',
  firstDeath: 'You went down. Your pack is where you fell. Go back prepared.',
  inventoryFull: 'Your pack is full. Store something at a crate or drop what you don\'t need.',
  stationNeeded: 'You need a better workbench for this. Build one from the Build menu.',
};
