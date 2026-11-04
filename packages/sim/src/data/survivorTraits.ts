export type SkillId = 'farming' | 'scavenging' | 'building' | 'cooking' | 'combat' | 'medicine' | 'engineering';
export const SKILLS: readonly SkillId[] = ['farming', 'scavenging', 'building', 'cooking', 'combat', 'medicine', 'engineering'] as const;

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  /** skill work-rate multipliers, e.g. { farming: 1.25 } */
  skill?: Partial<Record<SkillId, number>>;
  /** flat effects */
  mood?: number; // baseline mood offset
  hungerRate?: number; // multiplier
  restRate?: number;
  social?: number; // friendship formation multiplier
  conflict?: number; // conflict chance multiplier
  bravery?: number; // >1 guards rather than flees
  injuryRisk?: number;
  /** incompatible trait ids */
  excludes?: string[];
}

export const TRAITS: readonly TraitDef[] = [
  { id: 'green_thumb', name: 'Green Thumb', desc: 'Talks to tomatoes. The tomatoes seem to appreciate it.', skill: { farming: 1.35 } },
  { id: 'scrounger', name: 'Scrounger', desc: 'Finds things in places that were definitely already searched.', skill: { scavenging: 1.35 } },
  { id: 'handy', name: 'Handy', desc: 'Has fixed every door in Haven at least once, including the ones that weren’t broken.', skill: { building: 1.3, engineering: 1.1 } },
  { id: 'cook', name: 'Line Cook', desc: 'Ran a diner grill for eleven years. Will tell you about it.', skill: { cooking: 1.4 } },
  { id: 'ex_security', name: 'Ex-Security', desc: 'Used to guard a mall. Takes perimeter duty very seriously.', skill: { combat: 1.3 }, bravery: 1.5 },
  { id: 'nurse', name: 'Night Nurse', desc: 'Calm in a crisis, unbearable about handwashing.', skill: { medicine: 1.4 } },
  { id: 'tinkerer', name: 'Tinkerer', desc: 'Has opinions about capacitors. Strong ones.', skill: { engineering: 1.4 } },
  { id: 'optimist', name: 'Optimist', desc: 'Believes the Grid will come back. Annoyingly, might be right.', mood: 10, excludes: ['gloomy'] },
  { id: 'gloomy', name: 'Gloomy', desc: 'Expects the worst. Rarely disappointed, never pleasant about it.', mood: -10, excludes: ['optimist'] },
  { id: 'big_eater', name: 'Big Eater', desc: 'Eats for two. Works for one and a half.', hungerRate: 1.4, skill: { building: 1.1 }, excludes: ['light_eater'] },
  { id: 'light_eater', name: 'Light Eater', desc: 'Lives on crackers and spite.', hungerRate: 0.7, excludes: ['big_eater'] },
  { id: 'night_owl', name: 'Night Owl', desc: 'Works best when everyone else is asleep. Sleeps through breakfast.', restRate: 0.85 },
  { id: 'insomniac', name: 'Insomniac', desc: 'Always tired, always up. Makes coffee out of things that aren’t coffee.', restRate: 1.3, mood: -4 },
  { id: 'charmer', name: 'Charmer', desc: 'Could sell a Reaver their own boots.', social: 1.6, conflict: 0.6 },
  { id: 'hothead', name: 'Hothead', desc: 'Starts arguments, finishes fights.', conflict: 2, skill: { combat: 1.15 } },
  { id: 'loner', name: 'Loner', desc: 'Prefers the quiet jobs. Friends are slow to come and slower to go.', social: 0.5, skill: { scavenging: 1.1 } },
  { id: 'brave', name: 'Brave', desc: 'Runs toward trouble. Usually with a plan.', bravery: 1.8, injuryRisk: 1.2, excludes: ['coward'] },
  { id: 'coward', name: 'Careful', desc: 'Runs away from trouble. Usually with everything they were carrying.', bravery: 0.4, injuryRisk: 0.6, excludes: ['brave'] },
  { id: 'clumsy', name: 'Clumsy', desc: 'Has injured themself on a spoon. Twice.', injuryRisk: 1.6, skill: { building: 0.9 } },
  { id: 'tough', name: 'Tough as Boots', desc: 'Shrugs off cuts that would floor anyone else.', injuryRisk: 0.6, skill: { combat: 1.1 } },
  { id: 'teacher', name: 'Former Teacher', desc: 'Explains things clearly. Grades your work silently.', social: 1.2, skill: { medicine: 1.1, engineering: 1.1 } },
  { id: 'hoarder', name: 'Hoarder', desc: 'Has a box of things that might be useful. It is the size of a car.', skill: { scavenging: 1.2 }, conflict: 1.2 },
  { id: 'musician', name: 'Musician', desc: 'Plays guitar by the fire. Mood improves for everyone nearby, mostly.', mood: 5, social: 1.3 },
  { id: 'farmhand', name: 'Farm-Raised', desc: 'Knows when it will rain by looking at cows. There are no cows. Still knows.', skill: { farming: 1.2, cooking: 1.1 } },
];

export const TRAIT_MAP: ReadonlyMap<string, TraitDef> = new Map(TRAITS.map((t) => [t.id, t]));

export const FIRST_NAMES: readonly string[] = [
  'Ada', 'Abe', 'Amara', 'Anton', 'Bea', 'Bram', 'Calla', 'Caleb', 'Dara', 'Desmond', 'Edie', 'Emeka', 'Fern', 'Felix', 'Greta', 'Gus',
  'Hana', 'Hollis', 'Ines', 'Ivo', 'June', 'Jonah', 'Kaia', 'Kofi', 'Lark', 'Leo', 'Mabel', 'Marek', 'Nell', 'Nico', 'Odile', 'Omar',
  'Pia', 'Pavel', 'Quinn', 'Rosa', 'Rafe', 'Sela', 'Sami', 'Tova', 'Theo', 'Uma', 'Ulric', 'Vera', 'Vik', 'Wren', 'Wes', 'Xochi',
  'Yara', 'Yusuf', 'Zora', 'Zeke', 'Bette', 'Cyril', 'Delphine', 'Eamon', 'Farah', 'Gideon', 'Hester', 'Idris', 'Jo', 'Kit', 'Lupe',
  'Mo', 'Noor', 'Otis', 'Priya', 'Rufus', 'Sunny', 'Tam', 'Valentin', 'Winnie', 'Ximena', 'Yosef', 'Zainab', 'Arlo', 'Birdie', 'Cass',
  'Dov', 'Elsa', 'Flint', 'Goldie', 'Hugo', 'Imani', 'Jasper', 'Kenji', 'Lorna', 'Milo', 'Nadia', 'Orla', 'Percy', 'Ruth', 'Silas',
  'Tilda', 'Vic', 'Walt', 'Agnes', 'Basil', 'Corin', 'Dot', 'Ezra', 'Freya', 'Gil', 'Ola', 'Ravi', 'Sol', 'Thea',
];

export const LAST_NAMES: readonly string[] = [
  'Abara', 'Ashdown', 'Bell', 'Brannigan', 'Castell', 'Chu', 'Dalloway', 'Dube', 'Ekwueme', 'Ferrante', 'Fisk', 'Galloway', 'Garza',
  'Hale', 'Haddad', 'Ibarra', 'Ivers', 'Jansen', 'Joshi', 'Kowal', 'Kaur', 'Lindqvist', 'Lowe', 'Mbatha', 'Moreau', 'Nakamura', 'Nunez',
  'Okafor', 'Orr', 'Pike', 'Petrov', 'Quell', 'Ramos', 'Reyes', 'Sato', 'Sorensen', 'Tamm', 'Thorne', 'Ueda', 'Underhill', 'Vance',
  'Varga', 'Webb', 'Whitlock', 'Xu', 'Yoon', 'Yilmaz', 'Zeller', 'Ambrose', 'Birch', 'Coyle', 'Drummond', 'Eklund', 'Fairweather',
  'Gaunt', 'Hollow', 'Iqbal', 'Jessup', 'Kerrigan', 'Larkin', 'Marsh', 'Novak', 'Oduya', 'Pruitt', 'Quayle', 'Rook', 'Salt', 'Tierney',
  'Upton', 'Voss', 'Wilde', 'Yates', 'Zamora', 'Achebe', 'Bardot', 'Crane', 'Dunmore', 'Esposito', 'Flores', 'Greer', 'Hartley', 'Mendez',
];

/** Short barks keyed by situation, with trait-flavored variants. {name} is replaced. */
export const BARKS: Record<string, { any: string[]; trait?: Record<string, string[]> }> = {
  idle: {
    any: ['Quiet day. Suspicious.', 'Anyone seen my good gloves?', 'Smells like rain.', 'I counted the beans again. Still beans.'],
    trait: {
      optimist: ['Lights’ll be on by spring. You watch.'],
      gloomy: ['Lovely day for something to go wrong.'],
      musician: ['I wrote a song about the water pump. It’s mostly about hope.'],
      hoarder: ['Don’t throw that out. I said don’t throw that out.'],
    },
  },
  hungry: { any: ['Is it dinner yet?', 'My stomach is filing a complaint.'], trait: { big_eater: ['I could eat a raider. Not literally. Mostly.'] } },
  tired: { any: ['I’m going to sleep standing up.', 'Five more minutes. Then bed. Then forever.'], trait: { insomniac: ['Tired? Me? Been tired since the collapse.'] } },
  danger: { any: ['Raiders! Get inside!', 'Movement on the road!'], trait: { brave: ['Finally. Something to hit.'], coward: ['Nope. Nope. Inside. Now.'] } },
  work_farm: { any: ['These potatoes won’t dig themselves.', 'Soil’s dry. Fetching water.'], trait: { green_thumb: ['Grow, my lovelies.'] } },
  work_build: { any: ['Measure twice, curse once.', 'Hand me the nails.'], trait: { handy: ['That wall was crooked. Was. Past tense.'] } },
  work_scavenge: { any: ['Heading out. Back before dark.', 'Market Row looked picked clean. I’ll look again.'], trait: { scrounger: ['There’s always one more drawer.'] } },
  work_guard: { any: ['Eyes on the road.', 'Quiet out there. Too quiet. Sorry, I always wanted to say that.'], trait: { ex_security: ['Nobody gets past my checkpoint. It’s a chair, but it’s my chair.'] } },
  work_cook: { any: ['Soup’s on. It’s always soup.', 'Who used the last of the salt?'], trait: { cook: ['Order up! Table four! There is no table four.'] } },
  thanks: { any: ['Thanks, boss.', 'You’re all right, you know that?'], trait: { charmer: ['If I had a hat I’d tip it.'] } },
  injured: { any: ['I’m fine. I’m mostly fine. Get the nurse.', 'Something’s broken. Hopefully not me.'] },
  restored: { any: ['The lights! Look at the lights!', 'Running water. I could cry.'], trait: { gloomy: ['Huh. Okay. That’s actually good.'] } },
};
