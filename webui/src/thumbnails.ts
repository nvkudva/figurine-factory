/**
 * Mesh thumbnails for the run list.
 *
 * Six live WebGL canvases would mean six contexts, and browsers cap those at around
 * sixteen — the viewer in the middle would start losing its own. Instead one offscreen
 * renderer draws each mesh once, hands back a PNG data URL, and caches it. Requests are
 * serialised so a fast scroll cannot start six loads at once.
 */
import type * as ThreeNS from "three";

const SIZE = 168;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

let renderer: ThreeNS.WebGLRenderer | null = null;

/**
 * three.js is loaded on demand and shared with the main viewer's chunk, so importing it
 * here does not drag ~500 kB into the initial bundle just to draw list previews.
 */
async function three() {
  const [THREE, { STLLoader }] = await Promise.all([
    import("three"),
    import("three/examples/jsm/loaders/STLLoader.js"),
  ]);
  return { THREE, STLLoader };
}

function getRenderer(THREE: typeof ThreeNS): ThreeNS.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE);
    renderer.setPixelRatio(2);
  }
  return renderer;
}

async function render(url: string): Promise<string> {
  const { THREE, STLLoader } = await three();
  const geometry = await new STLLoader().loadAsync(url);
  geometry.computeVertexNormals();
  geometry.center();

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0x9fe8ff, 0x14203a, 2.4));
  const key = new THREE.DirectionalLight(0x22e6ff, 2.2);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff3ec8, 1.4);
  rim.position.set(-2.5, 0.5, -2);
  scene.add(rim);

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xcdd9e6, roughness: 0.42, metalness: 0.18 }),
  );
  mesh.rotation.x = -Math.PI / 2; // STL is Z-up, three.js is Y-up
  scene.add(mesh);

  const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) || 1;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, radius * 12);
  camera.position.set(radius * 0.75, radius * 0.62, radius * 1.5);
  camera.lookAt(0, 0, 0);

  const gl = getRenderer(THREE);
  gl.render(scene, camera);
  const dataUrl = gl.domElement.toDataURL("image/png");

  geometry.dispose();
  (mesh.material as ThreeNS.Material).dispose();
  return dataUrl;
}

export function getThumbnail(url: string): Promise<string> {
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);

  const pending = inflight.get(url);
  if (pending) return pending;

  const job = render(url)
    .then((dataUrl) => {
      cache.set(url, dataUrl);
      return dataUrl;
    })
    .finally(() => inflight.delete(url));

  inflight.set(url, job);
  return job;
}
