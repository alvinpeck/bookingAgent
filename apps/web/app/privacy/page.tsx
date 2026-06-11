export const metadata = {
  title: "Privacy Policy — Booking Agent",
  description: "How Booking Agent collects, uses, and protects your personal data.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-indigo-700 py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="text-4xl font-bold text-white">Privacy Policy</h1>
          <p className="mt-3 text-indigo-200 text-sm">
            Last updated: 6 May 2026
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-3xl px-6 py-14 space-y-12 text-gray-700 leading-relaxed">

        {/* Intro */}
        <section>
          <p>
            This Privacy Policy explains how <strong>Booking Agent</strong> (&quot;we&quot;,
            &quot;us&quot;, or &quot;our&quot;) — operated by{" "}
            <strong>[Your Business Name]</strong> — collects, uses, and protects
            personal data when you interact with our AI-powered booking service.
          </p>
          <p className="mt-4">
            By using our service, you agree to the collection and use of information
            in accordance with this policy.
          </p>
        </section>

        {/* 1. Data We Collect */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            1. Data We Collect
          </h2>
          <p>
            We collect only the information necessary to provide and improve our
            booking service:
          </p>
          <ul className="mt-4 space-y-2 list-disc list-inside">
            <li>
              <strong>Booking details</strong> — your name, email address, phone
              number, and the date/time of your appointment.
            </li>
            <li>
              <strong>Conversation history</strong> — messages exchanged with our
              AI booking assistant via WhatsApp, Telegram, or web chat, used to
              fulfil your booking request and improve response quality.
            </li>
            <li>
              <strong>Webhook event data</strong> — raw event payloads received from
              messaging platforms (e.g., WhatsApp Business API, Telegram Bot API),
              retained for integrity verification and error diagnosis.
            </li>
            <li>
              <strong>Device &amp; connection information</strong> — IP address,
              browser user-agent, and request identifiers, used for security and
              audit purposes.
            </li>
          </ul>
          <p className="mt-4">
            We do <strong>not</strong> collect payment card details, government
            identification, or sensitive special-category data as defined by the GDPR.
          </p>
        </section>

        {/* 2. How We Use Your Data */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            2. How We Use Your Data
          </h2>
          <ul className="space-y-2 list-disc list-inside">
            <li>To process and confirm your bookings.</li>
            <li>To send appointment reminders and follow-up notifications.</li>
            <li>To enable multi-turn AI conversations that guide you through booking.</li>
            <li>To detect and prevent fraud, abuse, and platform misuse.</li>
            <li>To produce anonymised analytics that help us improve the service.</li>
            <li>To comply with applicable legal obligations.</li>
          </ul>
          <p className="mt-4">
            We rely on <strong>contract performance</strong> (Art. 6(1)(b) GDPR) as
            the primary legal basis for processing your booking data, and{" "}
            <strong>legitimate interests</strong> (Art. 6(1)(f) GDPR) for security
            logging and service improvement.
          </p>
        </section>

        {/* 3. Data Retention */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            3. Data Retention
          </h2>
          <p>
            We apply the following default retention periods. Individual business
            clients may configure shorter periods within their compliance settings.
          </p>
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 uppercase text-xs tracking-wider">
                <tr>
                  <th className="px-5 py-3 text-left font-medium">Data type</th>
                  <th className="px-5 py-3 text-left font-medium">Default retention</th>
                  <th className="px-5 py-3 text-left font-medium">Rationale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="px-5 py-3 font-medium text-gray-800">
                    Conversation history
                  </td>
                  <td className="px-5 py-3">90 days</td>
                  <td className="px-5 py-3 text-gray-500">
                    Short-term support &amp; dispute resolution
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 font-medium text-gray-800">
                    Webhook event payloads
                  </td>
                  <td className="px-5 py-3">30 days</td>
                  <td className="px-5 py-3 text-gray-500">
                    Platform integrity checks &amp; error replay
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 font-medium text-gray-800">
                    Booking records
                  </td>
                  <td className="px-5 py-3">365 days</td>
                  <td className="px-5 py-3 text-gray-500">
                    Financial records &amp; dispute resolution
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 font-medium text-gray-800">
                    Security audit logs
                  </td>
                  <td className="px-5 py-3">As required by law</td>
                  <td className="px-5 py-3 text-gray-500">
                    Legal obligation (immutable, not deleted)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4">
            After the applicable retention period, data is permanently deleted by an
            automated process. Security audit logs are immutable by design and are
            retained for the period required by applicable law.
          </p>
        </section>

        {/* 4. Your Rights (GDPR) */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            4. Your Rights (GDPR)
          </h2>
          <p>
            If you are located in the European Economic Area (EEA) or the United
            Kingdom, you have the following rights under the GDPR and UK GDPR:
          </p>
          <ul className="mt-4 space-y-3 list-disc list-inside">
            <li>
              <strong>Right of access</strong> — you may request a copy of the
              personal data we hold about you.
            </li>
            <li>
              <strong>Right to rectification</strong> — you may ask us to correct
              inaccurate data.
            </li>
            <li>
              <strong>Right to erasure (&ldquo;right to be forgotten&rdquo;)</strong>{" "}
              — you may request that we delete your personal data, subject to
              legal retention obligations. To submit an erasure request, contact
              the business you booked with directly using the details in the{" "}
              <strong>Contact Us</strong> section below.
            </li>
            <li>
              <strong>Right to restrict processing</strong> — you may ask us to
              pause processing of your data in certain circumstances.
            </li>
            <li>
              <strong>Right to data portability</strong> — you may request your
              data in a machine-readable format.
            </li>
            <li>
              <strong>Right to object</strong> — you may object to processing based
              on legitimate interests.
            </li>
          </ul>
          <p className="mt-4">
            We aim to respond to all valid requests within <strong>30 days</strong>.
            You also have the right to lodge a complaint with your local data
            protection authority.
          </p>
        </section>

        {/* 5. Data Sharing */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            5. Data Sharing &amp; Third Parties
          </h2>
          <p>
            We do not sell your personal data. We may share it only with:
          </p>
          <ul className="mt-4 space-y-2 list-disc list-inside">
            <li>
              <strong>Messaging platforms</strong> (WhatsApp / Meta, Telegram) — to
              deliver messages you initiate through those channels.
            </li>
            <li>
              <strong>Cloud infrastructure providers</strong> — hosting, database,
              and caching services, under data processing agreements.
            </li>
            <li>
              <strong>Payment processors</strong> — only name and contact details
              required to complete a transaction.
            </li>
            <li>
              <strong>Legal authorities</strong> — when required by law or to protect
              our rights and the safety of others.
            </li>
          </ul>
        </section>

        {/* 6. Contact */}
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            6. Contact Us
          </h2>
          <p>
            For any privacy-related questions, data subject requests, or to exercise
            your GDPR rights, please contact:
          </p>
          <address className="mt-4 not-italic bg-gray-50 border border-gray-200 rounded-xl px-6 py-5 space-y-1 text-sm">
            <p className="font-semibold text-gray-900">[Your Business Name]</p>
            <p>Email: <a href="mailto:privacy@yourbusiness.com" className="text-indigo-600 hover:underline">privacy@yourbusiness.com</a></p>
            <p>[Your Business Address]</p>
          </address>
          <p className="mt-4 text-sm text-gray-500">
            We will respond within 30 days of receiving your request.
          </p>
        </section>

      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 py-8">
        <div className="mx-auto max-w-3xl px-6 flex gap-6 text-sm text-gray-400">
          <a href="/terms" className="hover:text-gray-700">Terms of Service</a>
          <a href="/" className="hover:text-gray-700">Home</a>
        </div>
      </div>
    </main>
  );
}
