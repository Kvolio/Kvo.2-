// ===========================================================================
//  POST-PROCESSING
//
//  Three things that change how the game reads more than any amount of extra
//  geometry:
//
//    * AMBIENT OCCLUSION. Without it the interior of the turret is a flat-lit
//      box and the running gear has no contact shadow. With it, the space under
//      the sponsons goes dark, the breech sits in the turret, and the tank
//      touches the ground.
//    * BLOOM, applied only above a high threshold, so a muzzle flash and a
//      burning tank glare and nothing else does.
//    * SMAA, because a Tiger is made of long straight plate edges and they
//      crawl badly without it.
//
//  Every stage is individually switchable, because on a phone the AO pass is
//  the first thing that should go.
// ===========================================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

export class PostProcessing {
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = opts.enabled !== false;
    this.composer = null;
    this.passes = {};
    this._size = new THREE.Vector2();
    this.build(opts);
  }

  build(opts = {}) {
    const { ao = true, bloom = true, smaa = true } = opts;
    this.renderer.getSize(this._size);
    const w = Math.max(2, this._size.x);
    const h = Math.max(2, this._size.y);

    this.dispose();

    const composer = new EffectComposer(this.renderer);
    composer.setSize(w, h);
    this.composer = composer;

    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);
    this.passes.render = renderPass;

    if (ao) {
      // GTAO rather than SAO. SAO reconstructs position from a depth texture
      // and could not cope with this camera's 0.1 m to 4.2 km range — it came
      // out brightening the hull and darkening the turret roof rather than
      // occluding anything. GTAO works from view-space normals and handles the
      // range correctly.
      const gtao = new GTAOPass(this.scene, this.camera, w, h);
      // Tuned for a scene measured in metres: occlusion should read at the
      // scale of a road wheel and a breech block, not a whole battlefield.
      gtao.updateGtaoMaterial({
        radius: 0.35,          // metres of search radius
        distanceExponent: 1.0,
        thickness: 0.25,
        scale: 1.0,
        samples: 12,
        distanceFallOff: 1.0,
        screenSpaceRadius: false,
      });
      gtao.blendIntensity = 0.85;
      composer.addPass(gtao);
      this.passes.ao = gtao;
    }

    if (bloom) {
      // Threshold ABOVE white: only genuinely emissive things — fire, muzzle
      // flashes, a burning vehicle — should glare. At a threshold below 1 a
      // sunlit Dunkelgelb hull qualifies, and the tank turns into a lamp.
      const b = new UnrealBloomPass(new THREE.Vector2(w, h), 0.30, 0.45, 1.10);
      composer.addPass(b);
      this.passes.bloom = b;
    }

    // Tone mapping and colour-space conversion, once, at the end.
    const output = new OutputPass();
    composer.addPass(output);
    this.passes.output = output;

    if (smaa) {
      const s = new SMAAPass(w, h);
      composer.addPass(s);
      this.passes.smaa = s;
    }

    this.config = { ao, bloom, smaa };
  }

  setSize(w, h) {
    if (!this.composer) return;
    this.composer.setSize(w, h);
    this.passes.bloom?.setSize?.(w, h);
    this.passes.smaa?.setSize?.(w, h);
    this.passes.ao?.setSize?.(w, h);
  }

  setCamera(camera) {
    this.camera = camera;
    if (this.passes.render) this.passes.render.camera = camera;
    if (this.passes.ao) this.passes.ao.camera = camera;
  }

  /** Bloom strength follows the action: a burning tank glares more. */
  setBloomStrength(v) {
    if (this.passes.bloom) this.passes.bloom.strength = v;
  }

  render(dt) {
    if (!this.enabled || !this.composer) return false;
    this.composer.render(dt);
    return true;
  }

  dispose() {
    if (!this.composer) return;
    for (const p of this.composer.passes) p.dispose?.();
    this.composer.renderTarget1?.dispose?.();
    this.composer.renderTarget2?.dispose?.();
    this.composer = null;
    this.passes = {};
  }
}
