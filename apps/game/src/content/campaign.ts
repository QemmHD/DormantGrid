// Campaign framing: acts, endings, district intros and Custodian node lines.
import type { DistrictKey } from '@dg/shared';

export type ActKey = 'ember' | 'reboot' | 'contest' | 'core';

export interface ActCard {
  key: ActKey;
  number: 1 | 2 | 3 | 4;
  title: string;
  subtitle: string;
  /** shown full-screen on act start, under 50 words */
  text: string;
  objectives: string[];
}

export const ACTS: readonly ActCard[] = [
  {
    key: 'ember',
    number: 1,
    title: 'Ember',
    subtitle: 'Act I',
    text: 'Three years after the Quiet, the Grid still runs the streets and nobody runs the Grid. You have a bus yard, a fire, and a sign-in book with too few names. Start there.',
    objectives: ['Survive your first night', 'Build a shelter at Haven Lot', 'Welcome three survivors'],
  },
  {
    key: 'reboot',
    number: 2,
    title: 'Reboot',
    subtitle: 'Act II',
    text: 'The node behind Haven still has power in it, asleep under the rust. Wake it, and the lights come on. Wake it, and everyone in Larkmoor notices.',
    objectives: ['Reboot your first control node', 'Meet the Meridian Guild', 'Survive an Ashline raid'],
  },
  {
    key: 'contest',
    number: 3,
    title: 'Contest',
    subtitle: 'Act III',
    text: 'Every lit street is a street someone else wanted. The Guild has offers. Ashline has demands. The machines have started counting you. Choose your friends before they choose for you.',
    objectives: ['Restore three districts', 'Decide on the Guild\'s offer', 'Settle things with Ashline'],
  },
  {
    key: 'core',
    number: 4,
    title: 'Core',
    subtitle: 'Act IV',
    text: 'Under Old Downtown, the Grid Core has been waiting 1,206 days for someone to authorize something. That someone is you. Decide what it should wake up as.',
    objectives: ['Reach the Grid Core', 'Choose the Grid\'s fate'],
  },
];

export type EndingKey = 'people' | 'guild' | 'dark';

export interface Ending {
  key: EndingKey;
  title: string;
  /** shown on the decision screen */
  choice: string;
  /** reputation / flag hints for the decision UI */
  requires: string;
  epilogue: string[];
}

export const ENDINGS: Record<EndingKey, Ending> = {
  people: {
    key: 'people',
    title: 'Lights for Everyone',
    choice: 'Authorize the Hearth Compact. Give the Grid back to the people who live under it.',
    requires: 'Hearth: Loyal or higher',
    epilogue: [
      'The Core accepts the authorization with the quiet relief of a machine that has finally been told what to do.',
      'The Custodians stop patrolling and start fixing. Within a month, a guard bot is helping Mrs Teague carry fabric to the market. Nobody is entirely comfortable with this. Everybody is grateful.',
      'The town is noisy, argumentative and governed by a council that meets around a fire it no longer needs. They keep the fire anyway.',
      'Water is shared. It says so on the pumps.',
    ],
  },
  guild: {
    key: 'guild',
    title: 'Metered Light',
    choice: 'Authorize the Meridian Guild. Efficient, funded, maintained, and owned.',
    requires: 'Meridian: Partner or higher',
    epilogue: [
      'The Guild brings the Core online in nine days, which is very impressive, and sends the first invoices in ten.',
      'Every street is lit. Every pump works. Every household has a small cyan meter by the door that blinks politely when the balance is low.',
      'Haven Lot gets a discount, as founding partners. You are told this often.',
      'The Ashline Reavers write something rude across the Guild headquarters. By morning a Custodian has scrubbed it off, and by noon it is back.',
    ],
  },
  dark: {
    key: 'dark',
    title: 'Lights Out',
    choice: 'Shut the Grid down for good. No more watchers. No more waiting.',
    requires: 'Always available',
    epilogue: [
      'The Core powers down with a long, falling tone that everyone in Larkmoor hears, and the Custodians lie down where they stand.',
      'Without the Grid the nights are darker, the pumps are hand-cranked, and the work never really ends.',
      'But nothing watches, nothing locks, and nothing waits for authorization. People fix things because they decided to.',
      'On clear nights you can see every star over the city. Somebody started naming them after the people in the sign-in book.',
    ],
  },
};

export const DISTRICT_INTROS: Record<DistrictKey, { name: string; blurb: string }> = {
  haven: {
    name: 'Haven Lot',
    blurb: 'An overflow bus yard nobody bothered to make smart. Nothing here locks, which is why people live here.',
  },
  downtown: {
    name: 'Old Downtown',
    blurb: 'Glass towers, empty plazas, and the Grid Core somewhere underneath. The drones here never sleep, and neither will you.',
  },
  residential: {
    name: 'Residential Rows',
    blurb: 'Smart homes that locked their owners in for their own safety. Mind the gardens: some of them are still growing.',
  },
  market: {
    name: 'Market Row',
    blurb: 'Awnings, stalls and the last place in Larkmoor where a handshake meant something. The Guild trades here now.',
  },
  industrial: {
    name: 'Industrial Yard',
    blurb: 'Factories that built the Custodians, and heavies that still guard the assembly lines. Bring your best tools and your worst intentions.',
  },
  hospital: {
    name: 'Hospital Campus',
    blurb: 'St. Ansel\'s, sealed by its own building. Medicine inside, crawlers in the vents, and an East Wing nobody talks about.',
  },
  waterworks: {
    name: 'Waterworks',
    blurb: 'Pumps, tanks and pipes the size of tunnels. Switch this on and the whole town stops boiling its water.',
  },
  rail: {
    name: 'Rail Depot',
    blurb: 'Ashline territory. Shipping containers stacked into walls, and a seed train that has been on hold for three years.',
  },
  outskirts: {
    name: 'The Outskirts',
    blurb: 'Fields, woods and farmhouses past the ring road. The Grid never cared about out here. Neither did the hounds.',
  },
};

/** Lines spoken in the Custodian system voice during a node reboot. */
export const NODE_LINES = {
  approach: [
    'UNAUTHORIZED PRESENCE AT INFRASTRUCTURE NODE. PLEASE STEP AWAY.',
    'THIS NODE IS IN A PROTECTIVE STATE. YOUR COOPERATION IS APPRECIATED AND ASSUMED.',
  ],
  breakerHint: 'BREAKER SEQUENCE REQUIRED. REFER TO PANEL MARKINGS. DO NOT GUESS. YOU WILL GUESS.',
  breakerWrong: ['SEQUENCE REJECTED.', 'INCORRECT. RESETTING.', 'THAT IS NOT HOW ELECTRICITY WORKS.'],
  breakerRight: ['SEQUENCE ACCEPTED.', 'ROUTING CONFIRMED.'],
  syncStart: 'SYNCHRONIZING WITH GRID. HOLD CONNECTION.',
  syncInterrupted: 'SYNCHRONIZATION INTERRUPTED. PROGRESS RETAINED. PROBABLY.',
  defendStart: 'NODE STATE CHANGE DETECTED. CUSTODIAN UNITS DISPATCHED TO INVESTIGATE.',
  defendWave: ['ADDITIONAL UNITS EN ROUTE.', 'INVESTIGATION ESCALATED.', 'PLEASE REMAIN WHERE YOU ARE.'],
  online: [
    'NODE ONLINE. DISTRICT SERVICES RESUMING.',
    'CONSISTENCY IMPROVED BY 0.4 PERCENT. THANK YOU, RESIDENT.',
    'POWER RESTORED. WATER PRESSURE NOMINAL. HAVE A PLEASANT DAY.',
  ],
  coreFinal: 'AUTHORIZATION REQUESTED. 1,206 DAYS ELAPSED. PLEASE DECIDE.',
} as const;

/** Restoration state change announcements (index = new state 1..4). */
export const RESTORATION_LINES: readonly string[] = [
  '',
  '{district} is stabilized. The machines are thinner on the ground here now.',
  '{district} has power. Lights on, pumps running, stations online.',
  '{district} is inhabited. People are moving back in.',
  '{district} is thriving. You can hear it from the street.',
];
