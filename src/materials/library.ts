import {
  AdditiveBlending,
  Color,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Texture,
} from 'three';
import {
  makeBrushedRoughness,
  makeDotAlbedo,
  makeDotBump,
  makeNormalNoise,
  makeRoughnessNoise,
} from './textures';

/**
 * Shared PBR materials. Each material has distinct optical properties:
 *  - chassis:  bead-blasted, dark anodised aluminium (metallic, brushed roughness variation)
 *  - cover:    soft-touch polymer (dielectric, satin, light clear-coat)
 *  - seam:     matte black panel gap
 *  - foot:     rubber
 *  - contact:  gold-plated contacts (polished metal)
 *  - insert:   connector housing polymer
 *  - steel:    magnets
 *  - button:   glossy polymer caps
 *  - silicone: LED pad diffuser
 *  - glass:    additive specular-only glass cover (keeps the screen beneath fully legible)
 *  - ground:   satin gray stone-like coating with microtexture
 */
export interface Materials {
  chassis: MeshPhysicalMaterial;
  cover: MeshPhysicalMaterial;
  seam: MeshStandardMaterial;
  foot: MeshStandardMaterial;
  contact: MeshStandardMaterial;
  insert: MeshStandardMaterial;
  steel: MeshStandardMaterial;
  button: MeshPhysicalMaterial;
  buttonWell: MeshBasicMaterial;
  glass: MeshPhysicalMaterial;
  ground: MeshStandardMaterial;
}

let cached: Materials | null = null;

export function getMaterials(): Materials {
  if (cached) return cached;

  const brushed = makeBrushedRoughness(11);
  brushed.repeat.set(1.4, 1.4);
  const polymerNoise = makeRoughnessNoise(23, 0.9, 0.14);
  polymerNoise.repeat.set(3, 3);
  const buttonNoise = makeRoughnessNoise(31, 0.9, 0.08);

  const groundNormal = makeNormalNoise(101, 1.6);
  groundNormal.repeat.set(560, 560);
  const groundRough = makeRoughnessNoise(77, 0.92, 0.1, 256);
  groundRough.repeat.set(200, 200);

  cached = {
    chassis: new MeshPhysicalMaterial({
      color: new Color('#34363b'),
      metalness: 0.92,
      roughness: 0.46,
      roughnessMap: brushed,
      envMapIntensity: 1.1,
    }),
    cover: new MeshPhysicalMaterial({
      color: new Color('#1b1c20'),
      metalness: 0,
      roughness: 0.42,
      roughnessMap: polymerNoise,
      clearcoat: 0.18,
      clearcoatRoughness: 0.55,
      envMapIntensity: 0.9,
    }),
    seam: new MeshStandardMaterial({ color: '#050506', roughness: 0.9 }),
    foot: new MeshStandardMaterial({ color: '#09090a', roughness: 0.95 }),
    contact: new MeshStandardMaterial({
      color: new Color('#d3b074'),
      metalness: 1,
      roughness: 0.26,
      envMapIntensity: 1.4,
    }),
    insert: new MeshStandardMaterial({ color: '#0d0d0f', roughness: 0.55 }),
    steel: new MeshStandardMaterial({ color: '#8f9399', metalness: 1, roughness: 0.38 }),
    button: new MeshPhysicalMaterial({
      color: new Color('#2b2c31'),
      metalness: 0,
      roughness: 0.32,
      roughnessMap: buttonNoise,
      clearcoat: 0.5,
      clearcoatRoughness: 0.3,
      envMapIntensity: 1.1,
    }),
    buttonWell: new MeshBasicMaterial({ color: '#020203' }),
    glass: new MeshPhysicalMaterial({
      color: new Color('#000000'),
      metalness: 0,
      roughness: 0.05,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.3,
      envMapIntensity: 1.6,
      ior: 1.5,
    }),
    ground: new MeshStandardMaterial({
      color: new Color('#76777b'),
      roughness: 0.82,
      metalness: 0,
      roughnessMap: groundRough,
      normalMap: groundNormal,
      envMapIntensity: 0.55,
    }),
  };
  cached.ground.normalScale.set(0.22, 0.22);
  return cached;
}

/** LED pad (silicone) material factory: one per screen because each owns its emissive texture. */
export function makeSiliconeMaterial(emissiveMap: Texture) {
  const albedo = makeDotAlbedo(512, 80);
  const bump = makeDotBump(512, 80);
  return {
    material: new MeshPhysicalMaterial({
      map: albedo,
      emissiveMap,
      bumpMap: bump,
      bumpScale: 0.6,
      color: '#ffffff',
      emissive: new Color('#ffffff'),
      emissiveIntensity: 1.5,
      roughness: 0.55,
      metalness: 0,
      clearcoat: 0.25,
      clearcoatRoughness: 0.45,
    }),
    dispose: () => {
      albedo.dispose();
      bump.dispose();
    },
  };
}
