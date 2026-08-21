# Tiger I Ausf. H — Historical Configuration Research

This document is the **single source of truth** for every number in `src/data/`.
It fixes one internally consistent vehicle configuration and justifies each choice.
If a value in code disagrees with this document, the document wins and the code is a bug.

---

## 0. The "Ausf. H" naming problem, and how this project resolves it

The vehicle was ordered and built as **Panzerkampfwagen VI Ausf. H1 (Sd.Kfz. 181)**.
In **March 1943** it was officially redesignated **Panzerkampfwagen Tiger Ausf. E (Sd.Kfz. 181)**.
Operation Zitadelle opened on **5 July 1943**, four months after the redesignation.

So a pedantically correct Kursk Tiger is an *Ausf. E* by paperwork, and an *Ausf. H* by the
name the crews, the factory drawings and most of the surviving 1942–43 documentation used.
The user asked for "Ausf. H". Both names describe **the same physical vehicle**; the
redesignation changed nothing mechanical.

**Resolution:** this project models the vehicle the user means — a Tiger of the H/E production
line in its **May–June 1943 build state**, i.e. the configuration actually issued to the heavy
tank battalions for Zitadelle. The game calls it *Ausf. H*. This document records that the
official July-1943 designation was *Ausf. E*, and the data files carry both.

## 1. The specific vehicle modelled

> **Tiger I Ausf. H (Sd.Kfz. 181), Henschel, Kassel — May/June 1943 production**
> Fahrgestell-Nr. band **250200–250380** (i.e. *before* Fgst. 250391)
> Representative vehicle: **"S13", 3. Kompanie, schwere Panzer-Abteilung 503**,
> Belgorod sector, Army Group South, July 1943.

Everything below is locked to that build state. The single most important consequence:

**This Tiger is built *before* Fgst.Nr. 250391, so it has the EARLY DRUM CUPOLA.**

### 1.1 Fitted / not fitted (the configuration lock)

| Feature | State on this vehicle | Reason |
|---|---|---|
| Commander's cupola | **Early drum type**, 5 vision slits, flip-up (top-hinged) hatch, no AA MG ring | New cast cupola w/ 7 periscopes + pivoting hatch begins at **Turm Nr. 392 / Fgst. 250391, July 1943** — after this vehicle was built |
| Gunner's sight | **TZF 9b — binocular**, 2.5×, 25° field | Monocular TZF 9c arrives later in 1943; mantlet therefore has **two** sight apertures |
| Zimmerit | **Not fitted** | Introduced late Aug/Sept 1943 — no Kursk Tiger wore it |
| Feifel air cleaners | **Fitted** (2 cylinders on rear plate + trunking) | Standard until late 1943; frequently removed in the field, so the game models them as removable |
| Turret smoke candle dischargers (Nebelkerfenabwurfvorrichtung) | **Fitted**, 3 tubes each side | Deletion ordered ~June 1943 after fires; 503's vehicles are photographed with them at Kursk |
| S-mine dischargers (Minenabwurfvorrichtung) | **Fitted**, 5 around hull roof | Deleted ~Oct 1943 |
| Nahverteidigungswaffe | **Not fitted** — turret has a **pistol port** instead | Close-defence weapon arrives Dec 1943 |
| Road wheels | **Rubber-tyred**, interleaved, 8 torsion-bar stations/side, 24 wheels/side in 3 ranks | Steel-rimmed resilient wheels begin Jan/Feb 1944 |
| Engine | **Maybach HL 230 P45** | HL 210 P45 was fitted only to the first 250 vehicles |
| Deep-wading capability | **Retained** (nominal 4 m submersion kit) | Deleted from production ~Aug 1943 |
| Exhaust stacks | **Armoured guards fitted** | Added early 1943 |
| Tracks | **Kgs 63/725/130 combat track, 725 mm, 96 links** | Transport track Kgs 63/520/130 (520 mm) is carried only for rail movement |
| Turret roof / hull roof | **25 mm** | Thickened to 40 mm only from March 1944 |

**Rule enforced throughout the codebase:** no late-war feature may be added because it is
recognisable. If it did not exist in June 1943, it is not on this tank.

---

## 2. Dimensions and mass

| Quantity | Value |
|---|---|
| Length, gun forward | 8.45 m |
| Length, hull only | 6.316 m |
| Width, over combat tracks | 3.705 m |
| Width, over hull / transport tracks | 3.56 m / 3.14 m |
| Height, to top of cupola | 3.00 m |
| Ground clearance | 0.47 m |
| Track width (combat) | 725 mm |
| Track contact length | 3.61 m |
| Ground pressure | ~1.04 kg/cm² |
| Turret ring diameter (clear) | 1.83 m |
| Turret headroom | 1.57 m |
| Combat weight (Gefechtsgewicht) | 57 000 kg |

## 3. Armour — plate by plate

All plate is **rolled homogeneous armour (RHA)**, flame-cut, with **stepped and interlocked
(Schwalbenschwanz) welded joints**. Angles below are given **from the vertical** (0° = a
vertical plate, the German convention), because that is how the wartime tables are written.

| Plate | Thickness | Angle from vertical | Notes |
|---|---|---|---|
| Hull nose (lower front) | 100 mm | 24° | |
| Hull driver's plate (upper front, vertical) | 100 mm | 9° | Carries driver's visor + MG ball mount |
| Hull glacis (upper front, sloped) | 60 mm | 80° | Thin but at extreme obliquity |
| Hull side, upper (superstructure/sponson) | 80 mm | 0° | The Tiger's real weak spot |
| Hull side, lower (behind running gear) | 60 mm | 0° | Shielded by road wheels/track |
| Hull rear | 80 mm | 8° | |
| Hull roof | 25 mm | 90° (horizontal) | |
| Hull floor, forward | 25 mm | 90° | |
| Hull floor, rear | 25 mm | 90° | |
| Turret front plate | 100 mm | 0° | |
| Gun mantlet (Walzenblende) | 100–120 mm, ~200 mm at trunnion bosses | curved | Modelled as a curved shell, not a flat plate |
| Turret side | 80 mm | 0° | |
| Turret rear | 80 mm | 0° | Contains escape hatch + pistol port |
| Turret roof | 25 mm | 90° | |
| Cupola (drum wall) | 80 mm | ~10° | |
| Cupola roof / hatch | 25 mm | 90° | |

## 4. Powerplant and driveline

| Item | Value |
|---|---|
| Engine | Maybach HL 230 P45, 60° V-12, petrol |
| Displacement | 23.095 L |
| Rated output | 700 PS @ 3000 rpm (**field-governed to ~2600 rpm ≈ 650 PS**) |
| Cooling | 2 radiator banks, 4 fans, twin transverse |
| Fuel | 540 L in 4 tanks, 74-octane petrol |
| Consumption | ~270 L/100 km road, ~480 L/100 km cross-country |
| Range | 195 km road / 110 km cross-country |
| Transmission | Maybach **OLVAR OG 40 12 16 B**, pre-selector, semi-automatic hydraulic shift |
| Gears | **8 forward, 4 reverse** |
| Steering | Henschel **L 801** controlled differential, dual-radius, hydraulically assisted, **steering wheel** — 16 fixed turning radii (2 per gear) plus neutral steer |
| Final drive | Single-stage, ratio 10.7:1 |
| Suspension | Torsion bar, 8 stations/side, interleaved (Schachtellaufwerk) |
| Max speed, road | 45.4 km/h theoretical; **~38 km/h practical** |
| Max speed, cross-country | 20–25 km/h |
| Reverse speed | ~10–12 km/h |

## 5. Armament

### 8.8 cm KwK 36 L/56
| Item | Value |
|---|---|
| Barrel length | 4930 mm (L/56) |
| Muzzle brake | Double-baffle |
| Breech | Semi-automatic **falling wedge**, horizontal |
| Recoil length | ~580 mm normal, 600 mm max |
| Elevation / depression | **+16° / −8°** |
| Traverse | 360°, hydraulic (engine-driven Boehringer-Sturm L4S) + manual |
| Hydraulic traverse rate | ~6°/s low, 19°/s high, **~36°/s max**; a full circle at low idle takes ~60 s |
| Manual traverse | Gunner's handwheel — **720 turns for 360°** (~0.5°/turn); loader has a second handwheel |
| Elevation control | Gunner's handwheel, manual only (no powered elevation) |
| Firing | Electric primer, trigger on the elevation handwheel |
| Sight | **TZF 9b binocular**, 2.5×, 25° FoV, ranging reticle to 4000 m AP / 6000 m HE |
| Ammunition stowage | **92 rounds**, in sponson bins either side of the fighting compartment + under-turret floor |
| Secondary | 2× **MG 34** 7.92 mm — coaxial (mantlet) + hull ball mount (Kugelblende 50), **4800 rounds** in 32 × 150-round belt bags |
| Hull MG sight | KZF 2, 1.8× |

### 8.8 cm ammunition (German penetration tables, **30° from vertical**, RHA)

| Round | Type | Projectile mass | Muzzle velocity | 100 m | 500 m | 1000 m | 1500 m | 2000 m |
|---|---|---|---|---|---|---|---|---|
| **PzGr. 39** | APCBC-HE (59 g filler) | 10.2 kg | 773 m/s | 120 | 110 | 100 | 91 | 84 |
| **PzGr. 40** | APCR, tungsten core | 7.3 kg | 930 m/s | 170 | 155 | 138 | 123 | 110 |
| **Gr. 39 HL** | HEAT | 7.65 kg | 600 m/s | ~90 mm at any range | | | | |
| **Sprgr. 39** | HE (698 g filler) | 9.0 kg | 820 m/s | — | | | | |

*Zitadelle reality:* PzGr. 40 was extremely scarce — typically **0–4 rounds** per tank, if any.
The campaign logistics model reflects this and will usually offer none.

## 6. Vision and communication

| Station | Devices |
|---|---|
| Commander | Early drum cupola, **5 vision slits** with laminated glass blocks behind sliding armoured covers; azimuth indicator ring; Sfl.Z.F. scissor periscope stowed; 6×30 binoculars |
| Gunner | **TZF 9b** binocular sight; azimuth indicator dial |
| Loader | Fixed roof periscope (forward-facing) |
| Driver | **Fahrersehklappe** visor with laminated glass block and sliding armoured shutter; **KFF 2** binocular episcope swung into place when the visor is closed |
| Radio operator | KZF 2 MG sight; roof periscope |

**Radio:** **Fu 5** — 10 W transmitter (10 W.S.c) + Ukw.E.e receiver, 27.2–33.3 MHz,
~6 km voice on the move. Company/battalion command Tigers additionally carry Fu 7 or Fu 8.
**Intercom:** Bordsprechanlage, throat microphones (Kehlkopfmikrofon) + headsets for all five.

## 7. Fire suppression (the actual historical system)

This is deliberately **not** a modern automatic suppression system.

* An **automatic Feuerlöschanlage** protects the **engine compartment only**.
* **Thermostatic sensors** sit at the **fuel pumps and carburettors**. They trip at **120 °C**.
* Tripping fires a **3-litre bottle of CB (Chlorbrommethan / "Tetra")** through spray nozzles
  aimed at the carburettors and fuel pumps.
* Each discharge lasts **7 seconds**.
* A **warning lamp on the driver's instrument panel** lights when the system fires.
* The bottle holds enough agent for roughly **five discharges**, then it is empty and the
  system is dead for the rest of the mission.
* The agent is **toxic** — CB decomposes into phosgene-family products. Discharges vent into
  the crew compartment and degrade the crew.
* The **fighting compartment has no automatic protection**. It has a **hand-held extinguisher**
  only, which a crewman must physically reach and use.

Consequences modelled in game: the commander's "activate extinguishers" order is really
*"driver, hit the manual trigger / grab the hand extinguisher"*. It has a limited number of
uses, it does nothing for a fighting-compartment or ammunition fire except by hand, it poisons
the crew a little each time, and **it does not guarantee the fire goes out**.

## 8. Crew stations

| Crewman | Position |
|---|---|
| Driver | Hull front **left** |
| Radio operator / hull MG | Hull front **right** |
| Gunner | Turret, **left** of the gun |
| Loader | Turret, **right** of the gun (folding seat; works standing) |
| Commander | Turret **rear-left**, under the cupola |

Hatches: driver's and radio operator's hull roof hatches (pivot-and-slide), commander's cupola
hatch, loader's turret roof hatch, **turret rear escape hatch**, turret **pistol port**,
plus a hull-floor escape hatch under the radio operator.

---

## 9. Opposition — Soviet, Kursk, July 1943

Only vehicles and guns actually present in the Kursk salient in July 1943 are modelled.

| Vehicle | Gun | Notes |
|---|---|---|
| **T-34 mod. 1943** | 76.2 mm F-34 | The standard opponent. Hexagonal turret, commander still doubles as gunner |
| **T-70M** | 45 mm 20-K | Light tank; effectively harmless to a Tiger frontally |
| **KV-1s** | 76.2 mm ZiS-5 | Lightened KV |
| **SU-122** | 122 mm M-30S | HEAT (BP-460A) and heavy HE |
| **SU-152** | 152 mm ML-20S | 48.8 kg AP / 43.6 kg HE — genuinely lethal to a Tiger |
| **SU-76M** | 76.2 mm ZiS-3 | Thin-skinned, dangerous only from the flank |
| **ZiS-3 76 mm divisional gun** | — | Dug in, hard to see, fires **BR-350B** and scarce **BR-350P** (APCR) |
| **53-K 45 mm AT gun** | — | Numerous, mostly a track-breaker |
| **52-K 85 mm AA gun** | — | In direct-fire AT role. **The genuine threat** — will penetrate the Tiger frontally |

### Soviet ammunition (penetration, **30° from vertical**, RHA)

| Round | Gun | Mass | MV | 100 m | 500 m | 1000 m | 1500 m |
|---|---|---|---|---|---|---|---|
| BR-350A (APHEBC, blunt) | F-34 / ZiS-5 / ZiS-3 | 6.3 kg | 662 m/s | 67 | 60 | 52 | 45 |
| BR-350B (APHEBC, sharp) | F-34 / ZiS-5 / ZiS-3 | 6.5 kg | 655 m/s | 69 | 61 | 53 | 46 |
| BR-350P (APCR) | ZiS-3 / F-34 | 3.02 kg | 950 m/s | 102 | 87 | 65 | — |
| BR-240 (AP) | 45 mm 20-K | 1.43 kg | 760 m/s | 43 | 35 | 28 | — |
| BR-365 (APHEBC) | 85 mm 52-K | 9.2 kg | 792 m/s | 111 | 102 | 93 | 85 |
| BR-540 (APHEBC) | 152 mm ML-20S | 48.8 kg | 600 m/s | 125 | 120 | 114 | 108 |
| BP-460A (HEAT) | 122 mm M-30S | 13.4 kg | 515 m/s | ~120 mm at any range | | | |

**The load-bearing historical fact this game must honour:**
a T-34's BR-350A cannot defeat 100 mm of Tiger front plate at *any* range, and cannot defeat
80 mm of vertical Tiger side beyond roughly 200–300 m. It **must not** penetrate in game.
Conversely the 85 mm BR-365 and the 152 mm BR-540 **must** be able to, and the game must let them.

---

## 10. German order of battle elements modelled

Tiger I Ausf. H, Panzer IV Ausf. G/H, Panzer III Ausf. J/L/M/N, StuG III Ausf. G,
Marder III Ausf. M, Panther Ausf. D (southern face only), Ferdinand (northern face only),
Sd.Kfz. 251 Ausf. C, **Sd.Kfz. 9 FAMO 18-t** recovery half-track, Bergepanther, Opel Blitz.

Recovery doctrine: a bogged or immobilised Tiger officially required **three Sd.Kfz. 9**
half-tracks. Towing a Tiger with another Tiger was **forbidden by regulation** because it
wrecked the towing vehicle's final drives — the game permits it and applies that consequence.

---

## Sources consulted

- Jentz & Doyle, *Germany's Tiger Tanks: D.W. to Tiger I* / *Tiger I & II: Combat Tactics* (production-change chronology, Fgst.Nr. bands)
- *Tigerfibel* (D 656/27), 1943 — crew procedure, gunnery, ranging
- D 656/21 *Panzerkampfwagen Tiger Ausf. E — Handbuch für den Panzerfahrer*
- Wa Prüf 1 penetration tables, 30° obliquity
- Soviet GAU penetration tables for BR-350A/B/P, BR-365, BR-540
- Wikipedia, *Tiger I* and *8.8 cm KwK 36* — cross-check of dimensions, powertrain, traverse rates
- tiger1.info — cupola, periscope and loader-hatch production changes
- Contemporary accounts of the Tiger's automatic engine-compartment fire extinguishing system
  (CB/"Tetra" agent, 120 °C thermostat, 7-second discharge, driver's warning lamp)

Where sources conflict, this document picks one defensible value and the whole vehicle is kept
consistent with it. Conflicts resolved here: gun elevation (**+16°/−8°**), cupola type
(**early drum**, from the Fgst.Nr. band), sight (**TZF 9b binocular**), engine governor
(**~2600 rpm practical**), width (**3.705 m over combat tracks**, not the 3.56 m over-hull figure).
