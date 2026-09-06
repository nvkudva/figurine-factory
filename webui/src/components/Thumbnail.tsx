import { useEffect, useState } from "react";
import { getThumbnail } from "../thumbnails.ts";
import styles from "./Thumbnail.module.css";

export function Thumbnail({ url, hasMesh, alt }: {
  url: string;
  hasMesh: boolean;
  alt: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasMesh) return;
    let live = true;
    getThumbnail(url)
      .then((d) => live && setSrc(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [url, hasMesh]);

  return (
    <div className={styles.frame}>
      {!hasMesh || failed ? (
        <div className={styles.none} title="no mesh was written">∅</div>
      ) : src ? (
        <img className={styles.img} src={src} alt={alt} />
      ) : (
        <div className={styles.pending}>···</div>
      )}
    </div>
  );
}
