import * as THREE from 'three'
import {
  BloomEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing'

/**
 * Final grade on the tone-mapped image: warm highlights, slightly cool shadows, a touch more
 * saturation and contrast ("warm Central Asian light"). One cheap pass merged into the effect pass.
 */
class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(vec3(0.985, 1.0, 1.03), vec3(1.04, 1.0, 0.945), smoothstep(0.0, 0.55, l));
  c = mix(vec3(l), c, 1.1);
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.22);
  outputColor = vec4(max(c, 0.0), inputColor.a);
}`)
  }
}

export interface PostFXOptions {
  bloom: boolean
  smaa: boolean
  vignette: boolean
}

/**
 * Postprocessing chain (pmndrs/postprocessing). When enabled, tone mapping happens in the
 * final effect pass and the renderer itself renders linear HDR into a half-float buffer.
 */
export class PostFX {
  private composer: EffectComposer | null = null
  private bloom: BloomEffect | null = null
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly camera: THREE.Camera

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer
    this.scene = scene
    this.camera = camera
  }

  get enabled(): boolean {
    return this.composer !== null
  }

  /** Render target the scene is drawn into (null = the canvas). Program variants depend on it. */
  get sceneTarget(): THREE.WebGLRenderTarget | null {
    return this.composer ? this.composer.inputBuffer : null
  }

  configure(opts: PostFXOptions | null) {
    this.composer?.dispose()
    this.composer = null
    this.bloom = null
    if (!opts) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping
      return
    }
    this.renderer.toneMapping = THREE.NoToneMapping
    const composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 })
    composer.addPass(new RenderPass(this.scene, this.camera))
    const effects = []
    if (opts.bloom) {
      this.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.25, intensity: 0.45, radius: 0.7, levels: 6 })
      effects.push(this.bloom)
    }
    if (opts.vignette) effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.42 }))
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }))
    effects.push(new GradeEffect())
    composer.addPass(new EffectPass(this.camera, ...effects))
    if (opts.smaa) composer.addPass(new EffectPass(this.camera, new SMAAEffect({ preset: SMAAPreset.MEDIUM })))
    this.composer = composer
    const size = this.renderer.getSize(new THREE.Vector2())
    composer.setSize(size.x, size.y)
  }

  /** night 0..1: stronger bloom for lit windows and lamps. */
  setNight(night: number) {
    if (this.bloom) this.bloom.intensity = 0.4 + night * 0.7
  }

  setSize(w: number, h: number) {
    this.composer?.setSize(w, h)
  }

  render(dt: number) {
    if (this.composer) this.composer.render(dt)
    else this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    this.composer?.dispose()
    this.composer = null
  }
}
