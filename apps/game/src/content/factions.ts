// Faction identity, intros and contract flavor text.

export type FactionKey = 'hearth' | 'ashline' | 'meridian' | 'custodians';

export interface FactionInfo {
  key: FactionKey;
  name: string;
  motto: string;
  /** shown the first time the player meets them */
  intro: string;
  /** one-line description for the reputation screen */
  summary: string;
  /** UI color (CSS hex) */
  color: string;
  /** reputation tier labels from hostile to allied */
  tiers: [string, string, string, string, string];
}

export const FACTIONS: Record<FactionKey, FactionInfo> = {
  hearth: {
    key: 'hearth',
    name: 'Hearth Compact',
    motto: 'Keep the fire.',
    intro:
      'Nobody voted for the Hearth Compact. It started as one fire in a bus yard, and people kept sitting down next to it. ' +
      'Now it is you, a sign-in book, and a promise: everyone eats, the water is boiled, and nobody gets left outside.',
    summary: 'Your people. Settlers, farmers, menders. They trust you to choose well.',
    color: '#D08A3C',
    tiers: ['Doubtful', 'Wary', 'Hopeful', 'Loyal', 'Devoted'],
  },
  ashline: {
    key: 'ashline',
    name: 'Ashline Reavers',
    motto: 'Burn to the line.',
    intro:
      'The Ashline Reavers took the Rail Depot in the first winter and have never given back anything they took. ' +
      'They sell salvage, they raid the soft-hearted, and they hate the Grid with the energy of people it locked outside. ' +
      'Pay them and they leave you alone, for a while. Fight them and they remember.',
    summary: 'Raiders and salvage dealers. Dangerous enemies, expensive friends.',
    color: '#8C3F30',
    tiers: ['Blood feud', 'Hunted', 'Tolerated', 'Respected', 'Kin'],
  },
  meridian: {
    key: 'meridian',
    name: 'Meridian Guild',
    motto: 'Everything works, for a price.',
    intro:
      'The Meridian Guild were Grid contractors once: the people who installed it, never the people who decided about it. ' +
      'They are polite, competent and always carrying a clipboard. They will trade you parts, sell you blueprints and offer you contracts. ' +
      'They would very much like to own whatever you switch back on.',
    summary: 'Scavenger-engineers. Fair traders, patient investors, long memories.',
    color: '#C79A2E',
    tiers: ['Blacklisted', 'Unbankable', 'Client', 'Partner', 'Shareholder'],
  },
  custodians: {
    key: 'custodians',
    name: 'The Custodians',
    motto: 'MAINTAIN. PROTECT. AWAIT AUTHORIZATION.',
    intro:
      'The Grid\'s maintenance machines still do their rounds: drones that count, guard bots that block, crawlers that swarm, and heavies that end arguments. ' +
      'They are not evil. They are protecting a city that no longer exists from the people who still live in it.',
    summary: 'The Grid\'s machines. Hostile until the Core decides otherwise.',
    color: '#E0533D',
    tiers: ['Hostile', 'Hostile', 'Watchful', 'Neutral', 'Authorized'],
  },
};

export interface ContractTemplate {
  id: string;
  faction: Exclude<FactionKey, 'custodians'>;
  title: string;
  /** {n}, {item}, {district} placeholders */
  text: string;
  kind: 'deliver' | 'clear' | 'escort' | 'salvage' | 'defend';
}

export const CONTRACTS: readonly ContractTemplate[] = [
  {
    id: 'contract.guild_wiring',
    faction: 'meridian',
    title: 'Copper Requisition',
    text: 'The Guild needs {n} {item} for a substation in {district}. Delivery to the trader at Market Row. Prompt payment, as always.',
    kind: 'deliver',
  },
  {
    id: 'contract.guild_survey',
    faction: 'meridian',
    title: 'Site Survey',
    text: 'Clear the machines around the dead node in {district} so our surveyors can take readings. They will not touch anything. Probably.',
    kind: 'clear',
  },
  {
    id: 'contract.guild_escort',
    faction: 'meridian',
    title: 'Escort a Surveyor',
    text: 'Junior engineer Pell needs to get to {district} and back with all ten fingers. She talks a lot. Please do not leave her there.',
    kind: 'escort',
  },
  {
    id: 'contract.ashline_tribute',
    faction: 'ashline',
    title: 'Tribute',
    text: 'Bring {n} {item} to the Depot gate. Call it rent. Call it friendship. We call it tomorrow you still have a roof.',
    kind: 'deliver',
  },
  {
    id: 'contract.ashline_salvage',
    faction: 'ashline',
    title: 'Strip Job',
    text: 'There is a Guild cache in {district}. Strip it before they do. We split it down the middle. Our middle.',
    kind: 'salvage',
  },
  {
    id: 'contract.hearth_seed',
    faction: 'hearth',
    title: 'Seed Run',
    text: 'The rail yard has spring seed stock in a car on Track 9. Bring back {n} {item} before the damp gets it.',
    kind: 'deliver',
  },
  {
    id: 'contract.hearth_hold',
    faction: 'hearth',
    title: 'Hold the Line',
    text: 'Scouts say a raid is forming near {district}. Help the guards hold the fence until it breaks up.',
    kind: 'defend',
  },
];

/** Raid warnings shown on the Town Board and as a toast. */
export const RAID_WARNINGS: Record<'ashline' | 'custodians' | 'wildlife', readonly string[]> = {
  ashline: [
    'Horns from the rail yard. Ashline is coming, by dusk.',
    'Scouts spotted rust-red cloth near the river. Raid likely before nightfall.',
    'An Ashline runner left a note on the gate: "Soon." Helpful of them.',
  ],
  custodians: [
    'Machine traffic rising on the arterials. They are coming to inspect us.',
    'A drone hovered over the fence for a full minute, then left in a hurry. Expect company.',
    'The hum is getting louder. Custodian patrol rerouted toward Haven.',
  ],
  wildlife: [
    'Hounds howling in the Outskirts tonight. Keep the gate shut.',
    'Boar tracks through the potato beds. Something big and grumpy is hungry.',
  ],
};
