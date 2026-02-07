import Link from "next/link";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-900/50 via-transparent to-transparent" />
      </div>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-white/40 hover:text-white/70 transition-colors mb-8"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="text-2xl font-medium tracking-tight">Terms of Service</h1>
        <p className="text-white/40 mt-1">Last updated: February 2026</p>

        <div className="mt-10 space-y-8 text-sm text-white/70 leading-relaxed">
          <section>
            <h2 className="text-base font-medium text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Clip Pilot ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">2. Description of Service</h2>
            <p>
              Clip Pilot is a video scheduling and publishing tool that allows users to upload video content and schedule it for publication across social media platforms including YouTube and TikTok. The Service acts on your behalf to publish content at your specified times using authorized access to your connected accounts.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">3. Account and Authorization</h2>
            <p>
              To use the Service, you must create an account and authorize Clip Pilot to access your social media accounts through each platform's official OAuth authorization flow. You are responsible for maintaining the confidentiality of your account credentials. You may revoke Clip Pilot's access to any connected platform at any time through the Settings page or through the platform's own security settings.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">4. User Content</h2>
            <p>
              You retain full ownership of all content you upload to the Service. By using Clip Pilot, you grant us a limited license to store, process, and transmit your content solely for the purpose of delivering the Service (i.e., uploading your videos to your connected platforms on your behalf). We do not claim any ownership rights over your content. You are solely responsible for ensuring that your content complies with the terms of service of each platform you publish to.
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
              Clip Pilot integrates with third-party platforms such as YouTube and TikTok. Your use of these platforms is subject to their respective terms of service and privacy policies. Clip Pilot is not responsible for the actions, policies, or availability of any third-party platform. Publishing through Clip Pilot does not exempt you from complying with each platform's community guidelines and terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">7. Service Availability</h2>
            <p>
              We strive to keep the Service available at all times but do not guarantee uninterrupted access. Scheduled posts may fail due to platform API changes, token expiration, rate limits, or other factors beyond our control. We are not liable for any damages resulting from failed or delayed publications.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">8. Limitation of Liability</h2>
            <p>
              The Service is provided "as is" without warranties of any kind. To the maximum extent permitted by law, Clip Pilot shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">9. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your access to the Service at any time for violation of these terms. You may delete your account at any time, which will disconnect all linked platforms and remove your stored data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">10. Changes to Terms</h2>
            <p>
              We may update these Terms of Service from time to time. Continued use of the Service after changes constitutes acceptance of the updated terms. We will make reasonable efforts to notify users of significant changes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">11. Contact</h2>
            <p>
              If you have questions about these Terms of Service, please contact us through the Service.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-xs text-white/30">Clip Pilot</p>
        </div>
      </div>
    </div>
  );
}
