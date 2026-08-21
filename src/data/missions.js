// ===========================================================================
//  THE ZITADELLE CAMPAIGN
//
//  s.Pz.Abt. 503 fought on the southern face of the salient with Armeeabteilung
//  Kempf, east of Belgorod, from 5 July 1943. The missions follow that arc:
//  breaking the first belt, grinding through the second, the flank fighting
//  around Prokhorovka, and then the long withdrawal after 13 July.
//
//  Not one of them is "destroy every enemy tank".
// ===========================================================================

export const MISSION_TYPE = {
  BREAKTHROUGH: 'breakthrough',
  DEFEND: 'defend',
  AMBUSH: 'ambush',
  ESCORT: 'escort',
  RECON: 'recon',
  WITHDRAWAL: 'withdrawal',
  HUNTER: 'hunter',
  NIGHT: 'night action',
  FOG: 'action in fog',
  LAST_STAND: 'last stand',
  RECOVERY: 'recovery',
  FIELD_REPAIR: 'field repair',
  SUPPLY_ESCORT: 'supply escort',
  DEFENSIVE: 'defensive engagement',
};

export const MISSIONS = [
  {
    id: 'zitadelle_01',
    title: 'The First Belt',
    date: '5 July 1943',
    type: MISSION_TYPE.BREAKTHROUGH,
    timeOfDay: 'morning', weather: 'clear',
    terrainSeed: 19430705,
    terrain: { size: 3000, amplitude: 16, ridges: 4, villages: 2, woods: 6, trenches: 2, minefields: 2 },
    briefing: {
      situation: 'The offensive opens at 05:00. Sixth Panzer Division goes in on our left; '
        + 'we lead for Kampfgruppe Oppeln on the right. Soviet 81st Rifle Division holds '
        + 'the first defensive belt with dug-in guns and a minefield of unknown depth.',
      objective: 'Break through the first defensive belt and secure the ridge beyond Height 218.7.',
      expectedOpposition: [
        { type: 'zis3_atg', count: '4–6', confidence: 'reported', note: 'dug in along the tree line' },
        { type: 'k53_atg', count: '2–4', confidence: 'reported' },
        { type: 't34_43', count: '3–5', confidence: 'probable', note: 'divisional armour in reserve' },
      ],
      friendlyForces: [
        { type: 'pz4h', count: 3, callsign: 'Kampfgruppe Oppeln' },
        { type: 'stug3g', count: 2 },
      ],
      terrainNotes: 'Open rye fields with a shallow ridge running east–west. Tree lines on the '
        + 'field boundaries — assume every one of them holds a gun.',
      intelligenceQuality: 0.65,
      warnings: [
        'Minefields are reported but not surveyed. Stay on the axis of advance.',
        'Anti-tank guns will hold their fire until you are close. They always do.',
      ],
    },
    objectives: [
      { id: 'reach_ridge', label: 'Reach the ridge line beyond Height 218.7', kind: 'reach', required: true },
      { id: 'suppress_guns', label: 'Neutralise the anti-tank guns in the tree line', kind: 'destroy', target: 'gun', count: 3, required: false },
      { id: 'survive', label: 'Bring the Tiger back', kind: 'survive', required: true },
    ],
    enemyForce: [
      { type: 'zis3_atg', count: 5, posture: 'ambush', skill: 0.55 },
      { type: 'k53_atg', count: 3, posture: 'ambush', skill: 0.45 },
      { type: 't34_43', count: 4, posture: 'reserve', skill: 0.45 },
    ],
    friendlyForce: [
      { type: 'pz4h', count: 3, callsign: 'Panzer' },
      { type: 'stug3g', count: 2, callsign: 'Sturmgeschütz' },
    ],
    tutorial: true,
  },

  {
    id: 'zitadelle_02',
    title: 'Counterattack at Yakovlevo',
    date: '6 July 1943',
    type: MISSION_TYPE.DEFENSIVE,
    timeOfDay: 'afternoon', weather: 'clear',
    terrainSeed: 19430706,
    terrain: { size: 3200, amplitude: 20, ridges: 5, villages: 1, woods: 5 },
    briefing: {
      situation: 'We hold ground taken this morning. Soviet 1st Tank Army is committing '
        + 'armour against the salient shoulder. Expect a battalion-strength counterattack.',
      objective: 'Hold the position east of the village until the grenadiers dig in.',
      expectedOpposition: [
        { type: 't34_43', count: '8–12', confidence: 'confirmed', note: 'brigade strength' },
        { type: 't70m', count: '3–6', confidence: 'probable' },
        { type: 'su122', count: '0–2', confidence: 'possible' },
      ],
      friendlyForces: [{ type: 'pz4h', count: 2 }, { type: 'pz3m', count: 2 }],
      terrainNotes: 'A long forward slope in front of you. Use it. They must cross a kilometre '
        + 'of open ground to reach you, and your gun reaches further than theirs.',
      intelligenceQuality: 0.8,
      warnings: ['They will come in numbers. Count your ammunition before you count theirs.'],
    },
    objectives: [
      { id: 'hold', label: 'Hold the position for 20 minutes', kind: 'hold', seconds: 1200, required: true },
      { id: 'losses', label: 'Do not lose more than one friendly vehicle', kind: 'protect', required: false },
    ],
    enemyForce: [
      { type: 't34_43', count: 10, posture: 'advance', skill: 0.5, waves: 2 },
      { type: 't70m', count: 4, posture: 'advance', skill: 0.4 },
      { type: 'su122', count: 2, posture: 'support', skill: 0.5 },
    ],
    friendlyForce: [{ type: 'pz4h', count: 2 }, { type: 'pz3m', count: 2 }],
  },

  {
    id: 'zitadelle_03',
    title: 'The Gun Line',
    date: '7 July 1943',
    type: MISSION_TYPE.AMBUSH,
    timeOfDay: 'morning', weather: 'cloudy',
    terrainSeed: 19430707,
    terrain: { size: 3000, amplitude: 14, ridges: 6, woods: 8, villages: 1 },
    briefing: {
      situation: 'Reconnaissance reports a Soviet gun line across our axis of advance. '
        + 'At least one battery is 85 mm — those are the anti-aircraft guns they have '
        + 'been putting into the anti-tank role. Take them seriously.',
      objective: 'Locate and destroy the gun line before the grenadier battalion advances.',
      expectedOpposition: [
        { type: 'k52_aa', count: '2–4', confidence: 'reported', note: 'THESE WILL PENETRATE YOUR FRONT PLATE', danger: true },
        { type: 'zis3_atg', count: '4–8', confidence: 'confirmed' },
        { type: 't34_43', count: '0–4', confidence: 'possible' },
      ],
      friendlyForces: [{ type: 'stug3g', count: 2 }],
      terrainNotes: 'Broken ground with copses and two balkas. The guns will be sited to cover '
        + 'the open approaches. Work the dead ground.',
      intelligenceQuality: 0.5,
      warnings: [
        'The 85 mm gun defeats 100 mm at a kilometre. Do not sit in the open in front of one.',
        'Gun positions are extremely difficult to see until they fire.',
      ],
    },
    objectives: [
      { id: 'kill_guns', label: 'Destroy the anti-tank guns', kind: 'destroy', target: 'gun', count: 5, required: true },
      { id: 'survive', label: 'Bring the Tiger back', kind: 'survive', required: true },
    ],
    enemyForce: [
      { type: 'k52_aa', count: 3, posture: 'ambush', skill: 0.7, concealment: 0.6 },
      { type: 'zis3_atg', count: 6, posture: 'ambush', skill: 0.55 },
      { type: 't34_43', count: 3, posture: 'reserve', skill: 0.5 },
    ],
    friendlyForce: [{ type: 'stug3g', count: 2 }],
  },

  {
    id: 'zitadelle_04',
    title: 'Track Repair Under Fire',
    date: '8 July 1943',
    type: MISSION_TYPE.FIELD_REPAIR,
    timeOfDay: 'afternoon', weather: 'clear',
    terrainSeed: 19430708,
    terrain: { size: 2600, amplitude: 18, ridges: 5, woods: 4, balkas: 4 },
    briefing: {
      situation: 'Tiger 104 has thrown a track in open ground and cannot move. Its crew are '
        + 'working on it under observed fire. You are to get to them and cover the repair.',
      objective: 'Reach Tiger 104 and protect it until the track is back on.',
      expectedOpposition: [
        { type: 't34_43', count: '4–6', confidence: 'confirmed' },
        { type: 'zis3_atg', count: '2–4', confidence: 'probable' },
      ],
      friendlyForces: [{ type: 'famo', count: 1, note: 'recovery half-track standing by' }],
      terrainNotes: 'A balka runs north–south across the approach. It is dead ground, and it '
        + 'will also swallow a Tiger if you take it too fast.',
      intelligenceQuality: 0.7,
      warnings: ['Your own track is not in the best condition either. Watch your ground.'],
    },
    objectives: [
      { id: 'reach_104', label: 'Reach Tiger 104', kind: 'reach', required: true },
      { id: 'protect_repair', label: 'Keep Tiger 104 alive until the repair is complete', kind: 'protect', seconds: 900, required: true },
    ],
    enemyForce: [
      { type: 't34_43', count: 5, posture: 'advance', skill: 0.55 },
      { type: 'zis3_atg', count: 3, posture: 'ambush', skill: 0.5 },
    ],
    friendlyForce: [{ type: 'famo', count: 1 }],
    scriptedDamage: { component: 'track_r', atSeconds: 240 },
  },

  {
    id: 'zitadelle_05',
    title: 'Morning Fog',
    date: '9 July 1943',
    type: MISSION_TYPE.FOG,
    timeOfDay: 'morning', weather: 'fog',
    terrainSeed: 19430709,
    terrain: { size: 2800, amplitude: 12, ridges: 4, woods: 7, villages: 2 },
    briefing: {
      situation: 'Heavy ground fog. Visibility is under three hundred metres and will not lift '
        + 'before mid-morning. Soviet armour is believed to be moving under it.',
      objective: 'Screen the divisional flank until the fog lifts.',
      expectedOpposition: [
        { type: 't34_43', count: 'unknown', confidence: 'unconfirmed' },
        { type: 'su76m', count: 'unknown', confidence: 'unconfirmed' },
      ],
      friendlyForces: [{ type: 'pz4h', count: 2 }],
      terrainNotes: 'You will hear them before you see them. Keep the hatch open.',
      intelligenceQuality: 0.25,
      warnings: [
        'Intelligence is very poor. Assume the report is wrong.',
        'At this visibility they will be inside four hundred metres before you see anything. '
          + 'That is close enough for their guns to matter.',
      ],
    },
    objectives: [
      { id: 'screen', label: 'Hold the flank until the fog lifts', kind: 'hold', seconds: 1500, required: true },
      { id: 'identify', label: 'Correctly identify enemy vehicles before engaging', kind: 'identify', required: false },
    ],
    enemyForce: [
      { type: 't34_43', count: 6, posture: 'advance', skill: 0.5 },
      { type: 'su76m', count: 3, posture: 'flank', skill: 0.45 },
    ],
    friendlyForce: [{ type: 'pz4h', count: 2 }],
  },

  {
    id: 'zitadelle_06',
    title: 'Zveroboy',
    date: '11 July 1943',
    type: MISSION_TYPE.HUNTER,
    timeOfDay: 'afternoon', weather: 'clear',
    terrainSeed: 19430711,
    terrain: { size: 3400, amplitude: 22, ridges: 6, woods: 6, villages: 2 },
    briefing: {
      situation: 'A heavy self-propelled regiment has appeared on this sector — SU-152. '
        + 'Our people are calling them Zveroboy, beast-killers. One hit from a hundred and '
        + 'fifty-two millimetres will end this tank whether it penetrates or not.',
      objective: 'Find and destroy the heavy assault guns before they reach the crossroads.',
      expectedOpposition: [
        { type: 'su152', count: '2–3', confidence: 'confirmed', note: 'DO NOT LET THEM GET A SHOT', danger: true },
        { type: 't34_43', count: '4–8', confidence: 'confirmed' },
      ],
      friendlyForces: [{ type: 'pz4h', count: 2 }, { type: 'stug3g', count: 1 }],
      terrainNotes: 'Rolling ground with good hull-down positions on the reverse slopes. '
        + 'They are slow and they traverse by turning the whole vehicle. Use that.',
      intelligenceQuality: 0.75,
      warnings: [
        'The SU-152 will kill this Tiger frontally. Do not trade shots with one.',
        'It reloads very slowly. If you make it miss, you have thirty seconds.',
      ],
    },
    objectives: [
      { id: 'kill_su152', label: 'Destroy the heavy assault guns', kind: 'destroy', target: 'su152', count: 2, required: true },
      { id: 'hold_crossroads', label: 'Prevent any enemy vehicle reaching the crossroads', kind: 'deny', required: false },
    ],
    enemyForce: [
      { type: 'su152', count: 3, posture: 'advance', skill: 0.6 },
      { type: 't34_43', count: 6, posture: 'escort', skill: 0.55 },
    ],
    friendlyForce: [{ type: 'pz4h', count: 2 }, { type: 'stug3g', count: 1 }],
  },

  {
    id: 'zitadelle_07',
    title: 'Night on the Flank',
    date: '12 July 1943',
    type: MISSION_TYPE.NIGHT,
    timeOfDay: 'night', weather: 'clear',
    terrainSeed: 19430712,
    terrain: { size: 2800, amplitude: 16, ridges: 5, woods: 6, villages: 1 },
    briefing: {
      situation: 'Soviet infantry with anti-tank rifles and light guns are infiltrating our '
        + 'flank in the dark. There is no moon.',
      objective: 'Hold the flank through the night.',
      expectedOpposition: [
        { type: 'k53_atg', count: '3–5', confidence: 'probable' },
        { type: 't70m', count: '2–4', confidence: 'possible' },
      ],
      friendlyForces: [{ type: 'pz3m', count: 2 }],
      terrainNotes: 'You will see muzzle flashes and nothing else. Burning vehicles will be '
        + 'your only light.',
      intelligenceQuality: 0.4,
      warnings: [
        'Infantry will get close in the dark. Keep the hatch shut when they do.',
        'Firing gives your position away completely at night.',
      ],
    },
    objectives: [
      { id: 'hold_night', label: 'Hold until first light', kind: 'hold', seconds: 1800, required: true },
    ],
    enemyForce: [
      { type: 'k53_atg', count: 4, posture: 'ambush', skill: 0.5 },
      { type: 't70m', count: 3, posture: 'flank', skill: 0.45 },
      { type: 'zis3_atg', count: 2, posture: 'ambush', skill: 0.55 },
    ],
    friendlyForce: [{ type: 'pz3m', count: 2 }],
  },

  {
    id: 'zitadelle_08',
    title: 'Supply Column',
    date: '13 July 1943',
    type: MISSION_TYPE.SUPPLY_ESCORT,
    timeOfDay: 'morning', weather: 'rain',
    terrainSeed: 19430713,
    terrain: { size: 3000, amplitude: 14, ridges: 4, woods: 5, villages: 2, balkas: 3 },
    briefing: {
      situation: 'The company has not had a full ammunition allocation in two days. A column '
        + 'is coming forward this morning. Soviet armour is raiding the supply routes.',
      objective: 'Escort the ammunition column to the forward dump.',
      expectedOpposition: [
        { type: 't34_43', count: '3–6', confidence: 'probable', note: 'raiding party' },
        { type: 'su76m', count: '0–3', confidence: 'possible' },
      ],
      friendlyForces: [{ type: 'opel_blitz', count: 3 }, { type: 'sdkfz251', count: 1 }],
      terrainNotes: 'Rain has made the going soft. The trucks will bog if they leave the road.',
      intelligenceQuality: 0.6,
      warnings: [
        'If the column is lost, the company fights the next action on what is left in the bins.',
        'Trucks are not armoured. One burst will do it.',
      ],
    },
    objectives: [
      { id: 'escort', label: 'Get at least two supply trucks to the dump', kind: 'escort', count: 2, required: true },
      { id: 'all_trucks', label: 'Get all three trucks through', kind: 'escort', count: 3, required: false },
    ],
    enemyForce: [
      { type: 't34_43', count: 4, posture: 'raid', skill: 0.55 },
      { type: 'su76m', count: 2, posture: 'raid', skill: 0.45 },
    ],
    friendlyForce: [{ type: 'opel_blitz', count: 3 }, { type: 'sdkfz251', count: 1 }],
    supplyReward: true,
  },

  {
    id: 'zitadelle_09',
    title: 'Withdrawal',
    date: '17 July 1943',
    type: MISSION_TYPE.WITHDRAWAL,
    timeOfDay: 'evening', weather: 'cloudy',
    terrainSeed: 19430717,
    terrain: { size: 3400, amplitude: 20, ridges: 6, woods: 6, villages: 2 },
    briefing: {
      situation: 'Zitadelle is over. The Führer has cancelled the offensive and the divisions '
        + 'are being pulled out to meet the Soviet attack in the Orel salient. We cover the '
        + 'withdrawal. Soviet armour is following up hard.',
      objective: 'Cover the withdrawal of the division’s soft-skinned units, then break contact.',
      expectedOpposition: [
        { type: 't34_43', count: '8–14', confidence: 'confirmed', note: 'pursuing in strength' },
        { type: 'su152', count: '0–2', confidence: 'possible' },
        { type: 'kv1s', count: '0–3', confidence: 'possible' },
      ],
      friendlyForces: [{ type: 'pz4h', count: 2 }, { type: 'famo', count: 1 }],
      terrainNotes: 'You will be fighting rearward. Every position you leave, they occupy.',
      intelligenceQuality: 0.7,
      warnings: [
        'There will be no resupply during this action.',
        'A Tiger left behind on this ground will not be recovered.',
      ],
    },
    objectives: [
      { id: 'cover', label: 'Hold the delay line for 15 minutes', kind: 'hold', seconds: 900, required: true },
      { id: 'break_contact', label: 'Break contact and reach the rally point', kind: 'reach', required: true },
    ],
    enemyForce: [
      { type: 't34_43', count: 12, posture: 'pursue', skill: 0.6, waves: 3 },
      { type: 'su152', count: 2, posture: 'support', skill: 0.6 },
      { type: 'kv1s', count: 2, posture: 'advance', skill: 0.55 },
    ],
    friendlyForce: [{ type: 'pz4h', count: 2 }, { type: 'famo', count: 1 }],
    noResupply: true,
    finale: true,
  },
];

export function getMission(index) {
  return MISSIONS[Math.min(index, MISSIONS.length - 1)];
}

export const TIME_OF_DAY = {
  morning:   { sunAngle: 22, lightFactor: 0.92, ambient: 0.42, fogDensity: 0.00018, sky: '#a8b8c8', sun: '#ffe8c0' },
  afternoon: { sunAngle: 62, lightFactor: 1.00, ambient: 0.55, fogDensity: 0.00012, sky: '#8fb0d0', sun: '#fff4e0' },
  evening:   { sunAngle: 8,  lightFactor: 0.62, ambient: 0.30, fogDensity: 0.00030, sky: '#c08858', sun: '#ff9850' },
  night:     { sunAngle: -20, lightFactor: 0.10, ambient: 0.08, fogDensity: 0.00045, sky: '#0a1020', sun: '#405070' },
};

export const WEATHER = {
  clear:  { visibilityFactor: 1.00, fogMul: 1.0, rain: 0, cloud: 0.15, soundMul: 1.0, wet: 0 },
  cloudy: { visibilityFactor: 0.88, fogMul: 1.4, rain: 0, cloud: 0.65, soundMul: 1.0, wet: 0.1 },
  rain:   { visibilityFactor: 0.62, fogMul: 2.6, rain: 0.7, cloud: 0.95, soundMul: 0.75, wet: 0.8 },
  fog:    { visibilityFactor: 0.30, fogMul: 8.0, rain: 0, cloud: 0.8, soundMul: 0.85, wet: 0.35 },
};
