# HISTORICAL REFERENCE PACK

Drop images into this directory. This manifest is the categorised reference board
(§8) and the index the historical-accuracy critic reads before it looks at any
render.

**Status: awaiting the user's reference pack.** Nothing is in here yet, so every
comparison in the gauntlet currently runs against published scale drawings and
measurements only. When the pack lands, every row below gets filled in, every
dimensional row marked *verify* in `../TIGER-CONFIGURATION.md` is re-checked
against it, and **the pack wins any conflict with a published figure.**

## How to add images

Any filename is fine. Put them in this directory, then this manifest gets updated
with what each one shows. Useful in the filename if you know it: the vehicle, the
unit, the date, and which angle.

## Categories

### Technical drawings and diagrams
Used for: overall dimensions, proportions, armour geometry, component placement,
crew positions, turret and hull proportions, running gear, gun and cupola
position. These drive `tools/ortho.mjs` overlays.

| File | Shows | Scale usable? | Notes |
|---|---|---|---|
| _(empty)_ | | | |

### Hull
| File | View | Notes |
|---|---|---|
| _(empty)_ | front / side / rear / top | |

### Turret
| File | View | Notes |
|---|---|---|
| _(empty)_ | front / side / rear / roof / interior | |

### Commander's cupola
| File | Shows | Notes |
|---|---|---|
| _(empty)_ | drum, hatch, vision slits, hinges | |

### Gun and mantlet
| File | Shows | Notes |
|---|---|---|
| _(empty)_ | barrel, muzzle brake, mantlet, apertures | |

### Running gear
| File | Shows | Notes |
|---|---|---|
| _(empty)_ | road wheels, sprocket, idler, track, suspension | |

### Engine deck
| File | Shows | Notes |
|---|---|---|
| _(empty)_ | intakes, exhausts, access hatches, stowage | |

### External fittings
| File | Shows | Notes |
|---|---|---|
| _(empty)_ | tools, tow gear, spare track, brackets, cables | |

### Interior
| File | Station | Notes |
|---|---|---|
| _(empty)_ | commander / gunner / loader / driver / radio | |

### Crew, markings and camouflage
| File | Shows | Notes |
|---|---|---|
| _(empty)_ | uniforms, Balkenkreuz, turret numbers, finish | |

### Battlefield and damage
| File | Shows | Notes |
|---|---|---|
| _(empty)_ | wear, mud, battle damage, field modifications | |

## Reading the evidence

A photograph is evidence of **one vehicle on one day**, not of the production
standard. Before any model change is made because of an image, classify what it
shows (§5 of the directive):

- **production-standard** — reproduce it
- **vehicle-specific modification** — do not generalise it across the Tiger
- **battle damage** — do not model it as standard
- **photographic artifact** — lighting, angle, film, retouching; ignore
- **different production batch** — check it against the configuration lock first;
  if it belongs to a later build state, it is out of scope

Where references disagree, find the feature common to several, and let the
configuration lock in `../TIGER-CONFIGURATION.md` break the tie. The goal is not
to copy one photograph — it is to reconstruct the configuration the evidence
represents.
