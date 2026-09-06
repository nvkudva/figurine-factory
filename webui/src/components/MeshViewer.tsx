import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { cx } from "../cx.ts";
import styles from "./MeshViewer.module.css";

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

    scene.add(new THREE.HemisphereLight(0x9fe8ff, 0x0d1626, 2.0));
    const key = new THREE.DirectionalLight(0xbfefff, 2.0);
    key.position.set(1, 1.4, 1.2);
    scene.add(key);
    // Magenta rim light: the edge separation that makes the neon read as neon.
    const rim = new THREE.DirectionalLight(0xff3ec8, 1.5);
    rim.position.set(-1.6, 0.4, -1.4);
    scene.add(rim);

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
          // Pale filament, lit by the cyan key and magenta rim. A neon albedo blows out
          // to a flat silhouette and hides the surface the gates are talking about.
          color: new THREE.Color("#cdd9e6"),
          roughness: 0.38,
          metalness: 0.28,
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
          <span>
            <strong>no mesh written</strong>
            <br />
            a gate failed, so nothing was emitted —
            <br />
            a bad STL is worse than no STL
          </span>
        </div>
      )}
      {hasMesh && (error || loading) && (
        <div className={styles.overlay}>{error ?? "loading mesh…"}</div>
      )}
      {hasMesh && !error && !loading && <div className={styles.hint}>drag · orbit — scroll · zoom</div>}
    </div>
  );
}
