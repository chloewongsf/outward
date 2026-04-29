type Stop = { hour: number; c1: string; c2: string; c3: string };

// Color stops keyed to real sky moments
const SKY: Stop[] = [
  { hour:  0, c1: "#0D1B2A", c2: "#111630", c3: "#090820" }, // midnight — deep navy
  { hour:  5, c1: "#1E1040", c2: "#2D1555", c3: "#150828" }, // pre-dawn — dark indigo
  { hour:  6, c1: "#C4607A", c2: "#E8905A", c3: "#F0C080" }, // sunrise — coral/amber
  { hour:  8, c1: "#FDF8F2", c2: "#F5E2DF", c3: "#E8D8EE" }, // morning — original warm
  { hour: 13, c1: "#F5F2EC", c2: "#EDE5DA", c3: "#E0D5EC" }, // midday — bright & airy
  { hour: 16, c1: "#FDECD8", c2: "#F5CCA0", c3: "#EAB8C0" }, // golden hour — amber
  { hour: 18, c1: "#E8784A", c2: "#C85060", c3: "#882855" }, // sunset — deep orange/rose
  { hour: 20, c1: "#5A2860", c2: "#301848", c3: "#180828" }, // dusk — mauve/purple
  { hour: 22, c1: "#0D1B2A", c2: "#111630", c3: "#090820" }, // night — back to navy
  { hour: 24, c1: "#0D1B2A", c2: "#111630", c3: "#090820" }, // midnight (wrap)
];

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function lerp(a: number, b: number, t: number) {
  return Math.round(a + (b - a) * t);
}

function lerpHex(h1: string, h2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(h1);
  const [r2, g2, b2] = hexToRgb(h2);
  const r = lerp(r1, r2, t).toString(16).padStart(2, "0");
  const g = lerp(g1, g2, t).toString(16).padStart(2, "0");
  const b = lerp(b1, b2, t).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

export function getSkyGradient(): string {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;

  let prev = SKY[0];
  let next = SKY[SKY.length - 1];

  for (let i = 0; i < SKY.length - 1; i++) {
    if (h >= SKY[i].hour && h < SKY[i + 1].hour) {
      prev = SKY[i];
      next = SKY[i + 1];
      break;
    }
  }

  const t = (h - prev.hour) / (next.hour - prev.hour);
  const c1 = lerpHex(prev.c1, next.c1, t);
  const c2 = lerpHex(prev.c2, next.c2, t);
  const c3 = lerpHex(prev.c3, next.c3, t);

  return `linear-gradient(160deg, ${c1} 0%, ${c2} 45%, ${c3} 100%)`;
}
