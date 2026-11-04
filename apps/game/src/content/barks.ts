// Short survivor barks, keyed by situation. `{name}` = speaker,
// `{other}` = another survivor, `{player}` = player username.

export type BarkSituation =
  | 'idle'
  | 'hungry'
  | 'tired'
  | 'danger'
  | 'happy'
  | 'working'
  | 'greeting'
  | 'thanks'
  | 'injured'
  | 'raining'
  | 'restored';

export const BARKS: Record<BarkSituation, readonly string[]> = {
  idle: [
    'Somebody keeps moving my mug. I know it\'s you, {other}.',
    'Quiet day. I don\'t trust it.',
    'I used to commute two hours. I don\'t miss it. I miss the bakery.',
    'If you need me, I\'ll be thinking about soup.',
    'You ever notice the birds came back? They know something.',
    'I counted the stars last night. Got to forty and lost my place.',
    'Remember traffic? Me neither, on purpose.',
  ],
  hungry: [
    'My stomach\'s filing a complaint.',
    'Is there anything that isn\'t beans? Asking for everyone.',
    'I\'d trade my good boots for a hot meal. Not the boots I\'m wearing.',
    'Kitchen\'s quiet. That\'s never good.',
    'I could eat a goat. Don\'t tell the goats.',
    'Food\'s getting thin, boss.',
  ],
  tired: [
    'I\'m running on fumes and spite.',
    'If I sit down, I\'m not getting up.',
    'Five more minutes. Then bed. Then five more minutes.',
    'My eyes are doing that thing again.',
    'Can somebody else be brave tomorrow?',
    'Bed. Soon. Please.',
  ],
  danger: [
    'Machines on the street! Get inside!',
    'Movement by the fence. Not one of ours.',
    'Drone! Down, down, down!',
    'They\'re coming in from the east!',
    'Ashline colours. Get the gate!',
    'That\'s a big one. That\'s a really big one.',
    'Grab what you can and fall back to the fire!',
  ],
  happy: [
    'Hot water. I\'m going to cry. Give me a minute.',
    'Did you see the lights on Cray Street? I did a little dance.',
    'Feels like a town again.',
    'Good soup, good people, no drones. Best day this year.',
    'I fixed the radio. It only plays static, but it\'s our static.',
    '{other} laughed at my joke. Mark the calendar.',
  ],
  working: [
    'Measure twice, swear once.',
    'Hand me that. No, the other that.',
    'These beams were not built to be taken apart. Too bad for them.',
    'Almost there. Almost. There.',
    'If this falls on me, tell {other} it was their fault.',
    'Good timber. Somebody cared about this house once.',
    'Hauling. Don\'t talk to me, I\'m counting.',
  ],
  greeting: [
    'Hey, {player}. Back in one piece. Nice.',
    'Morning, boss. Or whatever time it is.',
    'There\'s our leader. Try to look leaderly.',
    'Oh good, you\'re here. Something\'s on fire. Kidding. Mostly.',
    '{player}! Bring anything shiny?',
    'Hey. Don\'t step on the seedlings.',
  ],
  thanks: [
    'Thanks. I owe you one. Possibly two.',
    'You didn\'t have to do that. Glad you did.',
    'That\'s going straight to the top of my good list.',
    'Appreciated. Really.',
    'I\'ll remember that. In the good way.',
    'Look at you, being decent. It suits you.',
  ],
  injured: [
    'I\'m fine. I\'m fine. I\'m not fine.',
    'Somebody get the bandages. And a chair. And my mum.',
    'That\'s going to scar. Good story, though.',
    'Can\'t put weight on it. Can\'t put anything on it.',
    'Don\'t look at it. I\'m not looking at it.',
    'Need a medic. Or a very confident amateur.',
  ],
  raining: [
    'Rain\'s good for the crops. Bad for my hair.',
    'Somebody put the buckets out!',
    'Roof\'s leaking over bed three. Again.',
    'I like the sound. Makes the machines quieter.',
    'Soaked through. Worth it.',
    'Don\'t drink it until it\'s boiled. Yes, I mean you.',
  ],
  restored: [
    'The lights! Look at the lights!',
    'Water pressure. Actual water pressure.',
    'I can hear the pumps from here. Best song I know.',
    'We did that. Us. With our hands.',
    'This street\'s ours now.',
    'Feels safer. Feels like I can breathe.',
  ],
};
