// Generates the case's photographic art with muse-image-1.0 (Meta Model API).
// Usage: npx tsx scripts/generate-art.ts [name ...]   — no names = everything missing.
// Output: cases/missing-original/art/<name>.png (converted to JPEG afterwards).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
const KEY = process.env.LLAMA_API_KEY;
if (!KEY) throw new Error("LLAMA_API_KEY missing");
const OUT = "cases/missing-original/art"; // raw PNGs; convert with: sips -s format jpeg -s formatOptions 72 -Z 1600 <png> --out cases/missing-original/media/art/<name>.jpg
mkdirSync(OUT, { recursive: true });

const STYLE =
  "Cinematic film still, shot on 35mm with anamorphic lens, low-key lighting, warm amber practical lights against cold blue shadows, volumetric haze, shallow depth of field, subtle film grain, teal and amber color grade, photorealistic, highly detailed. No text, no letters, no logos, no watermark.";

const ART: Record<string, { prompt: string; size?: string }> = {
  title: { prompt: "An empty small private photography gallery at night, white walls with framed black-and-white photographs, one empty picture frame lit by a single spotlight in the centre, polished concrete floor reflecting the light, deep shadows." },
  exterior: { prompt: "A narrow European city street at night in the rain, a small gallery storefront with a large dark display window and warm light inside, wet cobblestones reflecting street lamps, nobody on the street." },
  archive: { prompt: "A small gallery archive room at night, grey archival boxes on steel shelves, a green banker's desk lamp on a wooden table, cold moonlight through a tall window, dust motes in the light beam, no people." },
  office: { prompt: "A cluttered small office desk in a gallery at night, an old beige desktop computer with a glowing screen, scattered papers, a mug, a green banker's lamp, rain on the window behind, no people, the screen shows no readable text." },
  packing: { prompt: "A gallery packing room at night: a long wooden work table with cardboard archival boxes, rolls of acid-free paper and paper offcuts, a tall dark wooden cabinet against the wall with one door slightly ajar, a single hanging bulb, no people." },
  interlude: { prompt: "A dark gallery corridor at night seen from low angle, a thin line of warm light under a closed door at the far end, framed photographs on the walls in shadow, haze." },
  marina: { size: "1024x1536", prompt: "Close-up cinematic portrait of a 34-year-old woman, gallery administrator, tired but composed, dark hair in a low bun, cream blouse, faint worry in her eyes, sitting in a dim office, warm desk-lamp key light from the side, cold blue rim light, 85mm lens, background softly blurred." },
  oliver: { size: "1024x1536", prompt: "Close-up cinematic portrait of a 41-year-old man, a photographer and technician, short stubble, rolled-up sleeves of a dark work shirt, a camera strap around his neck, sceptical, direct gaze, standing in a dim studio with a softbox glowing behind him, 85mm lens, background softly blurred." },
  paul: { size: "1024x1536", prompt: "Close-up cinematic portrait of a 58-year-old man, owner of a small gallery, grey hair, tailored dark suit with an open collar, proud and slightly offended expression, standing in front of framed photographs in a dim gallery hall, warm spotlight from above, 85mm lens, background softly blurred." },
  p1: { prompt: "Overhead photograph of an open grey archival folder on a steel archive shelf: on the left a black-and-white silver gelatin print of a misty river embankment with a stone parapet and four street lamps, on the right the back of a second print showing blank cream-coloured aged paper with slightly yellowed edges, soft cold light, documentary style." },
  p2: { prompt: "Overhead photograph of an open grey archival folder on a steel archive shelf: on the left a black-and-white print of a misty river embankment with a stone parapet and four street lamps, on the right the back of a print showing bright clean pure white modern paper, harsh flash lighting, documentary style." },
  p3: { prompt: "Photograph taken with a flash of a gallery packing table in the evening: cardboard boxes, rolls of white acid-free paper, scattered paper offcuts on the left half of the table with the corner of a cream envelope peeking out from under a sheet of paper, and behind the table on the right a tall dark wooden cabinet with its door ajar showing a flat parcel wrapped in brown paper on a shelf." },
  p4: { prompt: "Fisheye doorbell security camera still, slightly washed-out colors, a delivery courier in a red jacket holding cardboard boxes at a glass gallery door, a woman with dark hair in a bun opening the door, daytime." },
  p5: { prompt: "Wide photograph of a small modern photography gallery hall in daylight, white walls with three framed black-and-white photographs, polished concrete floor, nobody present." },
  p6: { prompt: "Photograph of a gallery hall in daylight: a grey-haired man in a dark suit and a dark-haired woman in a cream blouse standing with their backs half-turned, discussing a small wall label next to a framed photograph, faces not clearly visible." },
};

async function generate(name: string) {
  const { prompt, size } = ART[name]!;
  const evidence = /^p\d$/.test(name);
  const full = evidence ? `${prompt} Realistic photograph, natural colors, sharp focus. No text, no letters, no logos, no watermark.` : `${prompt} ${STYLE}`;
  const t0 = Date.now();
  const res = await fetch("https://api.meta.ai/v1/images/generations", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: "muse-image-1.0", n: 1, size: size ?? "1536x1024", prompt: full }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { data: { b64_json: string }[] };
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data.data[0]!.b64_json, "base64"));
  console.log(`${name} ${Math.round((Date.now() - t0) / 1000)}s`);
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ART).filter((n) => !existsSync(`${OUT}/${n}.png`) && !existsSync(`${OUT}/${n}.jpg`));
const queue = [...wanted];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let n = queue.shift(); n; n = queue.shift()) {
      try {
        await generate(n);
      } catch (e) {
        console.error(String(e));
      }
    }
  }),
);
