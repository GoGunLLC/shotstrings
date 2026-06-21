"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { getShotStrings } from "./lib/shotStrings";
import SiteNav from "./components/SiteNav";

// NOTE: canvas ctx.font does NOT support CSS variables (var(--...)) — including
// one silently invalidates the whole font string, so Chart.js falls back to a
// tiny default and ignores any size you set. Use a literal font stack here.
const MONO = "'Space Mono', ui-monospace, monospace";
const TEAL = "#2fb8a0";

const METRICS = [
  { key: "vel", label: "VELOCITY" },
  { key: "fpe", label: "ENERGY" },
  { key: "dev", label: "CONSISTENCY" },
];

function chartOptions(yTitle) {
  const grid = "rgba(255,255,255,0.05)";
  const muted = "#5e7170";
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0e1013",
        borderColor: "#23272d",
        borderWidth: 1,
        titleColor: "#e6e7e9",
        bodyColor: "#cdd2d8",
        padding: 11,
        cornerRadius: 4,
        titleFont: { family: MONO, size: 14 },
        bodyFont: { family: MONO, size: 14 },
        usePointStyle: true,
        callbacks: { title: (items) => "SHOT " + (items[0] ? items[0].label : "") },
      },
    },
    scales: {
      x: {
        title: { display: true, text: "Shot number", color: muted, font: { family: MONO, size: 13 } },
        grid: { color: grid },
        ticks: { color: muted, font: { family: MONO, size: 13 }, maxTicksLimit: 12 },
      },
      y: {
        title: { display: true, text: yTitle, color: muted, font: { family: MONO, size: 13 } },
        grid: { color: grid },
        ticks: { color: muted, font: { family: MONO, size: 13 } },
      },
    },
  };
}

export default function Home() {
  const [selected, setSelected] = useState([]);
  const [metric, setMetric] = useState("vel");
  const [query, setQuery] = useState("");
  const [guns, setGuns] = useState([]);

  useEffect(() => {
    let alive = true;
    getShotStrings().then(({ guns }) => {
      if (alive) setGuns(guns);
    });
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(
    () => Object.fromEntries(guns.map((g) => [g.id, g])),
    [guns]
  );

  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const active = selected.length > 0;
  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return [];
    return guns
      .filter(
        (g) =>
          !selected.includes(g.id) &&
          (g.brand + " " + g.model + " " + g.cal).toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [q, selected, guns]);

  const selGuns = useMemo(
    () => selected.map((id) => byId[id]).filter(Boolean),
    [selected, byId]
  );

  function pick(id) {
    setQuery("");
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function remove(id) {
    setSelected((prev) => prev.filter((x) => x !== id));
  }

  // Chart.js lifecycle
  useEffect(() => {
    if (!selGuns.length) {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maxShots = selGuns.reduce((m, g) => Math.max(m, g.shots), 0);
    const labels = Array.from({ length: maxShots }, (_, i) => i + 1);
    const getArr = (g) => (metric === "vel" ? g.vels : metric === "fpe" ? g.fpe : g.devs);
    const datasets = selGuns.map((g) => {
      const ys = getArr(g);
      const data = ys
        .map((v) => Math.round(v * 10) / 10)
        .concat(new Array(maxShots - ys.length).fill(null));
      return {
        label: g.brand + " " + g.model,
        data,
        borderColor: g.color,
        backgroundColor: g.color,
        pointBackgroundColor: g.color,
        pointHoverBackgroundColor: g.color,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        tension: 0,
        spanGaps: false,
      };
    });
    const yTitle =
      metric === "vel"
        ? "Velocity (fps)"
        : metric === "fpe"
        ? "Energy (ft-lb)"
        : "Deviation from mean (fps)";

    if (chartRef.current) {
      chartRef.current.data.labels = labels;
      chartRef.current.data.datasets = datasets;
      chartRef.current.options = chartOptions(yTitle);
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(canvas, {
        type: "line",
        data: { labels, datasets },
        options: chartOptions(yTitle),
      });
    }
  }, [selGuns, metric]);

  useEffect(() => () => chartRef.current && chartRef.current.destroy(), []);

  return (
    <div style={{ minHeight: "100vh" }}>
        <SiteNav active="index" />

        <div style={{ padding: "10px 40px 60px" }}>
          {/* hero */}
          <div style={{ padding: "60px 0 26px", textAlign: active ? "left" : "center" }}>
            {!active && (
              <div style={{ marginBottom: 6 }}>
                {guns.length > 0 && (
                  <div
                    className="mono"
                    style={{
                      fontSize: 12,
                      letterSpacing: 2,
                      color: "#5e7170",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 9,
                    }}
                  >
                    <span style={{ width: 7, height: 7, background: TEAL, display: "inline-block" }} />
                    MEASURED, NOT CLAIMED — {guns.length.toLocaleString()} SHOT STRING{guns.length === 1 ? "" : "S"} ON RECORD
                  </div>
                )}
                <h1
                  style={{
                    fontSize: 64,
                    lineHeight: 0.94,
                    fontWeight: 800,
                    letterSpacing: "-2.5px",
                    margin: "18px 0 0",
                  }}
                >
                  KNOW HOW IT
                  <br />
                  <span style={{ color: TEAL }}>REALLY SHOOTS</span>
                </h1>
                <p
                  style={{
                    maxWidth: 440,
                    color: "#868d96",
                    fontSize: 15,
                    lineHeight: 1.6,
                    margin: "18px auto 22px",
                  }}
                >
                  Real chronograph data for every airgun — average, spread and standard deviation.
                  Search a rifle or pistol, read exactly how it shoots, compare head to head.
                </p>
              </div>
            )}

            {/* search */}
            <div style={{ position: "relative", maxWidth: 700, margin: active ? "0" : "0 auto", textAlign: "left" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: "1px solid #23272d",
                  borderRadius: 4,
                  background: "#0e1013",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "0 14px 0 16px", display: "flex" }}>
                  <svg
                    viewBox="0 0 24 24"
                    style={{ width: 16, height: 16, fill: "none", stroke: "#5f656e", strokeWidth: 2 }}
                  >
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.5" y2="16.5" />
                  </svg>
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && matches.length) pick(matches[0].id);
                  }}
                  placeholder="Search an airgun — FX Impact, Red Wolf…"
                  autoComplete="off"
                  className="mono"
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#e6e7e9",
                    fontSize: 13,
                    padding: "15px 0",
                  }}
                />
                <div
                  className="mono"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    color: "#5e7170",
                    fontSize: 11,
                    letterSpacing: 1,
                    padding: "14px 18px",
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                >
                  <span
                    style={{
                      border: "1px solid #2a2f35",
                      borderRadius: 3,
                      padding: "2px 6px",
                      color: "#aeb4bc",
                    }}
                  >
                    ↵
                  </span>
                  ENTER TO READ
                </div>
              </div>

              {/* dropdown */}
              {matches.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 58,
                    background: "#0e1013",
                    border: "1px solid #23272d",
                    borderRadius: 6,
                    overflow: "hidden",
                    zIndex: 20,
                    boxShadow: "0 18px 40px rgba(0,0,0,.5)",
                  }}
                >
                  {matches.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => pick(m.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        cursor: "pointer",
                        borderBottom: "1px solid #181b1f",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            textTransform: "uppercase",
                            letterSpacing: 0.3,
                          }}
                        >
                          {m.brand} {m.model}
                        </div>
                        <div
                          className="mono"
                          style={{ fontSize: 11, color: "#7b8089", letterSpacing: 1, marginTop: 2 }}
                        >
                          {m.cal} cal · {m.fill}
                        </div>
                      </div>
                      <span style={{ color: TEAL, fontSize: 18, fontWeight: 700 }}>+</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* trending */}
            <div
              style={{
                marginTop: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: active ? "flex-start" : "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                className="mono"
                style={{ fontSize: 12, letterSpacing: 2, color: "#5e7170" }}
              >
                ON RECORD
              </span>
              {guns.slice(0, 4).map((t) => (
                <span
                  key={t.id}
                  onClick={() => pick(t.id)}
                  className="mono"
                  style={{
                    fontSize: 13,
                    color: "#aeb4bc",
                    border: "1px solid #23272d",
                    borderRadius: 3,
                    padding: "6px 12px",
                    cursor: "pointer",
                    textTransform: "uppercase",
                  }}
                >
                  {t.brand} {t.model}
                </span>
              ))}
            </div>
          </div>

          {/* recently submitted feed */}
          {!active && guns.length > 0 && (
            <Feed guns={guns} onPick={pick} />
          )}

          {/* results */}
          {active && (
            <div>
              {/* selected chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {selGuns.map((g) => (
                  <div
                    key={g.id}
                    className="mono"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      color: "#cdd2d8",
                      border: "1px solid #23272d",
                      borderRadius: 30,
                      padding: "6px 8px 6px 12px",
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: g.color }} />
                    <span style={{ textTransform: "uppercase" }}>
                      {g.brand} {g.model}
                    </span>
                    <span
                      onClick={() => remove(g.id)}
                      style={{
                        cursor: "pointer",
                        color: "#7b8089",
                        fontSize: 15,
                        lineHeight: 1,
                        padding: "0 2px",
                      }}
                    >
                      ×
                    </span>
                  </div>
                ))}
              </div>

              {/* comparison module */}
              <div style={{ border: "1px solid #181b1f", borderRadius: 6, position: "relative" }}>
                <div style={{ position: "absolute", top: -1, left: -1, width: 13, height: 13, borderTop: `1.5px solid ${TEAL}`, borderLeft: `1.5px solid ${TEAL}` }} />
                <div style={{ position: "absolute", top: -1, right: -1, width: 13, height: 13, borderTop: `1.5px solid ${TEAL}`, borderRight: `1.5px solid ${TEAL}` }} />
                <div style={{ position: "absolute", bottom: -1, left: -1, width: 13, height: 13, borderBottom: `1.5px solid ${TEAL}`, borderLeft: `1.5px solid ${TEAL}` }} />
                <div style={{ position: "absolute", bottom: -1, right: -1, width: 13, height: 13, borderBottom: `1.5px solid ${TEAL}`, borderRight: `1.5px solid ${TEAL}` }} />

                {/* header: metric toggle */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 18px",
                    borderBottom: "1px solid #181b1f",
                    flexWrap: "wrap",
                    gap: 10,
                  }}
                >
                  <div
                    className="mono"
                    style={{ fontSize: 11, letterSpacing: 2, color: "#5e7170" }}
                  >
                    SHOT-STRING COMPARISON · n={selGuns.length}
                  </div>
                  <div
                    className="mono"
                    style={{
                      display: "flex",
                      border: "1px solid #23272d",
                      borderRadius: 3,
                      overflow: "hidden",
                      fontSize: 11,
                      letterSpacing: 1,
                    }}
                  >
                    {METRICS.map((mt) => {
                      const on = metric === mt.key;
                      return (
                        <span
                          key={mt.key}
                          onClick={() => setMetric(mt.key)}
                          style={{
                            padding: "7px 13px",
                            cursor: "pointer",
                            background: on ? TEAL : "transparent",
                            color: on ? "#06100e" : "#7b8089",
                            fontWeight: on ? 700 : 400,
                          }}
                        >
                          {mt.label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* chart */}
                <div style={{ padding: "18px 18px 16px" }}>
                  <div style={{ position: "relative", height: 330, width: "100%" }}>
                    <canvas ref={canvasRef} />
                  </div>
                </div>

                {/* stat cards */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    borderTop: "1px solid #181b1f",
                  }}
                >
                  {selGuns.map((g) => (
                    <div
                      key={g.id}
                      style={{
                        padding: "16px 18px",
                        borderRight: "1px solid #181b1f",
                        borderBottom: "1px solid #181b1f",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: g.color }} />
                        <div
                          style={{
                            fontWeight: 800,
                            letterSpacing: "-.3px",
                            fontSize: 14,
                            textTransform: "uppercase",
                          }}
                        >
                          {g.brand} {g.model} <span style={{ color: TEAL }}>{g.calDisp}</span>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
                        <Stat label="AVG VEL" value={g.mv} unit=" fps" />
                        <Stat label="STD DEV" value={g.sd} unit=" fps" accent />
                        <Stat label="EXT SPREAD" value={g.es} unit=" fps" />
                        <Stat label="SHOTS/FILL" value={g.shots} unit="" />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 15 }}>
                        <div
                          className="mono"
                          style={{
                            flex: 1,
                            textAlign: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: 1,
                            background: TEAL,
                            color: "#06100e",
                            padding: "9px 6px",
                            borderRadius: 3,
                            cursor: "pointer",
                          }}
                        >
                          WATCH PROOF
                        </div>
                        <div
                          className="mono"
                          style={{
                            flex: 1,
                            textAlign: "center",
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: 1,
                            border: "1px solid #2a2f35",
                            color: "#cdd2d8",
                            padding: "9px 6px",
                            borderRadius: 3,
                            cursor: "pointer",
                          }}
                        >
                          ${g.price}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
    </div>
  );
}

// Mini shot-string curve used as each feed card's thumbnail.
function Sparkline({ data, color }) {
  const vals = (data || []).filter((v) => v != null);
  if (vals.length < 2) return null;
  const w = 300;
  const h = 70;
  const padX = 7;
  // Reserve extra headroom up top so the curve never rides under the
  // "N SHOTS" / caliber badges that sit in the thumbnail's top corners.
  const padTop = 24;
  const padBottom = 8;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const n = vals.length;
  const pts = vals.map((v, i) => {
    const x = padX + (i / (n - 1)) * (w - padX * 2);
    const y = padTop + (1 - (v - min) / span) * (h - padTop - padBottom);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function ConfigChip({ children, accent }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: 11,
        letterSpacing: 0.5,
        color: accent ? "#06100e" : "#aeb4bc",
        background: accent ? TEAL : "transparent",
        border: accent ? "none" : "1px solid #23272d",
        borderRadius: 3,
        padding: "3px 7px",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function FeedCard({ g, onPick }) {
  return (
    <div
      onClick={() => onPick(g.id)}
      style={{
        border: "1px solid #181b1f",
        borderRadius: 6,
        background: "#0c0e11",
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* thumbnail: the shot-string curve itself */}
      <div
        style={{
          position: "relative",
          height: 92,
          background: "#0e1013",
          borderBottom: "1px solid #181b1f",
        }}
      >
        <Sparkline data={g.vels} color={g.color} />
        <span
          className="mono"
          style={{
            position: "absolute",
            top: 8,
            left: 9,
            fontSize: 11,
            letterSpacing: 1,
            color: "#5e7170",
            background: "rgba(8,10,13,.7)",
            padding: "2px 6px",
            borderRadius: 3,
          }}
        >
          {g.shots} SHOTS
        </span>
        {g.cal && (
          <span
            className="mono"
            style={{
              position: "absolute",
              top: 8,
              right: 9,
              fontSize: 11,
              letterSpacing: 1,
              color: g.color,
              background: "rgba(8,10,13,.7)",
              padding: "2px 6px",
              borderRadius: 3,
            }}
          >
            {g.cal} CAL
          </span>
        )}
      </div>

      {/* body */}
      <div style={{ padding: "13px 14px", display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
        <div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: "-.3px",
              textTransform: "uppercase",
              lineHeight: 1.15,
            }}
          >
            {g.brand} {g.model}
          </div>
          <div
            className="mono"
            style={{ fontSize: 11, color: "#7b8089", letterSpacing: 0.5, marginTop: 3 }}
          >
            {g.projectile || "Custom projectile"} · {g.grains} gr
          </div>
        </div>

        {/* configuration chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          <ConfigChip>{g.fill}</ConfigChip>
          <ConfigChip>{g.regulated ? "Regulated" : "Unreg"}</ConfigChip>
          <ConfigChip>{g.suppressor ? g.suppressor : "Unmoderated"}</ConfigChip>
        </div>

        {/* headline stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            borderTop: "1px solid #181b1f",
            paddingTop: 10,
            marginTop: "auto",
          }}
        >
          <Stat label="AVG VEL" value={g.mv} unit=" fps" />
          <Stat label="STD DEV" value={g.sd} unit=" fps" accent />
          <Stat label="AVG E" value={g.afpe} unit=" ft-lb" />
        </div>

        {/* footer */}
        <div
          className="mono"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
            letterSpacing: 0.5,
            color: "#5f656e",
          }}
        >
          <span>{timeAgo(g.createdAt)}</span>
          {g.video?.url && (
            <a
              href={g.video.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: TEAL, textDecoration: "none", fontWeight: 700, letterSpacing: 1 }}
            >
              WATCH PROOF ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Feed({ guns, onPick }) {
  // Newest first; the base list is ordered oldest→newest.
  const recent = useMemo(() => {
    const copy = [...guns];
    copy.sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
    return copy.slice(0, 12);
  }, [guns]);

  return (
    <div style={{ marginTop: 46, maxWidth: 1100, marginLeft: "auto", marginRight: "auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 12, letterSpacing: 2, color: "#5e7170", display: "flex", alignItems: "center", gap: 9 }}
        >
          <span style={{ width: 7, height: 7, background: TEAL, display: "inline-block" }} />
          RECENTLY SUBMITTED
        </div>
        <div className="mono" style={{ fontSize: 11, letterSpacing: 1, color: "#3f474a" }}>
          TAP ANY CARD TO COMPARE
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))",
          gap: 14,
        }}
      >
        {recent.map((g) => (
          <FeedCard key={g.id} g={g} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, unit, accent }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 11, letterSpacing: 1, color: "#5f656e" }}>
        {label}
      </div>
      <div
        className="mono"
        style={{ fontSize: 17, fontWeight: 700, color: accent ? "#2fb8a0" : "#e6e7e9" }}
      >
        {value}
        <span style={{ fontSize: 11, color: "#5f656e" }}>{unit}</span>
      </div>
    </div>
  );
}
