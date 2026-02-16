import Link from "next/link";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-blue-500/[0.08] via-purple-500/[0.06] to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-gradient-to-t from-purple-500/[0.06] to-transparent blur-3xl" />
        <div className="absolute -top-20 left-[-6rem] h-64 w-64 rounded-full bg-pink-500/[0.05] blur-3xl" />
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1 text-sm text-white/40 transition-colors hover:text-white/70"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-white/50">Last updated: February 2026</p>
          <p className="mt-5 text-sm text-white/70 max-w-3xl">
            These terms govern your use of Clip Dash. They describe your responsibilities, our responsibilities,
            and key limits of the service. This summary is informational and not legal advice.
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_70px_rgba(2,6,23,0.45)] sm:p-8">
        <div className="space-y-8 text-sm text-white/70 leading-relaxed">
          <section>
            <h2 className="text-base font-medium text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Clip Dash ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">2. Description of Service</h2>
            <p>
              Clip Dash is a video scheduling and publishing tool that allows users to upload content and schedule it for publication across supported social media platforms (including YouTube, TikTok, Instagram, Facebook, and LinkedIn). The Service acts on your behalf to publish content at your specified times using authorized access to connected accounts.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">3. Account and Authorization</h2>
            <p>
              To use the Service, you must create an account and authorize Clip Dash to access your social media accounts through each platform's official OAuth authorization flow. You are responsible for maintaining the confidentiality of your account credentials. You may revoke Clip Dash's access to any connected platform at any time through the Settings page or through the platform's own security settings.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">4. User Content</h2>
            <p>
              You retain full ownership of all content you upload to the Service. By using Clip Dash, you grant us a limited license to store, process, and transmit your content solely for the purpose of delivering the Service (i.e., uploading your videos to your connected platforms on your behalf). We do not claim any ownership rights over your content. You are solely responsible for ensuring that your content complies with the terms of service of each platform you publish to.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-white/60">
              <li>Upload content that violates any applicable law or regulation</li>
              <li>Upload content that infringes on the intellectual property rights of others</li>
              <li>Use the Service to distribute spam, malware, or harmful content</li>
              <li>Attempt to gain unauthorized access to the Service or its systems</li>
              <li>Use the Service in a way that could damage or impair its functionality</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">6. Third-Party Platforms</h2>
            <p>
              Clip Dash integrates with third-party platforms such as YouTube, TikTok, Instagram, Facebook, and LinkedIn. Your use of these platforms is subject to their respective terms of service and privacy policies. Clip Dash is not responsible for the actions, policies, or availability of any third-party platform. Publishing through Clip Dash does not exempt you from complying with each platform's community guidelines and terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">7. Billing, Trials, and Cancellations</h2>
            <p>
              Paid features may require an active subscription. If you start a trial, it may automatically convert to a paid subscription unless canceled before the trial ends. Pricing, billing cycles, and plan limits are displayed in-app and may be updated from time to time. You are responsible for applicable taxes and valid payment information.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">8. Refunds</h2>
            <p>
              Except where required by law, fees are non-refundable. If you believe a billing error occurred, contact us and we will review the issue in good faith.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">9. Service Availability</h2>
            <p>
              We strive to keep the Service available at all times but do not guarantee uninterrupted access. Scheduled posts may fail due to platform API changes, token expiration, rate limits, or other factors beyond our control. We are not liable for any damages resulting from failed or delayed publications.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">10. Limitation of Liability</h2>
            <p>
              The Service is provided "as is" without warranties of any kind. To the maximum extent permitted by law, Clip Dash shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">11. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your access to the Service at any time for violation of these terms. You may delete your account at any time, which will disconnect all linked platforms and remove your stored data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">12. Changes to Terms</h2>
            <p>
              We may update these Terms of Service from time to time. Continued use of the Service after changes constitutes acceptance of the updated terms. We will make reasonable efforts to notify users of significant changes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">13. Governing Law</h2>
            <p>
              These terms are governed by applicable law in the jurisdiction where Clip Dash operates, without regard to conflict-of-law rules, unless local law requires otherwise.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">14. Contact</h2>
            <p>
              If you have questions about these Terms of Service, please contact us through the Service.
            </p>
          </section>
        </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-xs text-white/30">Clip Dash</p>
        </div>
      </div>
    </div>
  );
}
