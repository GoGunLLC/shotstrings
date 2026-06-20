// Sample / placeholder shot-string data + seeded generator.
// Replace this with real database queries when the backend is wired up.

function mul(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mean(arr) {
  return arr.reduce((x, y) => x + y, 0) / arr.length;
}

const RAW = [
  { id: "fx",   brand: "FX",          model: "Impact M3",     cal: ".25",  grains: 25.4, base: 905, pattern: "reg",    shots: 48, fill: "250 bar", price: 1899, color: "#2fb8a0", seed: 11 },
  { id: "rw",   brand: "Daystate",    model: "Red Wolf HP",   cal: ".22",  grains: 18.1, base: 880, pattern: "reg",    shots: 60, fill: "250 bar", price: 2199, color: "#c9a96f", seed: 22 },
  { id: "s510", brand: "Air Arms",    model: "S510 Ultimate", cal: ".177", grains: 8.4,  base: 920, pattern: "reg",    shots: 45, fill: "190 bar", price: 1149, color: "#6f9bd6", seed: 33 },
  { id: "broc", brand: "Brocock",     model: "Sniper XR",     cal: ".22",  grains: 15.9, base: 810, pattern: "reg",    shots: 55, fill: "250 bar", price: 1099, color: "#c77fb0", seed: 44 },
  { id: "aven", brand: "Air Venturi", model: "Avenger",       cal: ".22",  grains: 18.1, base: 900, pattern: "budget", shots: 40, fill: "300 bar", price: 349,  color: "#d98f3d", seed: 55 },
  { id: "coy",  brand: "Gamo",        model: "Coyote",        cal: ".22",  grains: 15.9, base: 875, pattern: "bell",   shots: 30, fill: "232 bar", price: 399,  color: "#8a8f98", seed: 66 },
];

export const GUNS = RAW.map((g) => {
  const rng = mul(g.seed);
  const vels = [];
  for (let i = 0; i < g.shots; i++) {
    const t = g.shots > 1 ? i / (g.shots - 1) : 0;
    let v;
    if (g.pattern === "reg") {
      const drop = t > 0.88 ? ((t - 0.88) / 0.12) * 55 : 0;
      v = g.base - drop + (rng() * 8 - 4);
    } else if (g.pattern === "bell") {
      v = g.base - 55 + Math.sin(t * Math.PI) * 72 + (rng() * 9 - 4.5);
    } else {
      v = g.base - t * 52 + (rng() * 18 - 9);
    }
    vels.push(Math.round(v));
  }
  const fpe = vels.map((s) => (s * s * g.grains) / 450240);
  const mv = Math.round(mean(vels));
  const devs = vels.map((s) => s - mv);
  const sd = Math.sqrt(mean(devs.map((d) => d * d)));
  return {
    ...g,
    vels,
    fpe,
    mv,
    devs,
    afpe: mean(fpe).toFixed(1),
    es: Math.max(...vels) - Math.min(...vels),
    sd: sd.toFixed(1),
    calDisp: "·" + g.cal.replace(".", ""),
  };
});

export const BY_ID = Object.fromEntries(GUNS.map((g) => [g.id, g]));
