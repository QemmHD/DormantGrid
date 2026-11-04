// The daily Town Board: a short, human summary of what happened overnight.
// The client fills placeholders from sim stats and picks 3-5 lines per day.
// Placeholders: {name} {other} {n} {item} {district} {crop} {day}

export type TownBoardTopic =
  | 'headline'
  | 'food'
  | 'build'
  | 'scavenge'
  | 'social'
  | 'injury'
  | 'arrival'
  | 'farm'
  | 'quiet'
  | 'raid'
  | 'weather'
  | 'restored';

export const TOWN_BOARD: Record<TownBoardTopic, readonly string[]> = {
  headline: [
    'THE HAVEN HERALD, DAY {day}. Price: one smile.',
    'TOWN BOARD, DAY {day}. Read it, then put it back.',
    'DAY {day}. Still here. Still arguing about the kettle.',
  ],
  food: [
    'Kitchen served {n} meals. {name} insists the stew had carrots in it. The jury is out.',
    'Food stores are healthy. {name} has started labelling jars, which is either organization or a cry for help.',
    'Food is running low. Please stop "testing" the preserves.',
    '{name} cooked something new. Nobody has died. Five stars.',
  ],
  build: [
    '{name} finished {n} pieces of building work overnight and would like everyone to notice.',
    'The east wall is up. {name} has signed it, in pencil, very small.',
    'Repairs done on {n} damaged pieces. {name} says the roof was "mostly vibes" before.',
  ],
  scavenge: [
    '{name} came back from {district} with {n} {item} and a story nobody believes.',
    'A scavenging run to {district} brought back {n} {item}. Also a lamp. Nobody asked for the lamp.',
    '{name} mapped a new street in {district}. It has a bakery. The bakery has no bread. Hope remains.',
  ],
  social: [
    '{name} and {other} are friends now. They will deny this.',
    '{name} and {other} had words about whose turn it was on dishes. Both were wrong.',
    'Story night by the fire. {name} told the one about the drone and the shopping trolley again.',
    '{name} taught {other} to whistle. This is being reviewed by the council.',
  ],
  injury: [
    '{name} twisted an ankle on the Orchard Row stairs. Recovering with dignity and a crutch.',
    '{name} was hurt on a run to {district}. {other} carried them back. Heroes, both.',
  ],
  arrival: [
    'New face: {name} arrived at the gate with a backpack, a dog-eared map and good manners.',
    '{name} followed our smoke from {district}. Says they can cook. We will see.',
  ],
  farm: [
    'The {crop} are coming up nicely. {name} has been talking to them. It seems to help.',
    '{n} {crop} harvested. The goats tried to help. They did not help.',
    'Frost warning tonight. Cover the seedlings, or explain yourself to {name}.',
  ],
  quiet: [
    'Nothing happened overnight. Glorious, suspicious nothing.',
    'A quiet night. Somebody snored. We all know who.',
  ],
  raid: [
    'Raid repelled at the {district} fence. {name} would like a medal and a nap.',
    'We lost some {item} in the raid. We kept everyone. That is the right trade.',
    'Ashline scouts spotted near the river. Keep the gate shut and the kettle on.',
  ],
  weather: [
    'Rain overnight. The barrels are full and so are the boots.',
    'Fog this morning. Walk in pairs and say hello loudly.',
    'Storm last night. The roof held. Mostly.',
  ],
  restored: [
    'Lights stayed on all night in {district}. Somebody left a window open just to look at them.',
    'Water pressure in {district} is back. {name} took a fifteen-minute shower and is unrepentant.',
  ],
};
