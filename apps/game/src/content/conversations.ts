// Small branching conversations. Each node has a speaker line and choices.
// Effects are data only; the client/sim applies them.

export interface ConvEffect {
  mood?: number; // survivor mood delta
  loyalty?: number;
  rep?: { faction: 'hearth' | 'ashline' | 'meridian'; delta: number };
  give?: { item: string; n: number };
  take?: { item: string; n: number };
  flag?: string;
}

export interface ConvChoice {
  text: string;
  next: string | null; // null ends the conversation
  effect?: ConvEffect;
  /** item the player must have to see this choice */
  requires?: { item: string; n: number };
}

export interface ConvNode {
  speaker: 'survivor' | 'player' | 'narrator' | 'trader' | 'raider';
  text: string;
  choices: ConvChoice[];
}

export interface Conversation {
  id: string;
  title: string;
  /** survivor trait that makes this conversation more likely, if any */
  trait?: string;
  start: string;
  nodes: Record<string, ConvNode>;
}

export const CONVERSATIONS: readonly Conversation[] = [
  {
    id: 'conv.the_kettle',
    title: 'The Kettle',
    trait: 'sentimental',
    start: 'a',
    nodes: {
      a: {
        speaker: 'survivor',
        text: 'Found this in the rubble on Orchard Row. It\'s a kettle. My kettle, I think. Same dent. Stupid thing to carry across town.',
        choices: [
          { text: 'Not stupid. Keep it.', next: 'keep', effect: { mood: 10, loyalty: 5 } },
          { text: 'We could use the metal.', next: 'scrap', effect: { mood: -8 } },
          { text: 'Put it by the fire. Everyone gets tea.', next: 'share', effect: { mood: 6, loyalty: 3, flag: 'kettle_shared' } },
        ],
      },
      keep: {
        speaker: 'survivor',
        text: 'Yeah. Yeah, I will. Thanks for not making me explain.',
        choices: [{ text: 'Anytime.', next: null }],
      },
      scrap: {
        speaker: 'survivor',
        text: 'Right. Of course. It\'s just metal.',
        choices: [
          { text: 'Actually, forget it. Keep it.', next: 'keep', effect: { mood: 12 } },
          { text: 'Thanks. Every bit helps.', next: null, effect: { give: { item: 'mat.scrap', n: 2 } } },
        ],
      },
      share: {
        speaker: 'survivor',
        text: 'Tea for the whole lot. I\'ll need more cups. And more tea. And honestly more water.',
        choices: [{ text: 'I\'ll see what I can find.', next: null }],
      },
    },
  },
  {
    id: 'conv.night_watch',
    title: 'Night Watch',
    trait: 'anxious',
    start: 'a',
    nodes: {
      a: {
        speaker: 'survivor',
        text: 'I keep hearing the drones at night. Even when they aren\'t there. Is that normal?',
        choices: [
          { text: 'It\'s normal. You\'re safe here.', next: 'reassure', effect: { mood: 5 } },
          { text: 'Take a watch shift. Knowing helps.', next: 'watch', effect: { loyalty: 5, flag: 'guard_volunteer' } },
          { text: 'Here. Something to help you sleep.', next: 'pills', requires: { item: 'med.painkillers', n: 1 }, effect: { mood: 12, take: { item: 'med.painkillers', n: 1 } } },
        ],
      },
      reassure: {
        speaker: 'survivor',
        text: 'You say it like you believe it. I\'ll borrow that for tonight.',
        choices: [{ text: 'Get some rest.', next: null }],
      },
      watch: {
        speaker: 'survivor',
        text: 'Me? On watch? ...Actually, yes. If I\'m awake anyway, I might as well be useful about it.',
        choices: [
          { text: 'Take the east fence. Shout if anything moves.', next: null },
          { text: 'Pair up with someone. Nobody watches alone.', next: null, effect: { mood: 4 } },
        ],
      },
      pills: {
        speaker: 'survivor',
        text: 'Oh, thank you. I won\'t take it unless I need it. Just having it helps.',
        choices: [{ text: 'That\'s the idea.', next: null }],
      },
    },
  },
  {
    id: 'conv.guild_offer',
    title: 'A Fair Price',
    start: 'a',
    nodes: {
      a: {
        speaker: 'trader',
        text: 'Lovely work on the waterworks node. Very tidy. The Guild would like to formalize our partnership. You keep the lights on; we keep the books. Small fee per household.',
        choices: [
          { text: 'Water is shared. No fees.', next: 'refuse', effect: { rep: { faction: 'meridian', delta: -10 }, flag: 'refused_meter' } },
          { text: 'What do we get?', next: 'terms' },
          { text: 'We\'ll think about it.', next: 'later' },
        ],
      },
      terms: {
        speaker: 'trader',
        text: 'Parts. Expertise. Protection from people who don\'t say please. And a seat at the table when the Core comes back on, which it will, with or without you.',
        choices: [
          { text: 'Deal, for the parts. Not the meters.', next: 'half', effect: { rep: { faction: 'meridian', delta: 5 }, give: { item: 'mat.wiring', n: 6 } } },
          { text: 'Deal.', next: 'deal', effect: { rep: { faction: 'meridian', delta: 15 } } },
          { text: 'No.', next: 'refuse', effect: { rep: { faction: 'meridian', delta: -5 } } },
        ],
      },
      half: {
        speaker: 'trader',
        text: 'Half a deal is still a deal. I\'ll have the crates sent over. We\'ll revisit the meters when you\'ve seen the invoice for the next node.',
        choices: [{ text: 'Looking forward to it.', next: null }],
      },
      deal: {
        speaker: 'trader',
        text: 'Splendid. Your people will hardly notice the meters. That\'s the beauty of good infrastructure.',
        choices: [{ text: 'Mm.', next: null, effect: { flag: 'guild_meters' } }],
      },
      refuse: {
        speaker: 'trader',
        text: 'Principles. I admire them. They\'re so expensive to maintain.',
        choices: [{ text: 'We\'ll manage.', next: null }],
      },
      later: {
        speaker: 'trader',
        text: 'Of course. The offer stands. The price may not.',
        choices: [{ text: 'Noted.', next: null }],
      },
    },
  },
];
