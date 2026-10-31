import { useEffect, useState } from "react";

// The film layer: a slowly moving establishing shot behind the interface,
// grain, drifting dust in the light, optional rain and letterbox bars.
// Pure decoration — nothing here takes pointer events.

const asset = (src?: string) => (src ? `/${src}` : undefined);

export function Backdrop({ src, rain = false, dim = 0.62 }: { src?: string; rain?: boolean; dim?: number }) {
  // Cross-fade between shots: keep the previous image until the new one loads.
  const [shots, setShots] = useState<{ src: string; key: number }[]>([]);
  useEffect(() => {
    const url = asset(src);
    if (!url) return;
    const img = new Image();
    img.onload = () => setShots((s) => (s.at(-1)?.src === url ? s : [...s.slice(-1), { src: url, key: Date.now() }]));
    img.src = url;
  }, [src]);

  return (
    <div className="backdrop" aria-hidden="true" style={{ ["--dim" as string]: dim }}>
      {shots.map((s, i) => (
        <div key={s.key} className={`shot${i === shots.length - 1 ? " current" : ""}`} style={{ backgroundImage: `url(${s.src})` }} />
      ))}
      <div className="shade" />
      {rain && <div className="rain" />}
      <div className="dust" />
    </div>
  );
}

export function FilmGrain() {
  return <div className="grain" aria-hidden="true" />;
}

export function Letterbox({ show }: { show: boolean }) {
  return <div className={`letterbox${show ? " on" : ""}`} aria-hidden="true" />;
}

export function Portrait({ src, name, size = "md" }: { src?: string; name: string; size?: "sm" | "md" }) {
  if (!src)
    return (
      <span className={`medallion${size === "md" ? " big" : ""}`} aria-hidden="true">
        {name
          .split(" ")
          .map((w) => w[0])
          .join("")}
      </span>
    );
  return <span className={`portrait-thumb ${size}`} aria-hidden="true" style={{ backgroundImage: `url(/${src})` }} />;
}

export function useWide() {
  const query = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}
