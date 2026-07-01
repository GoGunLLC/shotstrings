import SiteNav from "../components/SiteNav";

const TEAL = "#2fb8a0";

export const metadata = {
  title: "About — ShotStrings",
  description:
    "ShotStrings turns scattered, video-trapped airgun chronograph data into one explorable, comparable, auditable database of real shot strings.",
};

function SectionLabel({ children }) {
  return (
    <div
      className="mono"
      style={{
        fontSize: 14,
        letterSpacing: 2,
        color: "#5e7170",
        textTransform: "uppercase",
        display: "flex",
        alignItems: "center",
        gap: 9,
        marginBottom: 14,
      }}
    >
      <span style={{ width: 7, height: 7, background: TEAL, display: "inline-block" }} />
      {children}
    </div>
  );
}

function Step({ n, title, children }) {
  return (
    <div
      style={{
        border: "1px solid #181b1f",
        borderRadius: 6,
        background: "#0c0e11",
        padding: "18px 18px 20px",
      }}
    >
      <div
        className="mono"
        style={{ fontSize: 13, color: TEAL, letterSpacing: 1, marginBottom: 10 }}
      >
        0{n}
      </div>
      <div
        style={{
          fontWeight: 800,
          fontSize: 17,
          textTransform: "uppercase",
          letterSpacing: "-.2px",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <p style={{ color: "#868d96", fontSize: 15.5, lineHeight: 1.65 }}>{children}</p>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <SiteNav active="about" />

      <div
        className="about-wrap"
        style={{ maxWidth: 760, margin: "0 auto", padding: "64px 40px 90px" }}
      >
        {/* hero */}
        <div style={{ marginBottom: 8 }}>
          <SectionLabel>Measured, not claimed</SectionLabel>
          <h1
            className="about-hero-title"
            style={{
              lineHeight: 1.02,
              fontWeight: 800,
              letterSpacing: "-1.8px",
              margin: "0 0 20px",
            }}
          >
            What <span style={{ color: TEAL }}>ShotStrings</span> is
          </h1>
          <p style={{ color: "#aeb4bc", fontSize: 20, lineHeight: 1.6 }}>
            ShotStrings.com is the most complete, explorable database of real airgun
            performance — built from actual chronograph data, not spec sheets or
            marketing claims. Look up any rifle or pistol and see exactly how it
            shoots, shot by shot.
          </p>
        </div>

        {/* the problem */}
        <div style={{ marginTop: 52 }}>
          <SectionLabel>The problem</SectionLabel>
          <p style={{ color: "#868d96", fontSize: 17, lineHeight: 1.75 }}>
            There&apos;s a whole community of airgunners on YouTube who test and
            compare how air guns actually perform. They put a chronograph in front
            of a gun, shoot a full string — sometimes several magazines — and report
            the velocity and energy of every shot. Plotted out, those numbers form a
            little curve: a <em style={{ color: "#cdd2d8", fontStyle: "normal" }}>shot string</em>.
          </p>
          <p style={{ color: "#868d96", fontSize: 17, lineHeight: 1.75, marginTop: 16 }}>
            The trouble is that all of that data stays trapped inside the video —
            scribbled on a scratch pad or flashed on screen for a second. There&apos;s
            no good way to explore a single string, compare one gun against another,
            or check whether the numbers hold up. It&apos;s fragmented across hundreds
            of individual videos, and effectively impossible to use.
          </p>
        </div>

        {/* how it works */}
        <div style={{ marginTop: 52 }}>
          <SectionLabel>How it works</SectionLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
              marginTop: 4,
            }}
          >
            <Step n={1} title="Creators submit">
              A YouTuber links their video and enters the setup — the air gun, the
              projectile, the fill pressure, and the velocity of every shot.
            </Step>
            <Step n={2} title="We build the string">
              We calculate the full energy and velocity curve and file it in the
              database, tied to that exact gun and configuration.
            </Step>
            <Step n={3} title="You explore & compare">
              Pull up any gun to see its strings in a clean interactive graph, and
              put multiple guns head to head by velocity, energy, or consistency.
            </Step>
          </div>
        </div>

        {/* always auditable */}
        <div style={{ marginTop: 52 }}>
          <SectionLabel>Always auditable</SectionLabel>
          <p style={{ color: "#868d96", fontSize: 17, lineHeight: 1.75 }}>
            Every shot string links straight back to the YouTube video it came from.
            If you ever doubt a number, you can watch the exact source it was pulled
            from. The data isn&apos;t something you have to take on faith — it&apos;s
            measured, attributed, and verifiable.
          </p>
        </div>

        {/* the vision */}
        <div style={{ marginTop: 52 }}>
          <SectionLabel>The vision</SectionLabel>
          <p style={{ color: "#868d96", fontSize: 17, lineHeight: 1.75 }}>
            The goal is to be the definitive home for air gun performance: for any
            given gun, its real shot-string data, the source videos behind that data,
            and — over time — the community discussion around it, all in one place.
            It works because it&apos;s a flywheel. Creators submit because the site
            sends viewers back to their videos; every submission makes the database
            more complete; a more complete database draws more enthusiasts; and that
            audience gives creators even more reason to submit.
          </p>
          <p style={{ color: "#868d96", fontSize: 17, lineHeight: 1.75, marginTop: 16 }}>
            More creators, more data, more people who care about how these guns truly
            shoot — measured, not claimed.
          </p>
        </div>

        {/* cta */}
        <div
          style={{
            marginTop: 56,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <a
            href="/"
            className="mono"
            style={{
              background: TEAL,
              color: "#06100e",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 1,
              padding: "13px 22px",
              borderRadius: 4,
              textDecoration: "none",
              textTransform: "uppercase",
            }}
          >
            Explore the database
          </a>
          <a
            href="/submit"
            className="mono"
            style={{
              border: "1px solid #2a2f35",
              color: "#cdd2d8",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: 1,
              padding: "13px 22px",
              borderRadius: 4,
              textDecoration: "none",
              textTransform: "uppercase",
            }}
          >
            Submit a shot string
          </a>
        </div>
      </div>
    </div>
  );
}
