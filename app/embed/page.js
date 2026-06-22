"use client";

// Standalone, chrome-free render of a shot-string comparison chart, meant to be
// dropped into an <iframe> on a forum post, product page, etc. (the same way a
// YouTube embed works). It reads the same `ids` + `metric` params the main graph
// view encodes, so a copied embed reproduces exactly what was on screen.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import { getShotStrings } from "../lib/shotStrings";

// See note in app/page.js: canvas ctx.font can't use CSS variables, so use a
// literal mono stack here.
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
        titleFont: { family: MONO, size: 13 },
        bodyFont: { family: MONO, size: 13 },
        usePointStyle: true,
        callbacks: { title: (items) => "SHOT " + (items[0] ? items[0].label : "") },
      },
    },
    scales: {
      x: {
        title: { display: true, text: "Shot number", color: muted, font: { family: MONO, size: 12 } },
        grid: { color: grid },
        ticks: { color: muted, font: { family: MONO, size: 12 }, maxTicksLimit: 12 },
      },
      y: {
        title: { display: true, text: yTitle, color: muted, font: { family: MONO, size: 12 } },
        grid: { color: grid },
        ticks: { color: muted, font: { family: MONO, size: 12 } },
      },
    },
  };
}

export default function Embed() {
  const [guns, setGuns] = useState([]);
  const [ids, setIds] = useState([]);
  const [metric, setMetric] = useState("vel");
  const [loaded, setLoaded] = useState(false);

  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  // Read the embed params straight from the URL (avoids a Suspense boundary on
  // useSearchParams and matches how the main page restores graph state).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setIds((params.get("ids") || "").split(",").filter(Boolean));
    const m = params.get("metric");
    if (m === "vel" || m === "fpe" || m === "dev") setMetric(m);
  }, []);

  useEffect(() => {
    let alive = true;
    getShotStrings().then(({ guns }) => {
      if (alive) {
        setGuns(guns);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Build a lookup off the full list so the palette colors line up with the
  // main site (colors are assigned by full-list index in shotStrings.js).
  const byId = useMemo(
    () => Object.fromEntries(guns.map((g) => [g.id, g])),
    [guns]
  );

  const selGuns = useMemo(
    () => ids.map((id) => byId[id]).filter(Boolean),
    [ids, byId]
  );

  const renderChart = useCallback(() => {
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
        .map((v) => (v == null ? null : Math.round(v * 10) / 10))
        .concat(new Array(maxShots - ys.length).fill(null));
      return {
        label: g.brand + " " + g.model + (g.variantName ? " · " + g.variantName : ""),
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

  useEffect(() => {
    renderChart();
  }, [renderChart]);

  useEffect(() => () => chartRef.current && chartRef.current.destroy(), []);

  const homeHref = useMemo(() => {
    const p = new URLSearchParams();
    p.set("view", "graph");
    if (ids.length) p.set("ids", ids.join(","));
    p.set("metric", metric);
    return "/?" + p.toString();
  }, [ids, metric]);

  const empty = loaded && !selGuns.length;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        background: "#0a0c0e",
        overflow: "hidden",
      }}
    >
      {/* compact header: title + metric toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid #181b1f",
          flex: "0 0 auto",
        }}
      >
        <div className="mono" style={{ fontSize: 10, letterSpacing: 1.5, color: "#5e7170", whiteSpace: "nowrap" }}>
          SHOT-STRING COMPARISON
        </div>
        <div
          className="mono"
          style={{
            display: "flex",
            border: "1px solid #23272d",
            borderRadius: 3,
            overflow: "hidden",
            fontSize: 10,
            letterSpacing: 1,
            flex: "0 0 auto",
          }}
        >
          {METRICS.map((mt) => {
            const on = metric === mt.key;
            return (
              <span
                key={mt.key}
                onClick={() => setMetric(mt.key)}
                style={{
                  padding: "5px 10px",
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

      {/* chart fills the remaining height */}
      <div style={{ position: "relative", flex: 1, minHeight: 0, padding: "10px 12px" }}>
        {empty ? (
          <div
            className="mono"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              padding: 16,
              color: "#5e7170",
              fontSize: 12,
              letterSpacing: 1,
            }}
          >
            No shot strings to display.
          </div>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>

      {/* branding footer — links back to the full interactive view */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "6px 12px",
          borderTop: "1px solid #181b1f",
          flex: "0 0 auto",
        }}
      >
        <a
          href={homeHref}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            color: "#e6e7e9",
            textDecoration: "none",
            fontWeight: 800,
            fontSize: 12,
            letterSpacing: "-.3px",
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: TEAL,
              boxShadow: "0 0 7px 1px rgba(47,184,160,.85), inset 0 0 2px rgba(255,255,255,.5)",
              display: "inline-block",
              flex: "0 0 auto",
            }}
          />
          shotstrings.com
        </a>
        <a
          href={homeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mono"
          style={{ color: "#5e7170", textDecoration: "none", fontSize: 10, letterSpacing: 1 }}
        >
          OPEN FULL VIEW ↗
        </a>
      </div>
    </div>
  );
}
