"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const field = {
  background: "#0e1013",
  border: "1px solid #23272d",
  borderRadius: 4,
  color: "#e6e7e9",
  fontSize: 13,
  padding: "9px 11px",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
};

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
  const [mode, setMode] = useState("recent"); // "recent" | "browse"
  const [selected, setSelected] = useState([]); // ids queued for comparison
  const [showCompare, setShowCompare] = useState(false);
  const [metric, setMetric] = useState("vel");
  const [query, setQuery] = useState("");
  const [guns, setGuns] = useState([]);
  const [isMobile, setIsMobile] = useState(false);
  const [filters, setFilters] = useState({
    cal: "",
    tank: "",
    supp: "",
    reg: "",
    brand: "",
    model: "",
  });
  const [chartHeight, setChartHeight] = useState(330); // px, drag-resizable

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Sensible default chart height per form factor (until the user drags it).
  useEffect(() => {
    setChartHeight(isMobile ? 220 : 330);
  }, [isMobile]);

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

  function toggle(id) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }
  function addSelected(id) {
    setQuery("");
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function clearAll() {
    setSelected([]);
  }

  // Drag the handle under the chart to grow/shrink how much room the graph takes.
  function startResize(e) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = chartHeight;
    const move = (ev) => {
      const next = Math.max(160, Math.min(760, startH + (ev.clientY - startY)));
      setChartHeight(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ---- Graph mode <-> shareable URL ----
  // The full graph state (selected strings, metric, mode, filters) is encoded
  // into the query string so the URL can be copied and reopened verbatim.
  const buildGraphQuery = () => {
    const p = new URLSearchParams();
    p.set("view", "graph");
    if (selected.length) p.set("ids", selected.join(","));
    p.set("metric", metric);
    p.set("mode", mode);
    for (const k of ["cal", "tank", "supp", "reg", "brand", "model"]) {
      if (filters[k]) p.set(k, filters[k]);
    }
    return p.toString();
  };

  const restoreFromParams = useCallback((params) => {
    const ids = (params.get("ids") || "").split(",").filter(Boolean);
    setSelected(ids);
    const m = params.get("metric");
    if (m === "vel" || m === "fpe" || m === "dev") setMetric(m);
    const md = params.get("mode");
    if (md === "recent" || md === "browse") setMode(md);
    setFilters({
      cal: params.get("cal") || "",
      tank: params.get("tank") || "",
      supp: params.get("supp") || "",
      reg: params.get("reg") || "",
      brand: params.get("brand") || "",
      model: params.get("model") || "",
    });
  }, []);

  // Opening the graph pushes one history entry so the browser Back button
  // returns to the root view; closing pops it back off.
  function openGraph() {
    const url = "?" + buildGraphQuery();
    if (window.history.state && window.history.state.ssView === "graph") {
      window.history.replaceState({ ssView: "graph" }, "", url);
    } else {
      window.history.pushState({ ssView: "graph" }, "", url);
    }
    setShowCompare(true);
  }
  const closeGraph = useCallback(() => {
    if (window.history.state && window.history.state.ssView === "graph") {
      window.history.back(); // pops the entry → popstate sets showCompare(false)
    } else {
      // Reached directly via a shared link (no entry to pop) — clean the URL.
      window.history.replaceState({}, "", window.location.pathname);
      setShowCompare(false);
    }
  }, []);

  // Reflect Back/Forward navigation into the view state.
  useEffect(() => {
    const onPop = () => {
      const isGraph = !!(window.history.state && window.history.state.ssView === "graph");
      if (isGraph) {
        restoreFromParams(new URLSearchParams(window.location.search));
        setShowCompare(true);
      } else {
        setShowCompare(false);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [restoreFromParams]);

  // On first load, restore graph state straight from the URL (shared link).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "graph") {
      restoreFromParams(params);
      setShowCompare(true);
    }
  }, [restoreFromParams]);

  // While in graph mode, keep the URL in step with the live state so a copy at
  // any moment reproduces exactly what's on screen.
  useEffect(() => {
    if (!showCompare) return;
    window.history.replaceState(window.history.state, "", "?" + buildGraphQuery());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCompare, selected, filters, metric, mode]);

  // If everything is removed while viewing the chart, drop back to browsing.
  useEffect(() => {
    if (showCompare && selected.length === 0) closeGraph();
  }, [showCompare, selected.length, closeGraph]);

  // Filter option lists, derived from the loaded data.
  const options = useMemo(() => {
    const uniq = (arr) => Array.from(new Set(arr.filter((x) => x != null && x !== "")));
    // Models cascade off the chosen brand so the list stays relevant.
    const modelPool = filters.brand ? guns.filter((g) => g.brand === filters.brand) : guns;
    return {
      cals: uniq(guns.map((g) => g.cal)).sort(),
      tanks: uniq(guns.map((g) => g.tankCc)).sort((a, b) => a - b),
      supps: uniq(guns.map((g) => g.suppressor)).sort(),
      brands: uniq(guns.map((g) => g.brand)).sort(),
      models: uniq(modelPool.map((g) => g.model)).sort(),
    };
  }, [guns, filters.brand]);

  const browseResults = useMemo(() => {
    return guns.filter((g) => {
      if (filters.cal && g.cal !== filters.cal) return false;
      if (filters.brand && g.brand !== filters.brand) return false;
      if (filters.model && g.model !== filters.model) return false;
      if (filters.reg === "reg" && !g.regulated) return false;
      if (filters.reg === "unreg" && g.regulated) return false;
      if (filters.tank && String(g.tankCc) !== filters.tank) return false;
      if (filters.supp) {
        if (filters.supp === "__none") {
          if (g.suppressor) return false;
        } else if (g.suppressor !== filters.supp) return false;
      }
      return true;
    });
  }, [guns, filters]);

  // Chart.js lifecycle — only while the comparison view is open.
  useEffect(() => {
    if (!showCompare || !selGuns.length) {
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
  }, [selGuns, metric, showCompare]);

  useEffect(() => () => chartRef.current && chartRef.current.destroy(), []);

  // Keep the canvas fitted when the height handle is dragged.
  useEffect(() => {
    if (chartRef.current) chartRef.current.resize();
  }, [chartHeight]);

  return (
    <div style={{ minHeight: "100vh" }}>
      <SiteNav active="index" />

      {/* ---------------- HOME (search + cards) ---------------- */}
      {!showCompare && (
        <div style={{ padding: "10px 40px 140px" }}>
          <div style={{ padding: "60px 0 26px", textAlign: "center" }}>
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
                  marginBottom: 6,
                }}
              >
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

            {/* search */}
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              <SearchBox
                query={query}
                setQuery={setQuery}
                matches={matches}
                onPick={addSelected}
                placeholder={isMobile ? "Search here" : "Search an airgun — FX Impact, Red Wolf…"}
              />
            </div>

            {/* mode selector */}
            <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
              <ModeToggle mode={mode} setMode={setMode} />
            </div>
          </div>

          {mode === "recent" && guns.length > 0 && (
            <Feed guns={guns} selected={selected} onToggle={toggle} />
          )}

          {mode === "browse" && (
            <Browse
              results={browseResults}
              total={guns.length}
              options={options}
              filters={filters}
              setFilters={setFilters}
              selected={selected}
              onToggle={toggle}
            />
          )}
        </div>
      )}

      {/* ---------------- GRAPH MODE (split view) ---------------- */}
      {showCompare && (
        <div
          style={{
            display: isMobile ? "block" : "grid",
            gridTemplateColumns: isMobile ? undefined : "minmax(300px, 360px) 1fr",
            alignItems: "start",
          }}
        >
          {/* GRAPH PANE — source-first so it stacks on top on mobile; placed on
              the right on desktop via grid order. Sticks while the rail scrolls. */}
          <div
            style={{
              order: isMobile ? undefined : 2,
              position: "sticky",
              top: 0,
              alignSelf: "start",
              zIndex: 5,
              background: "#0a0c0e",
              padding: isMobile ? "14px 18px" : "18px 24px",
              maxHeight: isMobile ? "56vh" : "100vh",
              overflowY: "auto",
              borderBottom: isMobile ? "1px solid #181b1f" : "none",
            }}
          >
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
                <div className="mono" style={{ fontSize: 11, letterSpacing: 2, color: "#5e7170" }}>
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
                <div style={{ position: "relative", height: chartHeight, width: "100%" }}>
                  <canvas ref={canvasRef} />
                </div>
              </div>

              {/* stat cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: g.color, flex: "0 0 auto" }} />
                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontWeight: 800,
                          letterSpacing: "-.3px",
                          fontSize: 14,
                          textTransform: "uppercase",
                        }}
                      >
                        {g.brand} {g.model} <span style={{ color: TEAL }}>{g.calDisp}</span>
                      </div>
                      <button
                        onClick={() => toggle(g.id)}
                        title="Remove from graph"
                        aria-label={`Remove ${g.brand} ${g.model} from graph`}
                        className="mono"
                        style={{
                          flex: "0 0 auto",
                          background: "transparent",
                          border: "1px solid #2a2f35",
                          borderRadius: 4,
                          color: "#7b8089",
                          fontSize: 14,
                          lineHeight: 1,
                          padding: "2px 7px",
                          cursor: "pointer",
                        }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>
                      <Stat label="AVG VEL" value={g.mv} unit=" fps" />
                      <Stat label="STD DEV" value={g.sd} unit=" fps" accent />
                      <Stat label="EXT SPREAD" value={g.es} unit=" fps" />
                      <Stat label="SHOTS/FILL" value={g.shots} unit="" />
                    </div>
                  </div>
                ))}
              </div>

              {/* drag handle — resize the graph's vertical space (sits at the
                  bottom of the pane, under the dataset cards) */}
              <div
                onPointerDown={startResize}
                title="Drag to resize the graph"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 18,
                  borderTop: "1px solid #181b1f",
                  cursor: "ns-resize",
                  touchAction: "none",
                }}
              >
                <span style={{ width: 46, height: 4, borderRadius: 3, background: "#2a2f35" }} />
              </div>
            </div>
          </div>

          {/* CARD RAIL — scrolls with the page; all selection lives here */}
          <div
            style={{
              order: isMobile ? undefined : 1,
              borderRight: isMobile ? "none" : "1px solid #181b1f",
              padding: isMobile ? "16px 18px 60px" : "18px 20px 80px",
              minWidth: 0,
            }}
          >
            <button
              onClick={closeGraph}
              className="mono"
              style={{
                background: "transparent",
                color: "#cdd2d8",
                border: "1px solid #23272d",
                borderRadius: 4,
                padding: "8px 14px",
                fontSize: 11,
                letterSpacing: 1,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
            >
              ← Back
            </button>

            <div style={{ margin: "14px 0 0" }}>
              <SearchBox
                query={query}
                setQuery={setQuery}
                matches={matches}
                onPick={addSelected}
                placeholder="Add an airgun…"
              />
            </div>

            <div style={{ display: "flex", justifyContent: "center", margin: "14px 0 4px" }}>
              <ModeToggle mode={mode} setMode={setMode} />
            </div>

            {mode === "recent" && guns.length > 0 && (
              <Feed guns={guns} selected={selected} onToggle={toggle} rail />
            )}

            {mode === "browse" && (
              <Browse
                results={browseResults}
                total={guns.length}
                options={options}
                filters={filters}
                setFilters={setFilters}
                selected={selected}
                onToggle={toggle}
                rail
              />
            )}
          </div>
        </div>
      )}

      {/* sticky compare bar — entry point into graph mode */}
      {!showCompare && selected.length > 0 && (
        <CompareBar count={selected.length} onDisplay={openGraph} onClear={clearAll} />
      )}
    </div>
  );
}

// Airgun search with a type-ahead dropdown. Picking a result adds it to the
// comparison selection. Reused on the home hero and inside the graph rail.
function SearchBox({ query, setQuery, matches, onPick, placeholder }) {
  return (
    <div style={{ position: "relative", width: "100%", textAlign: "left" }}>
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
        <div style={{ padding: "0 12px 0 14px", display: "flex" }}>
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
            if (e.key === "Enter" && matches.length) onPick(matches[0].id);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="mono airgun-search"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#e6e7e9",
            padding: "13px 0",
            minWidth: 0,
          }}
        />
      </div>

      {matches.length > 0 && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 6px)",
            background: "#0e1013",
            border: "1px solid #23272d",
            borderRadius: 6,
            overflow: "hidden",
            zIndex: 25,
            boxShadow: "0 18px 40px rgba(0,0,0,.5)",
          }}
        >
          {matches.map((m) => (
            <div
              key={m.id}
              onClick={() => onPick(m.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                cursor: "pointer",
                borderBottom: "1px solid #181b1f",
              }}
            >
              <div style={{ minWidth: 0 }}>
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
  );
}

// Recently-submitted / Browse switch.
function ModeToggle({ mode, setMode }) {
  const opts = [
    ["recent", "Recently Submitted"],
    ["browse", "Browse & Filter"],
  ];
  return (
    <div
      className="mono"
      style={{
        display: "flex",
        border: "1px solid #23272d",
        borderRadius: 4,
        overflow: "hidden",
      }}
    >
      {opts.map(([k, label]) => {
        const on = mode === k;
        return (
          <button
            key={k}
            onClick={() => setMode(k)}
            style={{
              padding: "9px 16px",
              background: on ? TEAL : "transparent",
              color: on ? "#06100e" : "#7b8089",
              fontWeight: on ? 700 : 400,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              letterSpacing: 1,
              textTransform: "uppercase",
              fontFamily: "inherit",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <div>
      <label
        className="mono"
        style={{
          display: "block",
          fontSize: 11,
          letterSpacing: 1,
          color: "#7b8089",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={field}>
        {children}
      </select>
    </div>
  );
}

function Browse({ results, total, options, filters, setFilters, selected, onToggle, rail }) {
  const set = (key) => (val) => setFilters((f) => ({ ...f, [key]: val }));
  const anyFilter = Object.values(filters).some((v) => v);

  return (
    <div
      style={{
        marginTop: rail ? 16 : 30,
        maxWidth: rail ? "none" : 1100,
        marginLeft: rail ? 0 : "auto",
        marginRight: rail ? 0 : "auto",
      }}
    >
      {/* filter panel */}
      <div
        style={{
          border: "1px solid #181b1f",
          borderRadius: 8,
          padding: "16px 18px",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 14,
          }}
        >
          <FilterSelect label="Caliber" value={filters.cal} onChange={set("cal")}>
            <option value="">Any caliber</option>
            {options.cals.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect label="Tank size" value={filters.tank} onChange={set("tank")}>
            <option value="">Any tank</option>
            {options.tanks.map((t) => (
              <option key={t} value={String(t)}>
                {t} cc
              </option>
            ))}
          </FilterSelect>

          <FilterSelect label="Suppressor" value={filters.supp} onChange={set("supp")}>
            <option value="">Any</option>
            <option value="__none">Unmoderated</option>
            {options.supps.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect label="Regulator" value={filters.reg} onChange={set("reg")}>
            <option value="">Any</option>
            <option value="reg">Regulated</option>
            <option value="unreg">Unregulated</option>
          </FilterSelect>

          <FilterSelect
            label="Brand"
            value={filters.brand}
            onChange={(val) => setFilters((f) => ({ ...f, brand: val, model: "" }))}
          >
            <option value="">Any brand</option>
            {options.brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect label="Model" value={filters.model} onChange={set("model")}>
            <option value="">Any model</option>
            {options.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </FilterSelect>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 14,
            gap: 10,
          }}
        >
          <div className="mono" style={{ fontSize: 11, letterSpacing: 1, color: "#5e7170" }}>
            {results.length} OF {total} SHOT STRING{total === 1 ? "" : "S"}
          </div>
          {anyFilter && (
            <button
              onClick={() => setFilters({ cal: "", tank: "", supp: "", reg: "", brand: "", model: "" })}
              className="mono"
              style={{
                background: "transparent",
                color: "#7b8089",
                border: "1px solid #23272d",
                borderRadius: 4,
                padding: "6px 12px",
                fontSize: 11,
                letterSpacing: 1,
                cursor: "pointer",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* results */}
      {results.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: rail ? "1fr" : "repeat(auto-fill, minmax(270px, 1fr))",
            gap: 14,
          }}
        >
          {results.map((g) => (
            <FeedCard key={g.id} g={g} selected={selected.includes(g.id)} onToggle={onToggle} />
          ))}
        </div>
      ) : (
        <div
          style={{
            border: "1px dashed #23272d",
            borderRadius: 8,
            padding: 40,
            textAlign: "center",
            color: "#868d96",
            fontSize: 13,
          }}
        >
          No shot strings match these filters.
        </div>
      )}
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
  // checkbox / caliber badges that sit in the thumbnail's top corners.
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

function FeedCard({ g, selected, onToggle }) {
  return (
    <div
      onClick={() => onToggle(g.id)}
      style={{
        border: `1px solid ${selected ? TEAL : "#181b1f"}`,
        borderRadius: 6,
        background: "#0c0e11",
        overflow: "hidden",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        boxShadow: selected ? `0 0 0 1px ${TEAL}` : "none",
        position: "relative",
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

        {/* compare checkbox */}
        <span
          style={{
            position: "absolute",
            top: 8,
            left: 9,
            width: 20,
            height: 20,
            borderRadius: 4,
            border: `1.5px solid ${selected ? TEAL : "#3a4047"}`,
            background: selected ? TEAL : "rgba(8,10,13,.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {selected && (
            <svg
              viewBox="0 0 24 24"
              style={{ width: 13, height: 13, fill: "none", stroke: "#06100e", strokeWidth: 3 }}
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </span>

        <span
          className="mono"
          style={{
            position: "absolute",
            bottom: 8,
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
          {g.tankCc && <ConfigChip>{g.tankCc} cc</ConfigChip>}
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

function Feed({ guns, selected, onToggle, rail }) {
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
    <div
      style={{
        marginTop: rail ? 16 : 46,
        maxWidth: rail ? "none" : 1100,
        marginLeft: rail ? 0 : "auto",
        marginRight: rail ? 0 : "auto",
      }}
    >
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
        {!rail && (
          <div className="mono" style={{ fontSize: 11, letterSpacing: 1, color: "#3f474a" }}>
            TICK CARDS, THEN DISPLAY GRAPH
          </div>
        )}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: rail ? "1fr" : "repeat(auto-fill, minmax(270px, 1fr))",
          gap: 14,
        }}
      >
        {recent.map((g) => (
          <FeedCard key={g.id} g={g} selected={selected.includes(g.id)} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

function CompareBar({ count, onDisplay, onClear }) {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#0e1013",
        borderTop: "1px solid #23272d",
        padding: "14px 40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        zIndex: 30,
        boxShadow: "0 -10px 30px rgba(0,0,0,.45)",
      }}
    >
      <div className="mono" style={{ fontSize: 12, letterSpacing: 1, color: "#cdd2d8" }}>
        <span style={{ color: TEAL, fontWeight: 700 }}>{count}</span> SHOT STRING{count === 1 ? "" : "S"} SELECTED
        <span
          onClick={onClear}
          style={{ marginLeft: 14, color: "#7b8089", cursor: "pointer", textTransform: "uppercase" }}
        >
          Clear
        </span>
      </div>
      <button
        onClick={onDisplay}
        className="mono"
        style={{
          background: TEAL,
          color: "#06100e",
          border: "none",
          borderRadius: 4,
          padding: "11px 22px",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 1,
          cursor: "pointer",
          textTransform: "uppercase",
          fontFamily: "inherit",
        }}
      >
        Display Graph →
      </button>
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
