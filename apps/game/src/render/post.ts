// Post-processing chain (medium/high tiers only; low renders straight to screen):
//   Render → [Bloom (high only)] → Grade (split-tone, contrast, saturation, vignette) → Output (ACES + sRGB)
// Grading runs in linear HDR before tone mapping. Costs one extra full-screen
// pass on medium; bloom adds a half-res mip chain on high.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uShadow: { value: new THREE.Color(0.93, 0.99, 1.04) }, // cool teal shadows
    uHigh: { value: new THREE.Color(1.05, 1.0, 0.93) }, // warm highlights
    uWarmth: { value: 0.5 },
    uSat: { value: 1.05 },
    uContrast: { value: 1.05 },
    uVignette: { value: 0.28 },
    uAspect: { value: 1.6 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadow; uniform vec3 uHigh;
    uniform float uWarmth; uniform float uSat; uniform float uContrast; uniform float uVignette; uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // split toning: shadows cool, highlights warm (warmth follows district restoration)
      float hw = smoothstep(0.05, 0.6, l);
      vec3 high = mix(vec3(1.0), uHigh, 0.3 + uWarmth * 0.5);
      vec3 shad = mix(uShadow, vec3(1.0), uWarmth * 0.6);
      c *= mix(shad, high, hw);
      // lift the blacks a touch so shaded streets keep detail on phone screens
      c += vec3(0.010, 0.012, 0.014);
      // saturation + gentle contrast around mid-grey (in linear, pivot ~0.18)
      c = mix(vec3(l), c, uSat);
      c = max(vec3(0.0), (c - 0.18) * uContrast + 0.18);
      // vignette
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
      float v = smoothstep(0.95, 0.25, length(d));
      c *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = vec4(c, src.a);
    }`,
};

export class PostFX {
  readonly composer: EffectComposer;
  private grade: ShaderPass;
  private bloom: UnrealBloomPass | null = null;
  private w = 0;
  private h = 0;

  constructor(private gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, bloom: boolean) {
    const size = gl.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 0 });
    this.composer = new EffectComposer(gl, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    if (bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.45, 0.88);
      this.composer.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  /** Only resizes when the drawing buffer actually changed (iOS resize leak). */
  sync(): void {
    const s = this.gl.getDrawingBufferSize(new THREE.Vector2());
    if (s.x === this.w && s.y === this.h) return;
    this.w = s.x;
    this.h = s.y;
    this.composer.setPixelRatio(1);
    this.composer.setSize(s.x, s.y);
    this.grade.uniforms.uAspect.value = s.x / Math.max(1, s.y);
  }

  setWarmth(w: number): void {
    this.grade.uniforms.uWarmth.value = w;
  }

  render(): void {
    this.sync();
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.bloom?.dispose();
  }
}
