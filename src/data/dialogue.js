// ===========================================================================
//  CREW DIALOGUE
//
//  Every line is spoken by a specific man at a specific station over the
//  Bordsprechanlage. Lines are picked by (a) what just happened, (b) who is
//  speaking, (c) how frightened and how tired he is, and (d) his personality.
//
//  Variants exist so the same man does not say the same sentence twice in a row.
//  Calm/strained/breaking variants exist so the intercom audibly deteriorates
//  as the crew comes apart. That deterioration IS the stress readout — there is
//  no stress bar on the HUD.
// ===========================================================================

/**
 * Banks are keyed: LINES[event][role][tone] -> string[]
 * tone is 'calm' | 'strained' | 'breaking'.
 * A missing role falls back to '*'. A missing tone falls back to 'calm'.
 */
export const LINES = {
  // ---------------------------------------------------------------- Target handoff
  'order.identify': {
    gunner: {
      calm: ['Identifying.', 'Searching.', 'Looking now.', 'On it — searching that arc.'],
      strained: ['Identifying!', 'Searching — I have a lot of dust out there.', 'Looking!'],
      breaking: ['Where? Where am I looking?!', 'I can’t — I’m searching!'],
    },
  },
  'gunner.acquired': {
    gunner: {
      calm: ['I have him.', 'Target identified.', 'I see him.', 'Got him — traversing.'],
      strained: ['I have him!', 'Target! Traversing!', 'On him!'],
      breaking: ['I see him! I see him!'],
    },
  },
  'gunner.no_target': {
    gunner: {
      calm: ['Nothing in that arc.', 'I have nothing.', 'Negative — clear.', 'Can’t see anything there.'],
      strained: ['Nothing! I have nothing!', 'I can’t find him!'],
      breaking: ['I can’t see him! Where is he?!'],
    },
  },
  'gunner.traversing': {
    gunner: {
      calm: ['Traversing.', 'Coming round.', 'Turret moving.'],
      strained: ['Traversing — give me a moment!', 'Coming round, coming round!'],
      breaking: ['I’m turning as fast as it goes!'],
    },
  },
  'gunner.on_target': {
    gunner: {
      calm: ['On target.', 'Laid on.', 'Ready.', 'On him — ready to fire.'],
      strained: ['On target!', 'Laid! Ready!'],
      breaking: ['Ready! Ready!'],
    },
  },
  'gunner.firing': {
    gunner: {
      calm: ['Firing.', 'Schuss!', 'On the way.'],
      strained: ['Firing!', 'Schuss!'],
      breaking: ['Firing! Firing!'],
    },
  },
  'gunner.hit': {
    gunner: {
      calm: ['Hit.', 'That’s a hit.', 'Struck him.', 'Hit — he’s stopped.'],
      strained: ['Hit! He’s hit!', 'Got him!'],
      breaking: ['I hit him! I hit him!'],
    },
  },
  'gunner.kill': {
    gunner: {
      calm: ['He’s burning.', 'Target destroyed.', 'He’s finished.', 'That one’s done.'],
      strained: ['He’s burning!', 'Got him! He’s burning!'],
      breaking: ['He’s burning! He’s burning!'],
    },
    loader: { calm: ['Good shot.', 'That’s one.', 'Well laid.'], strained: ['That’s one!'] },
  },
  'gunner.miss': {
    gunner: {
      calm: ['Short.', 'Over.', 'Missed — correcting.', 'Wide. Adjusting.'],
      strained: ['Missed! Correcting!', 'Short! Adding!'],
      breaking: ['I missed! I missed him!'],
    },
  },
  'gunner.no_penetration_on_target': {
    gunner: {
      calm: ['Bounced off him.', 'No effect on that one.', 'It skipped off.'],
      strained: ['It bounced! No effect!'],
    },
  },
  'gunner.cannot_traverse': {
    gunner: {
      calm: ['Traverse is out — I’m cranking by hand.', 'No power traverse. Hand-cranking.'],
      strained: ['Traverse is dead! Hand-cranking — this will take time!'],
      breaking: ['I can’t turn it! It’s by hand!'],
    },
  },
  'gunner.sight_gone': {
    gunner: {
      calm: ['My sight is gone. I’m laying over open sights.'],
      strained: ['Sight’s smashed! I can’t see to lay!'],
      breaking: ['I can’t see! The sight is gone!'],
    },
  },

  // ---------------------------------------------------------------- Loading
  'loader.loading': {
    loader: {
      calm: ['Loading.', 'Coming up.', 'Reaching for it.'],
      strained: ['Loading!', 'Working!'],
      breaking: ['Loading, loading!'],
    },
  },
  'loader.ready': {
    loader: {
      calm: ['Loaded!', 'AP up!', 'Ready!', 'Granate ready!', 'Up!'],
      strained: ['Loaded!', 'Up! Ready!'],
      breaking: ['Loaded! Loaded!'],
    },
  },
  'loader.ready_ap': {
    loader: { calm: ['Panzergranate loaded!', 'AP up!', 'Armour-piercing, ready!'], strained: ['AP up!'] },
  },
  'loader.ready_he': {
    loader: { calm: ['Sprenggranate loaded!', 'HE up!', 'High explosive, ready!'], strained: ['HE up!'] },
  },
  'loader.ready_smoke': {
    loader: { calm: ['Nebelgranate loaded!', 'Smoke up!'], strained: ['Smoke up!'] },
  },
  'loader.changing_ammo': {
    loader: {
      calm: ['Changing round — give me a moment.', 'Switching. Unloading first.', 'Changing natures.'],
      strained: ['Changing! I have to clear the breech first!'],
      breaking: ['I’m changing it! It takes time!'],
    },
  },
  'loader.ammo_low': {
    loader: {
      calm: ['Getting low on armour-piercing.', 'AP is running down.', 'We are down to the floor stowage.'],
      strained: ['AP is nearly gone!'],
    },
  },
  'loader.ammo_out': {
    loader: {
      calm: ['No more AP. Nothing left.', 'That was the last of it.'],
      strained: ['We’re out! Nothing in the bins!'],
      breaking: ['There’s nothing left! Nothing!'],
    },
  },
  'loader.dropped': {
    loader: {
      calm: ['Sorry — dropped it. Loading again.', 'Fumbled. One moment.'],
      strained: ['I dropped it! Loading again!'],
      breaking: ['My hands — I can’t hold it!'],
    },
  },
  'loader.breech_jam': {
    loader: {
      calm: ['Breech is jammed. Working on it.'],
      strained: ['The breech won’t close!'],
      breaking: ['It’s stuck! It won’t take the round!'],
    },
  },

  // ---------------------------------------------------------------- Driving
  'driver.ack': {
    driver: {
      calm: ['Understood.', 'Jawohl.', 'Moving.', 'Verstanden.', 'Right.'],
      strained: ['Understood!', 'Moving!'],
      breaking: ['Yes! Yes!'],
    },
  },
  'driver.forward': {
    driver: { calm: ['Forward.', 'Moving up.', 'Rolling.'], strained: ['Forward!'] },
  },
  'driver.reverse': {
    driver: { calm: ['Reversing.', 'Backing out.', 'Coming back.'], strained: ['Reversing!'], breaking: ['Backing up! Backing up!'] },
  },
  'driver.stop': {
    driver: { calm: ['Stopping.', 'Halted.', 'Standing.'], strained: ['Stopping!'] },
  },
  'driver.cover': {
    driver: {
      calm: ['Making for cover.', 'I see it — going now.', 'Behind the ridge, understood.'],
      strained: ['Going for cover!', 'Moving! Hold on!'],
      breaking: ['Getting us out! Getting us out!'],
    },
  },
  'driver.in_cover': {
    driver: {
      calm: ['We’re in defilade.', 'Behind cover. Standing.', 'This is as good as it gets here.'],
      strained: ['We’re behind it!'],
    },
  },
  'driver.no_cover': {
    driver: {
      calm: ['There’s no cover here, Herr Kommandant.', 'Nothing to get behind. It’s all open.'],
      strained: ['There’s nothing! It’s open ground!'],
    },
  },
  'driver.track_gone': {
    driver: {
      calm: ['Track’s gone. We’re not going anywhere.', 'We’ve thrown a track.'],
      strained: ['Track’s broken! I can’t steer!'],
      breaking: ['The track! We’ve lost the track!'],
    },
  },
  'driver.engine_dead': {
    driver: {
      calm: ['Engine’s dead. She won’t turn over.', 'No engine. Nothing.'],
      strained: ['Engine’s gone! She’s dead!'],
      breaking: ['She won’t start! She won’t start!'],
    },
  },
  'driver.engine_trouble': {
    driver: {
      calm: ['She’s running rough.', 'Losing power.', 'Temperature’s climbing.'],
      strained: ['She’s overheating badly!'],
    },
  },
  'driver.bogged': {
    driver: {
      calm: ['We’re bogging. Soft ground.', 'She’s digging in.'],
      strained: ['We’re stuck! I can’t get her out!'],
    },
  },
  'driver.fuel_low': {
    driver: { calm: ['Fuel’s getting low.', 'We’re down to the last of the fuel.'], strained: ['We’re nearly dry!'] },
  },
  'driver.fuel_out': {
    driver: { calm: ['That’s the fuel gone.'], strained: ['We’re dry! No fuel!'] },
  },

  // ---------------------------------------------------------------- Radio
  'radio.ack': {
    radio: { calm: ['Understood.', 'Sending.', 'Passing it now.', 'Jawohl.'], strained: ['Sending!'] },
  },
  'radio.contact_report': {
    radio: {
      calm: ['Contact report sent.', 'Passed to battalion.', 'HQ has it.'],
      strained: ['Report’s away!'],
    },
  },
  'radio.hq_reply': {
    radio: { calm: ['HQ acknowledges.', 'Battalion has us.', 'They’ve got it.'] },
  },
  'radio.contact': {
    radio: {
      calm: ['Contact! Tiger 102 reports armour to our north.', 'Battalion reports movement on our flank.'],
      strained: ['Contact! Enemy tanks reported close!'],
      breaking: ['They’re everywhere! Everyone’s calling contact!'],
    },
  },
  'radio.dead': {
    radio: {
      calm: ['Radio’s out. I can’t raise anyone.', 'Set’s dead. No signal.'],
      strained: ['The radio’s smashed! We’re on our own!'],
      breaking: ['I can’t reach anyone! Nobody can hear us!'],
    },
  },
  'radio.artillery_requested': {
    radio: { calm: ['Fire mission passed. They’re working it out.', 'Request is in. Wait for it.'] },
  },
  'radio.artillery_inbound': {
    radio: { calm: ['Rounds on the way. Twenty seconds.', 'Shot — twenty seconds.'], strained: ['Shot! Get your heads down!'] },
  },
  'radio.recovery_requested': {
    radio: { calm: ['Recovery requested.', 'I’ve asked for a recovery vehicle.'], strained: ['Recovery requested! They’re coming!'] },
  },
  'radio.recovery_dispatched': {
    radio: { calm: ['Recovery vehicle dispatched. Wait.', 'They’re sending a Famo. It will be a while.'] },
  },
  'radio.recovery_denied': {
    radio: {
      calm: ['No recovery available. Everything’s committed.', 'Battalion says there’s nothing to send.'],
      strained: ['They can’t send anyone!'],
    },
  },

  // ---------------------------------------------------------------- Spotting
  'spot.movement': {
    '*': {
      calm: ['Movement.', 'Something moving out there.', 'I have movement.'],
      strained: ['Movement! Something’s moving!'],
    },
    radio: { calm: ['Movement, right side.', 'I have something in the tree line.'] },
    loader: { calm: ['Movement through my periscope.'] },
    driver: { calm: ['Movement to my front.'] },
  },
  'spot.possible_tank': {
    '*': {
      calm: ['Possible tank.', 'That could be a tank.', 'Vehicle — I can’t make it out.'],
      strained: ['Tank! I think that’s a tank!'],
    },
  },
  'spot.enemy_tank': {
    '*': {
      calm: ['Enemy tank!', 'Panzer, feindlich!', 'That’s an enemy tank!'],
      strained: ['Enemy tank!', 'Feind! Tank!'],
      breaking: ['Tank! Tank! Right there!'],
    },
  },
  'spot.identified': {
    '*': {
      calm: ['{type}, {clock} o’clock.', '{type} — {clock} o’clock, {range} metres.'],
      strained: ['{type}! {clock} o’clock!'],
    },
  },
  'spot.multiple': {
    '*': {
      calm: ['More than one. I count {count}.', 'There are {count} of them.'],
      strained: ['{count} of them! At least!'],
      breaking: ['There’s too many! Too many!'],
    },
  },
  'spot.gun': {
    '*': {
      calm: ['Anti-tank gun — I saw the flash.', 'Gun position. Watch the tree line.'],
      strained: ['Pak! There’s a gun in there!'],
    },
  },
  'spot.infantry': {
    '*': { calm: ['Infantry.', 'Foot troops, close.', 'Infantry moving up on us.'], strained: ['Infantry! They’re close!'] },
  },

  // ---------------------------------------------------------------- Being hit
  'hit.nonpen': {
    '*': {
      calm: ['No penetration!', 'It bounced.', 'Nothing — the armour held.', 'Held! Nothing came through!'],
      strained: ['No penetration!', 'It held! It held!'],
      breaking: ['We’re hit! We’re — no, it held!'],
    },
    driver: { calm: ['That one hit the front. Nothing.'], strained: ['Something hit the front!'] },
    loader: { calm: ['That rang my ears.'], strained: ['God! No penetration!'] },
  },
  'hit.ricochet': {
    '*': {
      calm: ['Ricochet.', 'It skipped off.', 'Glanced off the front.'],
      strained: ['Ricochet! It skipped!'],
    },
  },
  'hit.penetration': {
    '*': {
      calm: ['We’re holed!', 'Penetration!', 'It came through!'],
      strained: ['Penetration! It’s come through!'],
      breaking: ['They’re through! They’re through!'],
    },
  },
  'hit.near_miss': {
    '*': {
      calm: ['Close one.', 'That was near.', 'Short of us.'],
      strained: ['That was close!', 'They’re ranging on us!'],
      breaking: ['They’ve got us ranged! They’ve got us!'],
    },
  },
  'hit.incoming': {
    '*': {
      calm: ['Incoming!', 'Shot!'],
      strained: ['Incoming!'],
      breaking: ['Incoming! Incoming!'],
    },
  },

  // ---------------------------------------------------------------- Casualties
  'crew.wounded': {
    '*': {
      calm: ['I’m hit — I can work.', 'Caught something. I’m all right.', 'I’m hit but I’m up.'],
      strained: ['I’m hit!', 'I’ve been hit!'],
      breaking: ['I’m hit! I’m hit!'],
    },
  },
  'crew.wounded_bad': {
    '*': {
      strained: ['I’m hit badly!', 'I can’t — I’m hit!'],
      breaking: ['Help me! Help me!', 'I can’t move my arm!'],
      calm: ['I’m hurt. Badly.'],
    },
  },
  'crew.other_wounded': {
    '*': {
      calm: ['{name} is hit!', '{role} is hit!', 'We’ve got a man down!'],
      strained: ['{name}’s hit! He’s hit!'],
      breaking: ['{name}! {name}, answer me!'],
    },
  },
  'crew.other_dead': {
    '*': {
      calm: ['{name} is gone.', '{role} is dead.', 'He’s dead. {name} is dead.'],
      strained: ['{name}’s dead! He’s dead!'],
      breaking: ['He’s dead! Oh God, he’s dead!'],
    },
  },
  'crew.commander_hit': {
    gunner: {
      calm: ['Commander’s hit!', 'Herr Kommandant! Are you all right?'],
      strained: ['Commander’s hit! Herr Kommandant!'],
      breaking: ['Commander! Commander, answer!'],
    },
    loader: {
      calm: ['You’re bleeding, Herr Kommandant.', 'Commander — you’re hit.'],
      strained: ['You’re bleeding badly!'],
    },
    radio: { calm: ['Should I report the commander wounded?'], strained: ['Commander’s down!'] },
    driver: { calm: ['Herr Kommandant? Are you with us?'], strained: ['Commander?! Commander!'] },
  },
  'crew.taking_over': {
    '*': {
      calm: ['I’ll take his position.', 'I can manage his job as well.', 'Moving to his station.'],
      strained: ['I’ll do it! I’ll take it!'],
    },
  },

  // ---------------------------------------------------------------- Fire
  'fire.detected': {
    '*': {
      calm: ['Fire!', 'We’re burning!', 'Fire — engine compartment!'],
      strained: ['Fire! Fire!'],
      breaking: ['FIRE! We’re on fire!'],
    },
    driver: {
      calm: ['Warning lamp — the extinguishers have gone off by themselves.', 'Fire warning on my panel!'],
      strained: ['Fire lamp! Engine compartment!'],
    },
  },
  'fire.suppression_on': {
    driver: {
      calm: ['Extinguishers activated!', 'Bottle discharged!', 'Extinguishers away!'],
      strained: ['Extinguishers! Discharged!'],
    },
  },
  'fire.suppression_empty': {
    driver: {
      calm: ['Bottle’s empty. That was the last of it.'],
      strained: ['There’s nothing left in the bottle!'],
      breaking: ['It’s empty! The bottle’s empty!'],
    },
  },
  'fire.hand_extinguisher': {
    '*': { calm: ['I have the hand extinguisher.', 'Getting the extinguisher!'], strained: ['I’m on it! Extinguisher!'] },
  },
  'fire.spreading': {
    '*': {
      strained: ['Fire’s spreading!', 'It’s getting worse!'],
      breaking: ['It’s spreading! We can’t hold it!'],
      calm: ['The fire is spreading.'],
    },
  },
  'fire.out': {
    '*': { calm: ['Fire’s out.', 'We’ve got it.', 'It’s out. It’s out.'], strained: ['It’s out! We got it!'] },
  },
  'fire.ammunition': {
    '*': {
      strained: ['The ammunition! It’s reached the ammunition!'],
      breaking: ['THE AMMUNITION! GET OUT! GET OUT!'],
      calm: ['The fire has reached the ammunition.'],
    },
  },

  // ---------------------------------------------------------------- Abandonment
  'abandon.order': {
    '*': {
      calm: ['Out! Everybody out!', 'Raus! Raus!', 'Get out!'],
      strained: ['Out! Get out!'],
      breaking: ['RAUS! RAUS!'],
    },
  },
  'abandon.hatch_stuck': {
    '*': {
      strained: ['The hatch is jammed!', 'It won’t open!'],
      breaking: ['I can’t get it open! I CAN’T GET IT OPEN!'],
      calm: ['Hatch is jammed. Trying the escape hatch.'],
    },
  },
  'abandon.out': {
    '*': { calm: ['I’m out!', 'Clear!', 'Out!'], strained: ['I’m out! I’m out!'] },
  },
  'abandon.moving_to_cover': {
    '*': { calm: ['Making for the ditch!', 'Running for cover!'], strained: ['Run! Run!'] },
  },

  // ---------------------------------------------------------------- Repairs
  'repair.acknowledge': {
    '*': {
      calm: ['Going out.', 'Taking the tools.', 'I’ll see to it.', 'On my way out.'],
      strained: ['Going out — cover us!'],
      breaking: ['Out there? Now?'],
    },
  },
  'repair.starting': {
    '*': {
      calm: ['Starting on it.', 'I’m at the track now.', 'I can see the damage.'],
      strained: ['Working! Keep watch!'],
    },
  },
  'repair.progress': {
    '*': {
      calm: ['Working on it.', 'Coming along.', 'Halfway there.', 'It’s going.'],
      strained: ['I’m working as fast as I can!'],
      breaking: ['I can’t do this out here!'],
    },
  },
  'repair.nearly': {
    '*': { calm: ['Nearly there.', 'Almost done.', 'One more pin.'], strained: ['Nearly! Nearly!'] },
  },
  'repair.done': {
    '*': {
      calm: ['Repair complete.', 'That’s done. Coming back in.', 'Track’s back on.'],
      strained: ['Done! Getting in!'],
    },
  },
  'repair.cannot': {
    '*': {
      calm: ['We haven’t the parts for this.', 'I can’t fix this in a field.', 'This is a workshop job.'],
      strained: ['I can’t fix it! Not out here!'],
    },
  },
  'repair.abort': {
    '*': { calm: ['Breaking off. Coming in.', 'Leaving it. Getting back in.'], strained: ['Coming in! Coming in!'] },
  },
  'repair.under_fire': {
    '*': {
      strained: ['They’re shooting at us out here!', 'We’re being shot at!'],
      breaking: ['I can’t stay out here!'],
    },
  },

  // ---------------------------------------------------------------- Recovery / towing
  'tow.attaching': {
    '*': { calm: ['Getting the cable.', 'Taking the cable across.', 'Shackling on now.'], strained: ['Working the cable!'] },
  },
  'tow.attached': {
    '*': { calm: ['Cable’s on.', 'We’re shackled up.', 'Cable secure.'], strained: ['Cable’s on! Get in!'] },
  },
  'tow.broken': {
    '*': {
      calm: ['Cable’s parted.', 'The cable’s snapped.'],
      strained: ['Cable’s gone! It’s snapped!'],
    },
  },
  'tow.underway': {
    '*': { calm: ['We’re moving.', 'He’s got us.', 'Under tow.'] },
  },

  // ---------------------------------------------------------------- Atmosphere / idle
  'idle.calm': {
    driver: {
      calm: ['She’s running well today.', 'Oil pressure is good.', 'Temperature’s holding.',
        'Quiet out there.', 'I could use a cigarette.'],
    },
    loader: {
      calm: ['Ninety-two rounds. I counted them twice.', 'The bins are full.',
        'It’s going to be hot in here.', 'I’ve got AP up already.'],
    },
    gunner: {
      calm: ['Sight’s clear.', 'Optics are good.', 'I’ve checked the lay.', 'Everything’s where it should be.'],
    },
    radio: {
      calm: ['Net’s quiet.', 'Battalion has nothing for us.', 'I have 102 and 104 on the net.',
        'Just static.'],
    },
  },
  'idle.tense': {
    '*': {
      calm: ['It’s too quiet.', 'I don’t like this.', 'Where are they?'],
      strained: ['I don’t like this at all.', 'They’re out there somewhere.'],
      breaking: ['Why is it so quiet? Why?'],
    },
  },
  'idle.after_action': {
    '*': {
      calm: ['Is that all of them?', 'Anyone see anything else?', 'It’s gone quiet.'],
      strained: ['Is it over? Is that all of them?'],
    },
  },
  'crew.exhausted': {
    '*': {
      calm: ['I’m about done in.', 'I need a rest.', 'My arms are gone.'],
      strained: ['I can’t keep this up much longer!'],
    },
  },
  'crew.stress_high': {
    '*': {
      strained: ['I can’t — give me a second!', 'Too much! It’s too much!'],
      breaking: ['I want to get out. I want to get out of this tank.', 'I can’t do this! I can’t!'],
    },
  },

  // ---------------------------------------------------------------- Commander acknowledgements
  'ack.generic': {
    '*': { calm: ['Jawohl.', 'Understood.', 'Verstanden.', 'Right.', 'Yes, Herr Kommandant.'], strained: ['Jawohl!', 'Understood!'] },
  },
  'ack.negative': {
    '*': { calm: ['I can’t do that.', 'Not possible, Herr Kommandant.', 'Negative.'], strained: ['I can’t!'] },
  },
};

/** HQ and other vehicles on the battalion net. Deliberately imperfect. */
export const RADIO_TRAFFIC = {
  hq_contact: [
    'HQ to Tiger 101. Soviet armour reported in your sector. Grid {grid}.',
    'Battalion to 101. Enemy tanks in the {dir}. Strength unknown.',
    'All stations: armour reported moving {dir}. Identify before engaging.',
  ],
  hq_orders: [
    'Tiger 101, hold the village. Do not advance beyond the tree line.',
    'Tiger 101, support the grenadiers on your right.',
    '101, battalion requires you to hold this position.',
    'All Tigers, conserve ammunition. Resupply is not certain.',
  ],
  friendly_contact: [
    'Tiger 102 reporting contact. Two T-34 to my front.',
    '104 here — I am engaging. Grid {grid}.',
    '103 is hit. 103 is hit and stopped.',
    'This is 102. I have a track off. I need help.',
  ],
  friendly_loss: [
    '104 is burning. Crew is out.',
    'We’ve lost 103. No word from the crew.',
    'Panzer IV on our left has been knocked out.',
  ],
  warnings: [
    'Warning — anti-tank guns reported in the tree line at grid {grid}.',
    'Watch your flank. Enemy armour reported moving around the ridge.',
    'Artillery falling on the crossroads. Keep clear.',
    'Aircraft. Sturmovik, low, from the east.',
  ],
  imperfect: [
    'Reported enemy strength was… correction, disregard that. Numbers unconfirmed.',
    'Previous contact report may be in error. Take care identifying.',
    'Battalion has no further information at this time.',
  ],
};

const _lastLine = new Map();

/**
 * Pick a line. Falls back gracefully so a missing bank never crashes the game.
 * @param {string} event
 * @param {string} role
 * @param {number} stress 0..1
 * @param {object} rng
 * @param {object} [vars]  substituted into {placeholders}
 */
export function pickLine(event, role, stress, rng, vars = {}) {
  const bank = LINES[event];
  if (!bank) return null;
  const roleBank = bank[role] || bank['*'];
  if (!roleBank) return null;

  const tone = stress > 0.72 ? 'breaking' : stress > 0.40 ? 'strained' : 'calm';
  const pool = roleBank[tone] || roleBank.strained || roleBank.calm
    || roleBank.breaking || Object.values(roleBank)[0];
  if (!pool || !pool.length) return null;

  const key = `${event}:${role}`;
  const chosen = rng.pickFresh(pool, _lastLine.get(key));
  _lastLine.set(key, chosen);

  return chosen.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

export function resetDialogueMemory() { _lastLine.clear(); }
