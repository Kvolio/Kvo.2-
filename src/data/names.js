// Historically plausible German personnel names and the Panzertruppe rank
// structure. Reserve crewmen are generated from these, so no two replacements
// are the same man.

export const SURNAMES = [
  'Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker',
  'Schulz', 'Hoffmann', 'Schäfer', 'Koch', 'Bauer', 'Richter', 'Klein', 'Wolf',
  'Schröder', 'Neumann', 'Schwarz', 'Zimmermann', 'Braun', 'Krüger', 'Hofmann',
  'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Schmitt', 'Köhler', 'Herrmann',
  'König', 'Walter', 'Mayer', 'Huber', 'Kaiser', 'Fuchs', 'Peters', 'Lang', 'Scholz',
  'Möller', 'Weiß', 'Jung', 'Hahn', 'Schubert', 'Vogel', 'Friedrich', 'Keller',
  'Günther', 'Frank', 'Berger', 'Winkler', 'Roth', 'Beck', 'Lorenz', 'Baumann',
  'Franke', 'Albrecht', 'Schuster', 'Simon', 'Ludwig', 'Böhm', 'Winter', 'Kraus',
  'Martin', 'Schumacher', 'Krämer', 'Vogt', 'Stein', 'Jäger', 'Otto', 'Sommer',
  'Groß', 'Seidel', 'Heinrich', 'Brandt', 'Haas', 'Schreiber', 'Graf', 'Schulze',
  'Dietrich', 'Ziegler', 'Kuhn', 'Kühn', 'Pohl', 'Engel', 'Horn', 'Busch', 'Bergmann',
  'Thomas', 'Voigt', 'Sauer', 'Arnold', 'Wolff', 'Pfeiffer',
];

export const FORENAMES = [
  'Hans', 'Karl', 'Heinrich', 'Wilhelm', 'Otto', 'Friedrich', 'Werner', 'Kurt',
  'Walter', 'Ernst', 'Paul', 'Fritz', 'Gerhard', 'Helmut', 'Günther', 'Josef',
  'Rudolf', 'Erich', 'Hermann', 'Franz', 'Georg', 'Alfred', 'Wolfgang', 'Herbert',
  'Willi', 'Bruno', 'Max', 'Albert', 'Anton', 'Theodor', 'Ludwig', 'Rolf', 'Horst',
  'Klaus', 'Dieter', 'Siegfried', 'Bernhard', 'Konrad', 'Emil', 'August', 'Erwin',
  'Adolf', 'Hugo', 'Richard', 'Martin', 'Alois', 'Kaspar', 'Lothar', 'Manfred',
  'Reinhold', 'Eberhard', 'Gustav', 'Johann', 'Peter', 'Michael', 'Jürgen',
];

/** Panzertruppe ranks appropriate to each crew position in a heavy tank battalion. */
export const RANKS = {
  commander: ['Leutnant', 'Oberleutnant', 'Oberfeldwebel', 'Feldwebel'],
  gunner:    ['Unteroffizier', 'Obergefreiter', 'Feldwebel'],
  loader:    ['Gefreiter', 'Obergefreiter', 'Panzerschütze'],
  driver:    ['Unteroffizier', 'Obergefreiter', 'Gefreiter'],
  radio:     ['Obergefreiter', 'Gefreiter', 'Unteroffizier'],
};

export const HOMETOWNS = [
  'Kassel', 'Bremen', 'Dresden', 'Nürnberg', 'Kiel', 'Erfurt', 'Münster', 'Hannover',
  'Augsburg', 'Rostock', 'Trier', 'Würzburg', 'Freiburg', 'Bamberg', 'Lübeck',
  'Görlitz', 'Koblenz', 'Regensburg', 'Ulm', 'Paderborn', 'Passau', 'Flensburg',
  'Oldenburg', 'Heilbronn', 'Gotha', 'Wismar', 'Fulda', 'Celle', 'Landshut',
];

/**
 * Personality traits. These change what a man SAYS and how he handles pressure —
 * they are not stat bonuses in disguise.
 */
export const TRAITS = [
  { id: 'steady',    label: 'Steady',        desc: 'Talks less under fire. Stress rises slowly.',           stressResist: +0.18, chatter: -0.3 },
  { id: 'nervy',     label: 'Nervy',         desc: 'Quick, but rattles easily.',                            stressResist: -0.15, reaction: +0.10, chatter: +0.35 },
  { id: 'veteran',   label: 'Old hand',      desc: 'Has seen it before. Nothing is new.',                   stressResist: +0.22, xpGain: -0.15 },
  { id: 'eager',     label: 'Eager',         desc: 'Learns fast. Sometimes too fast.',                      xpGain: +0.30, stressResist: -0.08 },
  { id: 'meticulous',label: 'Meticulous',    desc: 'Slower, but rarely makes mistakes.',                    errorRate: -0.45, speed: -0.08 },
  { id: 'quick',     label: 'Quick-handed',  desc: 'Fast, occasionally clumsy.',                            speed: +0.12, errorRate: +0.25 },
  { id: 'mechanic',  label: 'Trained fitter','desc': 'Worked in a workshop before the war.',                repair: +0.28 },
  { id: 'stoic',     label: 'Stoic',         desc: 'Says nothing. Keeps working.',                          stressResist: +0.12, chatter: -0.5, fatigueResist: +0.15 },
  { id: 'talkative', label: 'Talkative',     desc: 'Fills every silence on the intercom.',                  chatter: +0.6 },
  { id: 'sharp_eyed',label: 'Sharp-eyed',    desc: 'Sees things before anyone else does.',                  spotting: +0.25 },
  { id: 'religious', label: 'Devout',        desc: 'Prays before every action. It seems to help him.',      stressResist: +0.10 },
  { id: 'reckless',  label: 'Reckless',      desc: 'Will do anything you ask, including the stupid things.', stressResist: +0.06, errorRate: +0.20, repair: +0.10 },
];

export function makeName(rng) {
  return `${rng.pick(FORENAMES)} ${rng.pick(SURNAMES)}`;
}
