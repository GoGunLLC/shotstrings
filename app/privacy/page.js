import { LegalShell, LegalSection, LegalList } from "../components/LegalDoc";

// NOTE: Starting template tailored to what ShotStrings does — review before
// relying on it. Not legal advice.
const CONTACT = "support@gogun.co";
const ENTITY = "GoGun LLC";
const UPDATED = "June 21, 2026";

export const metadata = {
  title: "Privacy Policy — ShotStrings",
  description: "How ShotStrings.com collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <LegalShell active="privacy" label="Privacy" title="Privacy Policy" updated={UPDATED}>
      <LegalSection title="Who we are">
        <p>
          ShotStrings.com is operated by {ENTITY} (&quot;we,&quot; &quot;us&quot;), and provides
          an explorable database of real airgun shot-string data submitted by the community.
          This policy explains what information we collect when you use the site, how we use
          it, and the choices you have. If you have questions, contact us at{" "}
          <a href={`mailto:${CONTACT}`} style={{ color: "#2fb8a0" }}>{CONTACT}</a>.
        </p>
      </LegalSection>

      <LegalSection title="Information we collect">
        <p>We collect only what we need to run the service:</p>
        <LegalList>
          <li>
            <strong style={{ color: "#cdd2d8" }}>Account information.</strong> When you sign in
            with Google, our authentication provider (Supabase Auth) receives your name, email
            address, profile picture, and Google account identifier. We do not receive your
            Google password.
          </li>
          <li>
            <strong style={{ color: "#cdd2d8" }}>Content you submit.</strong> Shot strings,
            airgun and projectile setups, fill pressures, per-shot velocities, links to the
            YouTube videos the data came from, and any notes you add.
          </li>
          <li>
            <strong style={{ color: "#cdd2d8" }}>Technical data.</strong> Standard server and
            security logs generated automatically by our hosting and database providers, such
            as IP address, browser type, and timestamps.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="How we use your information">
        <LegalList>
          <li>To create and secure your account and keep you signed in.</li>
          <li>To publish, attribute, and display the shot strings you submit.</li>
          <li>To operate, maintain, debug, and improve the site.</li>
          <li>To prevent abuse and enforce our terms.</li>
        </LegalList>
        <p style={{ marginTop: 12 }}>
          We do <strong style={{ color: "#cdd2d8" }}>not</strong> sell your personal
          information, and we do not use it for advertising.
        </p>
      </LegalSection>

      <LegalSection title="Submissions are public">
        <p>
          ShotStrings is a public database. The shot strings you submit — including the source
          video links and the creator attribution tied to them — are visible to anyone who
          visits the site. Do not submit anything you do not want to be public. Your email
          address and account details are not displayed publicly.
        </p>
      </LegalSection>

      <LegalSection title="Service providers">
        <p>
          We rely on a small number of trusted providers to operate the service, who process
          data on our behalf:
        </p>
        <LegalList>
          <li>
            <strong style={{ color: "#cdd2d8" }}>Supabase</strong> — database hosting and
            authentication (where account and submission data is stored).
          </li>
          <li>
            <strong style={{ color: "#cdd2d8" }}>Google</strong> — Sign-in with Google for
            authentication.
          </li>
          <li>
            <strong style={{ color: "#cdd2d8" }}>Our web host</strong> — serves the site and
            generates request logs.
          </li>
        </LegalList>
        <p style={{ marginTop: 12 }}>
          Data is stored on infrastructure located in the United States. We may also disclose
          information if required by law or to protect the safety, rights, or property of our
          users or the public.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>
          We use cookies and browser storage strictly to keep you signed in and to remember
          basic preferences. We do not use third-party advertising or cross-site tracking
          cookies.
        </p>
      </LegalSection>

      <LegalSection title="Data retention and your choices">
        <p>
          We keep your account and submissions for as long as your account is active. You may
          request access to, correction of, or deletion of your personal information at any
          time by emailing{" "}
          <a href={`mailto:${CONTACT}`} style={{ color: "#2fb8a0" }}>{CONTACT}</a>. When you
          delete your account, we remove your personal account data; shot strings you have
          contributed to the public database may be retained in anonymized or attributed form
          to preserve the integrity of the dataset, unless you request their removal.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          ShotStrings is not directed to children under 13, and we do not knowingly collect
          personal information from them.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          We may update this policy from time to time. When we do, we will revise the
          &quot;Last updated&quot; date above. Continued use of the site after a change means
          you accept the updated policy.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about this policy or your data? Email{" "}
          <a href={`mailto:${CONTACT}`} style={{ color: "#2fb8a0" }}>{CONTACT}</a>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
