import { LegalShell, LegalSection, LegalList } from "../components/LegalDoc";

// NOTE: Starting template tailored to what ShotStrings does — review before
// relying on it. Not legal advice.
const CONTACT = "support@gogun.co";
const ENTITY = "GoGun LLC";
const JURISDICTION = "the State of Florida, USA";
const UPDATED = "June 21, 2026";

export const metadata = {
  title: "Terms of Service — ShotStrings",
  description: "The terms that govern your use of ShotStrings.com.",
};

export default function TermsPage() {
  return (
    <LegalShell active="terms" label="Terms" title="Terms of Service" updated={UPDATED}>
      <LegalSection title="Agreement">
        <p>
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of
          ShotStrings.com (the &quot;Service&quot;), operated by {ENTITY}. By using the
          Service, you agree to these Terms. If you do not agree, do not use the Service.
        </p>
      </LegalSection>

      <LegalSection title="The Service">
        <p>
          ShotStrings is a community database of real airgun shot-string data — velocities,
          energy curves, and configurations — submitted by users and linked back to the source
          videos they came from. The Service is provided for informational and reference
          purposes.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <p>
          Some features require signing in with Google. You are responsible for activity under
          your account and for keeping your Google account secure. You must provide accurate
          information and be at least 13 years old to use the Service.
        </p>
      </LegalSection>

      <LegalSection title="Your submissions">
        <p>
          You retain ownership of the data and content you submit. By submitting, you grant{" "}
          {ENTITY} a worldwide, non-exclusive, royalty-free license to host, store, display,
          reproduce, and distribute that content as part of the public database and to promote
          the Service. You represent that:
        </p>
        <LegalList>
          <li>You have the right to submit the content and to grant this license.</li>
          <li>
            The data is accurate to the best of your knowledge and is drawn from the source you
            link to.
          </li>
          <li>
            Your submission does not infringe anyone&apos;s rights or violate any law.
          </li>
        </LegalList>
        <p style={{ marginTop: 12 }}>
          We may review, edit for accuracy or formatting, decline, or remove any submission at
          our discretion.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You agree not to:</p>
        <LegalList>
          <li>Submit false, misleading, or fabricated data.</li>
          <li>Infringe intellectual property or privacy rights.</li>
          <li>
            Attempt to disrupt, overload, scrape abusively, or gain unauthorized access to the
            Service.
          </li>
          <li>Use the Service for any unlawful purpose.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Third-party content">
        <p>
          Shot strings link to videos hosted on third-party platforms such as YouTube. That
          content belongs to its respective creators and is governed by those platforms&apos;
          own terms. ShotStrings does not host or control those videos.
        </p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          The Service and all data on it are provided &quot;as is&quot; and &quot;as
          available,&quot; without warranties of any kind. Airgun performance figures are
          community-submitted measurements, not guarantees, and must not be relied upon for
          any safety-critical decision. Always follow the manufacturer&apos;s guidance and safe
          handling practices for any airgun. We do not warrant that the data is accurate,
          complete, or current.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, {ENTITY} will not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or for any loss arising from
          your use of — or reliance on — the Service or the data it contains.
        </p>
      </LegalSection>

      <LegalSection title="Termination">
        <p>
          We may suspend or terminate your access at any time if you violate these Terms or
          misuse the Service. You may stop using the Service and request account deletion at
          any time.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these Terms">
        <p>
          We may update these Terms from time to time. When we do, we will revise the
          &quot;Last updated&quot; date above. Continued use after a change means you accept
          the updated Terms.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These Terms are governed by the laws of {JURISDICTION}, without regard to conflict-of-law
          rules.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these Terms? Email{" "}
          <a href={`mailto:${CONTACT}`} style={{ color: "#2fb8a0" }}>{CONTACT}</a>.
        </p>
      </LegalSection>
    </LegalShell>
  );
}
