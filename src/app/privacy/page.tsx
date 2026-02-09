import Link from "next/link";

export default function PrivacyPolicyPage() {
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

        <h1 className="text-2xl font-medium tracking-tight">Privacy Policy</h1>
        <p className="text-white/40 mt-1">Last updated: February 2026</p>

        <div className="mt-10 space-y-8 text-sm text-white/70 leading-relaxed">
          <section>
            <h2 className="text-base font-medium text-white mb-3">1. Introduction</h2>
            <p>
              Clip Dash ("we", "our", "the Service") respects your privacy. This Privacy Policy explains what information we collect, how we use it, and your rights regarding your data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect the following types of information:</p>
            <ul className="space-y-3 text-white/60">
              <li>
                <strong className="text-white/80">Account Information:</strong> Your email address and password when you create an account, managed through Supabase authentication.
              </li>
              <li>
                <strong className="text-white/80">Platform Authorization Tokens:</strong> When you connect a social media account (YouTube, TikTok), we store OAuth access tokens and refresh tokens to act on your behalf. We do not store your social media passwords.
              </li>
              <li>
                <strong className="text-white/80">Uploaded Content:</strong> Video files you upload for scheduling. These are stored securely and used solely for publishing to your connected platforms.
              </li>
              <li>
                <strong className="text-white/80">Post Metadata:</strong> Titles, descriptions, scheduling times, privacy settings, and platform-specific settings you configure for your posts.
              </li>
              <li>
                <strong className="text-white/80">Basic Profile Information:</strong> When you connect TikTok, we receive your TikTok open ID to identify your account. When you connect YouTube, we receive your channel information for publishing purposes.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">3. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-white/60">
              <li>Provide the Service: uploading and scheduling your videos to connected platforms</li>
              <li>Authenticate your identity and manage your account</li>
              <li>Maintain and refresh platform connections on your behalf</li>
              <li>Display your post history and scheduling status</li>
            </ul>
            <p className="mt-3">
              We do <strong className="text-white/80">not</strong> sell, rent, or share your personal information with third parties for marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">4. Third-Party Services</h2>
            <p>Clip Dash integrates with the following third-party services:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-white/60">
              <li><strong className="text-white/80">YouTube (Google):</strong> To upload videos to your channel. Subject to Google's Privacy Policy.</li>
              <li><strong className="text-white/80">TikTok:</strong> To publish videos to your account. Subject to TikTok's Privacy Policy.</li>
              <li><strong className="text-white/80">Supabase:</strong> For authentication and secure data storage.</li>
            </ul>
            <p className="mt-3">
              We only share data with these platforms as necessary to perform the actions you request (e.g., publishing a video). We transmit your video content directly to the platform's API when a scheduled post is due.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">5. Data Storage and Security</h2>
            <p>
              Your data is stored securely using Supabase (database and authentication) and Supabase Storage (video files). OAuth tokens are stored server-side and never exposed to the browser. We use HTTPS for all data transmission. Access tokens are refreshed automatically and old tokens are overwritten.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">6. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. Uploaded videos are stored until you delete them or your account. When you disconnect a platform, we delete the associated authorization tokens. When you delete your account, all associated data is removed.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">7. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-white/60">
              <li>Access the personal data we hold about you</li>
              <li>Disconnect any linked social media account at any time via Settings</li>
              <li>Delete your account and all associated data</li>
              <li>Revoke Clip Dash's access through each platform's security settings</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">8. Children's Privacy</h2>
            <p>
              The Service is not intended for children under 13. We do not knowingly collect personal information from children under 13.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">9. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Continued use of the Service after changes constitutes acceptance of the updated policy. We will make reasonable efforts to notify users of significant changes.
            </p>
          </section>

          <section>
            <h2 className="text-base font-medium text-white mb-3">10. Contact</h2>
            <p>
              If you have questions about this Privacy Policy or how your data is handled, please contact us through the Service.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-xs text-white/30">Clip Dash</p>
        </div>
      </div>
    </div>
  );
}
