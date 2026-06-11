export const metadata = {
  title: "Terms of Service — Booking Agent",
  description: "Terms and conditions for using the Booking Agent platform.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-indigo-700 py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-4xl font-bold text-white">Terms of Service</h1>
          <p className="mt-3 text-indigo-200 text-sm">Last updated: 11 June 2026</p>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-6 py-14 space-y-12 text-gray-700 leading-relaxed">

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Booking Agent (&quot;the Service&quot;), you agree to be bound by these
            Terms of Service. If you do not agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Description of Service</h2>
          <p>
            Booking Agent is a cloud-based appointment scheduling and AI-powered booking assistant
            platform. We provide tools that allow businesses (&quot;Tenants&quot;) to accept bookings from
            their customers via web, WhatsApp, and Telegram channels.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Account Registration</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>You must provide accurate and complete information when creating an account.</li>
            <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
            <li>You must notify us immediately of any unauthorised use of your account.</li>
            <li>You must be at least 18 years old to create an account.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Acceptable Use</h2>
          <p className="mb-3">You agree not to:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Use the Service for any unlawful purpose or in violation of any regulations.</li>
            <li>Attempt to gain unauthorised access to other accounts or systems.</li>
            <li>Transmit spam, malware, or any harmful content via the Service.</li>
            <li>Reverse-engineer, decompile, or disassemble any part of the Service.</li>
            <li>Resell or sublicense access to the Service without written permission.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Subscription and Billing</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>The Service is available on a subscription basis with plans described on our pricing page.</li>
            <li>Subscriptions renew automatically unless cancelled before the renewal date.</li>
            <li>All fees are non-refundable except where required by law.</li>
            <li>We reserve the right to change pricing with 30 days&apos; notice.</li>
            <li>Failure to pay may result in suspension or termination of your account.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Data and Privacy</h2>
          <p>
            Your use of the Service is also governed by our{" "}
            <a href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</a>,
            which is incorporated into these Terms by reference. You are responsible for
            ensuring that your use of customer data collected through the Service complies
            with applicable data protection laws (including GDPR where applicable).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Intellectual Property</h2>
          <p>
            All content, software, and materials provided by Booking Agent remain our exclusive
            property or the property of our licensors. You are granted a limited, non-exclusive,
            non-transferable licence to use the Service for its intended purpose.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Third-Party Services</h2>
          <p>
            The Service integrates with third-party platforms (WhatsApp, Telegram, Stripe, Google
            Calendar, etc.). Your use of those services is governed by their respective terms and
            privacy policies. We are not responsible for any third-party service.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Booking Agent shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, or any loss of
            profits or revenues, arising out of or related to your use of the Service.
            Our total aggregate liability shall not exceed the amount paid by you in the
            12 months preceding the claim.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">10. Disclaimer of Warranties</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind,
            express or implied. We do not warrant that the Service will be uninterrupted, error-free,
            or free of viruses or other harmful components.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Termination</h2>
          <p>
            Either party may terminate the agreement at any time. Upon termination, your access to
            the Service will cease and we will delete your data in accordance with our data retention
            policy and Privacy Policy.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">12. Changes to Terms</h2>
          <p>
            We may update these Terms at any time. We will notify you of material changes via email
            or an in-app notice. Your continued use of the Service after changes take effect
            constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">13. Governing Law</h2>
          <p>
            These Terms are governed by the laws of Singapore. Any disputes shall be subject to
            the exclusive jurisdiction of the courts of Singapore.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-3">14. Contact</h2>
          <p>
            For questions about these Terms, contact us at{" "}
            <a href="mailto:legal@bookingagent.app" className="text-indigo-600 hover:underline">
              legal@bookingagent.app
            </a>.
          </p>
        </section>
      </div>

      {/* Footer links */}
      <div className="border-t border-gray-200 py-8">
        <div className="mx-auto max-w-3xl px-6 flex gap-6 text-sm text-gray-500">
          <a href="/privacy" className="hover:text-gray-700">Privacy Policy</a>
          <a href="/" className="hover:text-gray-700">Home</a>
        </div>
      </div>
    </main>
  );
}
