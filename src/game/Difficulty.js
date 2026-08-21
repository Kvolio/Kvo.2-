// Difficulty presets and a fully custom option.
//
// IMPORTANT: no difficulty setting ever alters the armour or the penetration
// model. The Tiger's 100 mm front plate is 100 mm on Easy and 100 mm on
// Simulation. What changes is spotting help, crew skill floors, how much HUD
// you get, how aggressive the enemy is, how long repairs take, and how much
// the campaign forgives. Challenge comes from the battlefield, not from
// secretly buffing a T-34's gun.

export const DIFFICULTY = {
  easy: {
    id: 'easy', label: 'Easy',
    description: 'Forgiving. The crew is quick, the enemy is slow, and losses are recoverable.',
    // --- Spotting and information ---
    spottingAid: 1.0,          // contact markers persist and are drawn generously
    showContactMarkers: true,
    identificationAid: 0.6,    // types are named for you much sooner
    showRangeToTarget: true,
    showPenetrationPreview: true,
    showDamageDiagram: true,
    // --- Crew ---
    crewSkillFloor: 0.55,
    crewStressRate: 0.5,
    crewVulnerability: 0.55,
    commanderVulnerability: 0.45,
    permanentDeath: false,
    // --- Enemy ---
    enemyAggression: 0.35, enemySkill: 0.35, enemyReaction: 1.6,
    // --- Damage ---
    componentDamage: 0.8, fireSeverity: 0.6,
    // --- Repair and recovery ---
    repairTime: 0.55, repairRisk: 0.4, recoveryDelay: 0.6,
    // --- Logistics ---
    supplyMultiplier: 1.5, reserveCrew: 14, sparesMultiplier: 1.6,
  },

  normal: {
    id: 'normal', label: 'Normal',
    description: 'The intended experience. Realistic damage, limited help, a fair fight.',
    spottingAid: 0.5, showContactMarkers: true, identificationAid: 0.25,
    showRangeToTarget: true, showPenetrationPreview: false, showDamageDiagram: true,
    crewSkillFloor: 0.35, crewStressRate: 0.8, crewVulnerability: 0.8,
    commanderVulnerability: 0.7, permanentDeath: false,
    enemyAggression: 0.55, enemySkill: 0.5, enemyReaction: 1.0,
    componentDamage: 1.0, fireSeverity: 0.85,
    repairTime: 0.8, repairRisk: 0.75, recoveryDelay: 0.85,
    supplyMultiplier: 1.0, reserveCrew: 10, sparesMultiplier: 1.0,
  },

  hard: {
    id: 'hard', label: 'Hard',
    description: 'Aggressive enemy, dangerous fires, thin supplies, long repairs.',
    spottingAid: 0.2, showContactMarkers: false, identificationAid: 0.05,
    showRangeToTarget: false, showPenetrationPreview: false, showDamageDiagram: true,
    crewSkillFloor: 0.2, crewStressRate: 1.15, crewVulnerability: 1.0,
    commanderVulnerability: 0.95, permanentDeath: true,
    enemyAggression: 0.78, enemySkill: 0.7, enemyReaction: 0.75,
    componentDamage: 1.15, fireSeverity: 1.2,
    repairTime: 1.25, repairRisk: 1.2, recoveryDelay: 1.2,
    supplyMultiplier: 0.75, reserveCrew: 8, sparesMultiplier: 0.7,
  },

  simulation: {
    id: 'simulation', label: 'Simulation',
    description: 'No markers. No help. Permanent deaths. The Tiger is lost when it is lost.',
    spottingAid: 0, showContactMarkers: false, identificationAid: 0,
    showRangeToTarget: false, showPenetrationPreview: false, showDamageDiagram: false,
    crewSkillFloor: 0.1, crewStressRate: 1.35, crewVulnerability: 1.15,
    commanderVulnerability: 1.15, permanentDeath: true,
    enemyAggression: 0.85, enemySkill: 0.78, enemyReaction: 0.6,
    componentDamage: 1.25, fireSeverity: 1.35,
    repairTime: 1.5, repairRisk: 1.4, recoveryDelay: 1.45,
    supplyMultiplier: 0.6, reserveCrew: 6, sparesMultiplier: 0.55,
    // Simulation-only strictness
    limitedRadioInformation: true,
    realisticSoundOcclusion: true,
    noCrosshair: true,
    commanderDeathEndsMission: true,
  },
};

/** Every knob, for the Custom screen. */
export const CUSTOM_OPTIONS = [
  { key: 'enemySkill', label: 'Enemy gunnery', min: 0, max: 1, step: 0.05 },
  { key: 'enemyAggression', label: 'Enemy aggression', min: 0, max: 1, step: 0.05 },
  { key: 'enemyReaction', label: 'Enemy reaction time', min: 0.4, max: 2.0, step: 0.1, inverse: true },
  { key: 'crewSkillFloor', label: 'Crew minimum skill', min: 0, max: 0.8, step: 0.05 },
  { key: 'crewStressRate', label: 'Crew stress', min: 0.3, max: 1.8, step: 0.1 },
  { key: 'crewVulnerability', label: 'Crew vulnerability', min: 0.3, max: 1.5, step: 0.05 },
  { key: 'commanderVulnerability', label: 'Commander vulnerability', min: 0.2, max: 1.5, step: 0.05 },
  { key: 'permanentDeath', label: 'Permanent crew deaths', type: 'bool' },
  { key: 'spottingAid', label: 'Spotting assistance', min: 0, max: 1, step: 0.1 },
  { key: 'showContactMarkers', label: 'Contact markers', type: 'bool' },
  { key: 'identificationAid', label: 'Identification assistance', min: 0, max: 1, step: 0.05 },
  { key: 'showRangeToTarget', label: 'Range readout', type: 'bool' },
  { key: 'showPenetrationPreview', label: 'Penetration preview', type: 'bool' },
  { key: 'showDamageDiagram', label: 'Damage diagram', type: 'bool' },
  { key: 'componentDamage', label: 'Component damage', min: 0.5, max: 1.6, step: 0.05 },
  { key: 'fireSeverity', label: 'Fire severity', min: 0.4, max: 1.8, step: 0.1 },
  { key: 'repairTime', label: 'Repair duration', min: 0.4, max: 2.0, step: 0.1 },
  { key: 'repairRisk', label: 'Repair party risk', min: 0.2, max: 1.6, step: 0.1 },
  { key: 'recoveryDelay', label: 'Recovery response time', min: 0.4, max: 2.0, step: 0.1 },
  { key: 'supplyMultiplier', label: 'Supply availability', min: 0.4, max: 2.0, step: 0.1 },
  { key: 'sparesMultiplier', label: 'Spare parts availability', min: 0.3, max: 2.0, step: 0.1 },
  { key: 'reserveCrew', label: 'Reserve crewmen', min: 3, max: 20, step: 1 },
];

export function makeDifficulty(id = 'normal', overrides = {}) {
  const base = DIFFICULTY[id] || DIFFICULTY.normal;
  return { ...base, ...overrides, id: overrides.id || (Object.keys(overrides).length ? 'custom' : base.id) };
}

/**
 * The line the game shows when someone asks whether difficulty changes the
 * armour. It does not, and this is written down so nobody has to wonder.
 */
export const ARMOUR_GUARANTEE =
  'No difficulty setting changes armour thickness, projectile penetration, or the '
  + 'result of any shot. Those come from the vehicle data and the physics, on every '
  + 'setting. Difficulty changes how much the game helps you, how good the enemy is, '
  + 'and how much the campaign forgives.';
