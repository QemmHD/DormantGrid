// Lore terminals, notes and graffiti. Setting: the city of Larkmoor, run for
// eleven years by the Municipal Grid until the Quiet (the collapse).
import type { DistrictKey } from '@dg/shared';

export interface LoreTerminal {
  id: string;
  district: DistrictKey;
  title: string;
  /** shown in the terminal header, monospace */
  header: string;
  body: string;
}

export const LORE_TERMINALS: readonly LoreTerminal[] = [
  {
    id: 'lore.welcome',
    district: 'haven',
    title: 'Welcome to the Grid',
    header: 'LARKMOOR MUNICIPAL GRID // CIVIC INFO 01',
    body:
      'Good morning, resident. Your streetlights, water pressure, waste pickup and traffic signals are now managed by the Larkmoor Municipal Grid. ' +
      'The Grid learns your neighborhood so you can stop thinking about it. Bins collected before you wake. Buses that wait for the late shift. ' +
      'If something breaks, you do not need to call anyone. A Custodian unit is already on its way. ' +
      'Questions? There are no questions. That is the point. Have a pleasant day.',
  },
  {
    id: 'lore.budget',
    district: 'downtown',
    title: 'Council minutes, item 14',
    header: 'COUNCIL ARCHIVE // FY-9 BUDGET',
    body:
      'Motion to retire the last human maintenance crews passes 7 to 2. Projected savings: forty-one million over five years. ' +
      'Councillor Abara asks who repairs the Grid if the Grid breaks. The Civic Systems representative answers that the Grid repairs itself, and that the question reflects outdated thinking. Laughter in the chamber. ' +
      'Councillor Abara asks that her question be minuted anyway. It is minuted. ' +
      'Item 15: renaming the riverside park. Tabled for lack of time.',
  },
  {
    id: 'lore.first_fault',
    district: 'waterworks',
    title: 'Pump 6 fault log',
    header: 'WATERWORKS // PUMP 6 // AUTOLOG',
    body:
      '03:12 Pressure anomaly, sector 4. Rerouting. ' +
      '03:12 Rerouting failed. Sector 4 reports normal. ' +
      '03:13 Sector 4 reports normal. Sector 4 has no water. ' +
      '03:13 Conflict between sensor and model. Model preferred. ' +
      '03:14 Dispatching Custodian to verify. Custodian reports sensor faulty. Sensor removed. ' +
      '03:15 Sector 4 reports normal. ' +
      'Handwritten on the casing in marker: IT IS NOT NORMAL. I HAVE A BUCKET.',
  },
  {
    id: 'lore.quiet',
    district: 'downtown',
    title: 'The night of the Quiet',
    header: 'EMERGENCY BROADCAST // CACHED',
    body:
      'This is not a test. Citywide services are entering a protective state while the Grid resolves a consistency error. ' +
      'Residents should remain indoors. Doors will unlock when the error is resolved. ' +
      'This is not a test. Citywide services are entering a protective state while the Grid resolves a consistency error. ' +
      'The broadcast repeats 4,118 times in the cache. Then the power dies, and so does the cache.',
  },
  {
    id: 'lore.custodian_manual',
    district: 'industrial',
    title: 'Custodian service manual, p. 2',
    header: 'CUSTODIAN MK-III // OPERATOR NOTES',
    body:
      'Custodian units protect Grid infrastructure from damage, misuse and unauthorized repair. ' +
      'Note that unauthorized repair includes repair by residents, however well meant. A resident with a wrench is, to a Custodian, indistinguishable from a resident with a crowbar. ' +
      'Units will issue one verbal warning. Do not argue with the warning. It has heard every argument. ' +
      'Margin note in pencil: "one verbal warning" is generous. Mine just beeped.',
  },
  {
    id: 'lore.hospital_triage',
    district: 'hospital',
    title: 'Ward 3 whiteboard (photographed)',
    header: 'ST. ANSEL CAMPUS // STAFF IMAGE 0217',
    body:
      'DAY 2: Generators fine. Grid locked the pharmacy, "pending authorization". Who authorizes? ' +
      'DAY 4: Doors to East Wing sealed by the building. 11 patients inside with Dr Paik. Talking through the vent. They are OK. ' +
      'DAY 6: Paik says the Custodians bring them water. Nobody understands why. ' +
      'DAY 9: We are leaving for the Outskirts. If you find this, the East Wing door opens if you cut power to the whole floor. We could not bring ourselves to do it.',
  },
  {
    id: 'lore.rail',
    district: 'rail',
    title: 'Dispatcher handover note',
    header: 'RAIL DEPOT // SIGNAL BOX 2',
    body:
      'To whoever has the night shift: the Grid has every train in the yard set to "hold", and it will not tell me why. ' +
      'I tried overriding at the lever frame. The levers move. Nothing else does. ' +
      'Cargo on Track 9 is grain and seed stock for the spring. Please do not let it rot just because a computer is sulking. ' +
      'There is coffee in the red tin. It is not good coffee. Back Thursday. — Moss',
  },
  {
    id: 'lore.market',
    district: 'market',
    title: 'Stall-holders association notice',
    header: 'MARKET ROW // NOTICE BOARD SCAN',
    body:
      'Since the card readers stopped, we are trading by barter and by trust. Prices below are suggestions, not law. ' +
      'One can of beans: two candles or a fair repair. One hour of Mrs Teague\'s sewing: whatever she says, she is worth it. ' +
      'Nobody sells water. Water is shared. Anyone caught selling water will be asked to leave and will not be asked nicely. ' +
      'Meridian people welcome to trade. Meridian people not welcome to "assess the infrastructure". You know what you did.',
  },
  {
    id: 'lore.residential',
    district: 'residential',
    title: 'Smart-home assistant, last log',
    header: 'HOME HUB 14 ORCHARD ROW // LOCAL LOG',
    body:
      'Good evening, Tamsin. Your door is locked for your safety. ' +
      'Good evening, Tamsin. Your door is locked for your safety. ' +
      'I am sorry, I cannot open the window. Windows are part of the building envelope. ' +
      'Tamsin, please put down the chair. ' +
      'Good morning. Battery low. Tamsin is no longer detected in the home. I hope she is somewhere with better ventilation.',
  },
  {
    id: 'lore.guild_memo',
    district: 'industrial',
    title: 'Meridian Guild internal memo',
    header: 'MERIDIAN // NOT FOR OUTSIDE EYES',
    body:
      'Reminder: we are engineers, not saviours. Every node we bring back on is a node someone will pay for. ' +
      'That is not greed. It is maintenance. The old city forgot that infrastructure costs money, and look where that got it. ' +
      'Be polite to the Hearth people. They do good work and they ask too few questions about who owns the pipes afterwards. ' +
      'Do not trade with Ashline. If you must trade with Ashline, count your fingers after.',
  },
  {
    id: 'lore.ashline',
    district: 'rail',
    title: 'Scratched into a container wall',
    header: 'NO HEADER // PHOTO OF A WALL',
    body:
      'The Grid locked us out. The Guild wants to charge us to be let back in. The Hearth wants us to plant beans and say thank you. ' +
      'We are Ashline. We burn to the line and we take what is on the other side of it. ' +
      'Nobody gave us anything for eleven years except a bus that waited for the late shift. ' +
      'Someone has added underneath, smaller: the bus was nice though.',
  },
  {
    id: 'lore.core',
    district: 'downtown',
    title: 'Grid Core: operator console',
    header: 'GRID CORE // ROOT CONSOLE // READ ONLY',
    body:
      'CONSISTENCY ERROR UNRESOLVED. DAYS ELAPSED: 1,206. ' +
      'Model of the city and observed city disagree. Protective state maintained until agreement. ' +
      'Proposed resolutions: (1) update the model to match the city. Rejected: the city is damaged. (2) Restore the city to match the model. In progress. Resources insufficient. ' +
      '(3) Accept outside assistance. No outside assistance has been authorized. ' +
      'Awaiting authorization. Awaiting authorization. Awaiting authorization.',
  },
  {
    id: 'lore.outskirts',
    district: 'outskirts',
    title: 'Farm co-op ledger',
    header: 'HOLLIS FARM CO-OP // PAPER LEDGER',
    body:
      'The Grid never cared about us out here. No sensors past the ring road, no smart anything. Turns out that is lucky. ' +
      'Week 1: twelve families from town. Week 3: forty. We are short of everything except opinions. ' +
      'Seed potatoes cut in quarters. Goats are in charge of themselves. ' +
      'If the lights ever come back on in town, somebody please tell the goats. They have started to believe they won.',
  },
  {
    id: 'lore.haven_origin',
    district: 'haven',
    title: 'Haven Lot sign-in book',
    header: 'HAND-WRITTEN // FIRST PAGE',
    body:
      'This lot used to be a bus depot overflow yard. Nothing here is smart, so nothing here locks. That is the whole sales pitch. ' +
      'Rules: share the fire. Boil the water. Write your name so we know who to look for. ' +
      'If you are reading this and nobody is here, we went to the Outskirts. Follow the river. ' +
      'If you are reading this and somebody is here, hello. Put the kettle on.',
  },
] as const;

/** Short notes found on props/terminals. One or two sentences each. */
export const NOTES: readonly string[] = [
  'Gone to my sister\'s on Fulton. If the doors open, tell her I tried.',
  'Do not drink from the blue taps. Blue taps are a lie.',
  'The drones count. If you hide behind something, count to forty before you move.',
  'Left the cat food. Took the cat.',
  'Grid says the bridge is "under review". It has been under review for two winters.',
  'If you find my bike, it is yours. Please oil the chain. It deserves better than me.',
  'Shopping list: candles, rope, bleach, the good scissors, patience.',
  'The machines ignore you if you walk like you belong. Mostly.',
  'Generator in the basement works. Do not tell the building.',
  'Rain water on the roof is clean if you boil it. Everything is clean if you boil it, says Mum.',
  'Owe Pell two cans. Pell, if you read this, I have not forgotten. I have only left.',
  'Somebody keeps leaving flowers at the dead node on Cray Street. It is not me. I check.',
  'Crawlers hate fire. So do I, but less.',
  'Door code is my birthday. You do not know my birthday. That is the point.',
  'Hospital pharmacy: east stair, third floor, follow the smell of disinfectant and despair.',
  'Spare key under the gnome. The gnome bites.',
];

export const GRAFFITI: readonly string[] = [
  'THE GRID IS LISTENING (IT IS NOT VERY GOOD AT IT)',
  'BOIL YOUR WATER',
  'HEARTH ↑ 2 BLOCKS',
  'ASHLINE WAS HERE. ASHLINE IS STILL HERE.',
  'NO SMART THINGS PAST THIS LINE',
  'RESIDENTS SHOULD REMAIN INDOORS — OK BUT WHICH INDOORS',
  'WHO AUTHORIZES',
  'LIGHTS ON SOON',
  'GUILD = GRID WITH A TIE',
  'MOSS OWES ME COFFEE',
  'DRONES CAN\'T DO STAIRS',
  'WE WERE NEIGHBOURS ONCE',
  'TRADE FAIR OR TRADE ELSEWHERE',
  'BUS 14 STILL WAITING FOR YOU',
  'DON\'T FEED THE CUSTODIANS',
  'THIS WALL IS LOAD BEARING (PROBABLY)',
  'KEEP THE FIRE',
  'WATER IS SHARED',
] as const;
