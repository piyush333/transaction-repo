// Approximate relative positions of major Indian cities on a 0..400 x 0..450
// viewBox, hand-tuned to look right at a glance. Not geodetically accurate —
// this is a dashboard visualization, not a GIS tool. Unknown cities fall
// back to a stable hashed position so the map never breaks on new data.
const KNOWN_CITY_POSITIONS: Record<string, [number, number]> = {
  delhi: [185, 110],
  "new delhi": [185, 110],
  jaipur: [150, 145],
  lucknow: [230, 150],
  chandigarh: [175, 80],
  ahmedabad: [105, 210],
  surat: [105, 240],
  neemuch: [150, 195],
  udaipur: [125, 210],
  indore: [170, 220],
  bhopal: [190, 210],
  mumbai: [115, 270],
  pune: [135, 290],
  nagpur: [200, 250],
  hyderabad: [190, 300],
  kolkata: [295, 230],
  patna: [265, 180],
  bangalore: [175, 360],
  bengaluru: [175, 360],
  chennai: [215, 375],
  coimbatore: [175, 390],
  kochi: [165, 410],
  goa: [120, 320],
};

function hashPosition(seed: string): [number, number] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const x = 90 + (h % 220);
  const y = 130 + ((h >> 8) % 240);
  return [x, y];
}

export function cityMapPosition(cityName: string): [number, number] {
  const key = cityName.trim().toLowerCase();
  return KNOWN_CITY_POSITIONS[key] ?? hashPosition(key);
}

// Simplified, stylized India outline (not survey-accurate).
export const INDIA_OUTLINE_PATH =
  "M120,20 L165,15 L200,35 L215,60 L245,65 L275,90 L300,95 L320,130 L300,160 L330,175 L345,205 L315,225 L320,255 L290,250 L275,285 L250,300 L245,335 L215,345 L210,385 L195,420 L180,440 L165,410 L160,375 L135,360 L120,335 L95,320 L85,285 L60,270 L50,235 L65,205 L45,180 L55,145 L40,110 L65,90 L60,55 L90,45 Z";
