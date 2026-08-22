# TIGER I AUSF. H — CONFIGURATION LOCK

The §9 configuration document. Every modelling decision must be consistent with
this file, and every critic finding must be judged against it. Full reasoning and
sources are in [`HISTORICAL-RESEARCH.md`](HISTORICAL-RESEARCH.md); this document
is the short, citable form plus the dimensional dossier.

---

## 1. What is being modelled

| | |
|---|---|
| **Vehicle** | Panzerkampfwagen VI Tiger Ausf. H (Sd.Kfz. 181) |
| **Manufacturer** | Henschel & Sohn, Kassel |
| **Production period** | May / June 1943 |
| **Fahrgestell-Nr. band** | 250200 – 250380 (**before** 250391) |
| **Campaign** | Operation Zitadelle / Battle of Kursk, 5–17 July 1943 |
| **Unit** | 3. Kompanie, schwere Panzer-Abteilung 503, Belgorod sector, Army Group South |
| **Representative vehicle** | Turmnummer **"S13"** |
| **Primary visual reference** | user-supplied Kursk photographs, `docs/reference/` |
| **Primary dimensional reference** | user-supplied technical diagram, `docs/reference/` |

On paperwork this vehicle was redesignated *Ausf. E* in March 1943, four months
before Zitadelle. The redesignation changed nothing mechanical. The project uses
the name the crews and the factory drawings used.

## 2. Features PRESENT

- **Early drum commander's cupola** — cast drum, **five vision slits**, single
  **flip-up (top-hinged) hatch**, no periscopes, no AA machine-gun ring.
- **TZF 9b binocular gunner's sight**, 2.5×, 25° field — therefore **two sight
  apertures in the mantlet**.
- **Walzenblende** cast mantlet, 100–120 mm, ~200 mm at the trunnion bosses.
- **Rubber-tyred interleaved road wheels**, 8 torsion-bar stations per side,
  24 wheels per side in three ranks.
- **Feifel air cleaners** — two cylinders on the rear plate with trunking forward
  over the engine deck.
- **Turret smoke candle dischargers**, three tubes each side on a common bracket.
- **S-mine dischargers** (Minenabwurfvorrichtung), five around the hull roof.
- **Pistol port** in the turret rear, beside the circular escape hatch.
- **Armoured exhaust guards** on the rear plate.
- **Maybach HL 230 P45** engine; deep-wading capability retained.
- **Kgs 63/725/130 combat track**, 725 mm wide, 130 mm pitch, 96 links per side.
- 25 mm hull and turret roof.
- **Dunkelgelb RAL 7028** base over red-oxide primer, no factory camouflage
  pattern; Balkenkreuz on hull sides and rear, "S13" on the turret sides.

## 3. Features ABSENT — and why

These are the traps. Each is a recognisable Tiger feature that belongs to a
different build state, and adding any of them is an automatic CRITICAL failure.

| Feature | First appears | Why it is absent here |
|---|---|---|
| Cast cupola with seven periscopes and a pivoting hatch | Turm Nr. 392 / Fgst. 250391, July 1943 | Built after this vehicle |
| Monocular TZF 9c sight (one mantlet aperture) | later 1943 | This tank has the binocular 9b |
| Zimmerit anti-magnetic paste | late Aug / Sept 1943 | **No Kursk Tiger wore it** |
| Steel-rimmed resilient road wheels | Jan / Feb 1944 | Rubber tyres here |
| Nahverteidigungswaffe (roof close-defence weapon) | Dec 1943 | Pistol port instead |
| 40 mm hull and turret roof | March 1944 | 25 mm here |
| Loader's roof periscope in a rotating mount | later production | Fixed forward periscope |
| Turret stowage bin on the rear | later, and unit-dependent | Not on 503's Kursk vehicles |
| Three-tone ambush camouflage | Aug 1944 | Plain Dunkelgelb |

**Rule:** no late-war feature may be added because it is recognisable. If it did
not exist in June 1943 it is not on this tank.

## 4. Dimensional dossier

What the model must hit. Verified with `tools/ortho.mjs` against the technical
diagram. Tolerance is ±1% unless stated; anything outside it is a MAJOR finding
and is fixed in the geometry, never with textures or a local scale.

| Quantity | Target | Source | Status |
|---|---|---|---|
| Length, gun forward | 8.45 m | published | locked |
| Length, hull only | 6.316 m | published | locked |
| Width, over combat tracks | 3.705 m | published | locked |
| Width, over hull | 3.56 m | published | locked |
| Height, ground to cupola top | 3.00 m | published | locked |
| Height, ground to turret roof | 2.52 m | derived | locked |
| Ground clearance | 0.47 m | published | locked |
| Track width, combat | 0.725 m | published | locked |
| Track pitch | 0.130 m | Kgs 63/**725/130** | locked |
| Track links per side | 96 | published | locked |
| Track loop length | 12.48 m | 96 × 0.130, cross-check | derived |
| Track ground contact length | 3.61 m | published | locked |
| Turret ring, clear diameter | 1.83 m | published | locked |
| Turret headroom | 1.57 m | published | locked |
| Road wheel diameter | 0.80 m | published | locked |
| Barrel length | 4.930 m (L/56) | published | locked |
| Gun elevation / depression | +16° / −8° | published | locked |
| Combat weight | 57 000 kg | published | locked |
| Turret ring centre, forward of hull centre | 0.35 m | current model | **verify from diagram** |
| Trunnion height above ground | 2.12 m | current model | **verify from diagram** |
| Road wheel station pitch | — | — | **derive from diagram** |
| Sprocket centre height and position | — | — | **derive from diagram** |
| Idler centre height and position | — | — | **derive from diagram** |
| Cupola centre, offset from turret centre | −0.46 m, +0.12 m | current model | **verify from diagram** |
| Mantlet width and diameter | 1.52 m / 0.704 m | current model | **verify from photographs** |
| Engine deck intake positions | — | — | **verify from photographs** |

Rows marked **verify** are currently the model's own values with no independent
source. They are the first things checked when the reference pack arrives, and
they are exactly where an error would hide.

## 5. Armour geometry

Angles from the **vertical**, the German convention, because that is how the
wartime penetration tables are written. All rolled homogeneous plate, flame-cut,
with stepped and interlocked (Schwalbenschwanz) welded joints — the joints must
be modelled as such, not butted.

| Plate | Thickness | Angle | Note |
|---|---|---|---|
| Hull nose, lower front | 100 mm | 24° | |
| Hull driver's plate | 100 mm | 9° | driver's visor + MG ball mount |
| Hull glacis, upper front | 60 mm | 80° | thin, extreme obliquity |
| Hull side, upper (sponson) | 80 mm | 0° | the real weak spot |
| Hull side, lower | 60 mm | 0° | shielded by wheels and track |
| Hull rear | 80 mm | 8° | |
| Hull roof / floor | 25 mm | horizontal | |
| Turret front | 100 mm | 0° | |
| Mantlet | 100–120 mm, ~200 mm at bosses | curved | a casting, not a flat plate |
| Turret side / rear | 80 mm | 0° | rear carries escape hatch + pistol port |
| Turret roof | 25 mm | horizontal | |
| Cupola drum wall | 80 mm | ~10° | |

Plate thickness must be **visible geometry** at every edge and interface. Paper-thin
faces that only look thick because of a texture are an automatic failure (§29).

## 6. Crew positions

Handedness convention in the codebase: **−X is the crew's left, +X the crew's
right**, +Z is forward. This matches `STATIONS` in `src/data/tiger1h.js` and must
not be flipped.

| Station | Side | Note |
|---|---|---|
| Driver | hull front left | visor, KFF 2, steering wheel, Olvar pre-selector |
| Radio operator | hull front right | Fu 5, MG 34 in Kugelblende with KZF 2 |
| Gunner | turret left of gun | TZF 9b, elevation and traverse handwheels |
| Commander | turret left rear | cupola |
| Loader | turret right of gun | ready racks, loader's hatch |

Consequences for the exterior: the **bow MG is on the tank's right**, the **two
sight apertures are left of the gun**, the **coaxial MG port is right of the gun**,
and the **cupola is on the left of the turret roof**.
