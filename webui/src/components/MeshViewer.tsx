import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { cx } from "../cx.ts";
import styles from "./MeshViewer.module.css";

/** Reads the CSS token so the viewer follows the page theme instead of fighting it. */
function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function MeshViewer({ url, hasMesh }: { url: string; hasMesh: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasMesh || !host.current) return;
    const mount = host.current;
    let raf = 0;
    let disposed = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.domElement.className = cx(styles.canvas);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x404050, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(1, 1.4, 1.2);
    scene.add(key);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.1;

    new STLLoader().load(
      url,
      (geometry) => {
        if (disposed) return;
        geometry.computeVertexNormals();
        geometry.center();

        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(token("--accent", "#7aa2f7")),
          roughness: 0.55,
          metalness: 0.05,
          flatShading: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2; // STL is Z-up; three.js is Y-up.
        scene.add(mesh);

        const size = new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
        const radius = Math.max(size.x, size.y, size.z);
        camera.position.set(radius * 0.9, radius * 0.7, radius * 1.5);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();
        setLoading(false);
      },
      undefined,
      () => !disposed && (setError("could not load the mesh"), setLoading(false)),
    );

    const resize = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = mount;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    resize.observe(mount);

    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [url, hasMesh]);

  return (
    <div className={styles.wrap}>
      <div ref={host} style={{ width: "100%", height: "100%" }} />
      {!hasMesh && (
        <div className={styles.overlay}>
          No mesh. Validation failed, so nothing was written — a bad STL is worse than no STL.
        </div>
      )}
      {hasMesh && (error || loading) && (
        <div className={styles.overlay}>{error ?? "loading mesh…"}</div>
      )}
      {hasMesh && !error && !loading && <div className={styles.hint}>drag to orbit · scroll to zoom</div>}
    </div>
  );
}
