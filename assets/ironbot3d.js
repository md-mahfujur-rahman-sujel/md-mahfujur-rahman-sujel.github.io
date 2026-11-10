/* 3D Ironbot: renders the low-poly GLB inside the existing flyer button so the
   roam/follow/power/toggle logic in ironbot.js keeps governing it. Bundled by
   scripts/build_ironbot3d.cjs; never loaded on phones or without WebGL. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SIZE = { w: 132, h: 176 };

export function mount(btn, onFail) {
  const canvas = document.createElement('canvas');
  canvas.className = 'flyer-3d';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = `position:absolute;left:50%;top:50%;width:${SIZE.w}px;height:${SIZE.h}px;margin:${-SIZE.h / 2}px 0 0 ${-SIZE.w / 2}px;pointer-events:none;`;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (err) {
    canvas.remove();
    onFail(err);
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(SIZE.w, SIZE.h, false);

  const scene = new THREE.Scene();
  // PBR metal with no environment reflects nothing but black, so give it a cheap
  // procedural room to reflect instead of shipping an HDR file.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(32, SIZE.w / SIZE.h, 0.1, 20);
  camera.position.set(0, 0.15, 2.7);
  camera.lookAt(0, 0.1, 0);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x0a111a, 0.45));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.PointLight(0x67c7eb, 3, 8);
  rim.position.set(-2, 0.5, -2);
  scene.add(rim);

  const api = {
    model: null,
    frame(now) {
      if (!api.model) return;
      const t = now / 1000;
      const root = api.model;
      root.position.y = Math.sin(t * 1.7) * 0.06;
      root.rotation.y = Math.sin(t * 0.45) * 0.3;
      const swing = Math.sin(t * 2.2) * 0.3;
      const pose = api.pose(now);
      api.nodes['arm-l'].rotation.x = swing + pose.armL;
      api.nodes['arm-r'].rotation.x = -swing + pose.armR;
      api.nodes['arm-r'].rotation.z = pose.armRz;
      api.nodes['leg-l'].rotation.x = -swing * 0.6;
      api.nodes['leg-r'].rotation.x = swing * 0.6;
      api.nodes.head.rotation.z = pose.headZ;
      api.nodes.head.rotation.y = Math.sin(t * 0.7) * 0.18;
      if (api.visorMaterial) api.visorMaterial.emissiveIntensity = 1.1 + Math.sin(t * 3.1) * 0.35;
      renderer.render(scene, camera);
    },
    impulse: null,
    pose(now) {
      const base = { armL: 0, armR: 0, armRz: 0, headZ: 0 };
      if (!api.impulse || now > api.impulse.until) { api.impulse = null; return base; }
      const left = (api.impulse.until - now) / 1200;
      const ease = Math.sin(Math.min(left, 1) * Math.PI);
      if (api.impulse.kind === 'wave') return { armL: 0, armR: -2.2 * ease, armRz: -0.5 * ease, headZ: 0.12 * ease };
      return { armL: 0.3 * ease, armR: 0.3 * ease, armRz: 0, headZ: -0.22 * ease };
    },
    react(kind) {
      api.impulse = { kind, until: performance.now() + 1200 };
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      if (api.model) scene.remove(api.model);
      if (scene.environment) scene.environment.dispose();
      renderer.dispose();
      canvas.remove();
    }
  };

  const onLost = (e) => { e.preventDefault(); api.dispose(); onFail(new Error('webgl context lost')); };
  canvas.addEventListener('webglcontextlost', onLost);

  new GLTFLoader().load(
    'assets/ironbot.glb',
    (gltf) => {
      const nodes = {};
      for (const name of ['head', 'visor', 'arm-l', 'arm-r', 'leg-l', 'leg-r']) {
        nodes[name] = gltf.scene.getObjectByName(name);
      }
      if (!nodes.head || !nodes['arm-r'] || !nodes.visor) { onFail(new Error('glb missing named nodes')); return; }
      api.nodes = nodes;
      api.visorMaterial = nodes.visor.children[0] && nodes.visor.children[0].material;
      btn.querySelector('svg').style.display = 'none';
      btn.appendChild(canvas);
      gltf.scene.scale.setScalar(0.72);
      scene.add(gltf.scene);
      api.model = gltf.scene;
    },
    undefined,
    (err) => { api.dispose(); onFail(err); }
  );
  return api;
}
