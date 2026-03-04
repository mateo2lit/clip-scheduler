import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 left-1/2 h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-b from-blue-500/[0.08] via-purple-500/[0.06] to-transparent blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[520px] w-[520px] rounded-full bg-gradient-to-t from-purple-500/[0.06] to-transparent blur-3xl" />
        <div className="absolute -top-20 left-[-6rem] h-64 w-64 rounded-full bg-pink-500/[0.05] blur-3xl" />
      </div>

      <div className="mx-auto max-w-4xl px-6 py-10">
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
          <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-white/50">Last updated: March 2026</p>
          <p className="mt-5 text-sm text-white/70 max-w-3xl">
            This Privacy Policy explains how Clip Dash collects, uses, stores, and shares your information when you use our video scheduling service. Please read it carefully.
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_70px_rgba(2,6,23,0.45)] sm:p-8">
          <div className="space-y-8 text-sm text-white/70 leading-relaxed">

            <section>
              <h2 className="text-base font-medium text-white mb-3">1. Who We Are</h2>
              <p>
                Clip Dash ("Clip Dash", "we", "our", "us") operates the video scheduling and publishing service available at clipdash.org. We act as the data controller for personal data collected through this Service. For questions about this policy, contact us at{" "}
                <a href="mailto:privacy@clipdash.org" className="text-white/80 underline">privacy@clipdash.org</a>.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">2. Information We Collect</h2>
              <p className="mb-3">We collect the following categories of information:</p>
              <ul className="space-y-3 text-white/60">
                <li>
                  <strong className="text-white/80">Account Information:</strong> Your email address and hashed password when you register. Managed through Supabase authentication.
                </li>
                <li>
                  <strong className="text-white/80">Platform Authorization Tokens:</strong> When you connect social media accounts (YouTube, TikTok, Instagram, Facebook, LinkedIn, Threads, Bluesky), we store OAuth access tokens, refresh tokens, and platform-specific identifiers (user IDs, page IDs, DID handles) to act on your behalf. We do not store your social media passwords.
                </li>
                <li>
                  <strong className="text-white/80">Uploaded Content:</strong> Video files and thumbnail images you upload for scheduling. Stored in Supabase Storage and used solely to publish to your connected platforms.
                </li>
                <li>
                  <strong className="text-white/80">Post Metadata:</strong> Titles, descriptions, hashtags, captions, scheduling times, privacy settings, and platform-specific settings you configure.
                </li>
                <li>
                  <strong className="text-white/80">Profile Information:</strong> Platform usernames, channel/page names, profile pictures, and account identifiers received via platform APIs when you connect an account.
                </li>
                <li>
                  <strong className="text-white/80">Team and Billing Information:</strong> Team name, member email addresses, subscription plan, and Stripe customer ID. Payment card details are processed and stored by Stripe — we do not store card numbers.
                </li>
                <li>
                  <strong className="text-white/80">Usage and Log Data:</strong> IP addresses, browser type, device information, pages visited, feature usage, and error logs. Collected automatically by our infrastructure (Vercel, Supabase).
                </li>
                <li>
                  <strong className="text-white/80">Communications:</strong> Messages you send us via email or support channels.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">3. How We Use Your Information</h2>
              <p className="mb-2">We use your information for the following purposes:</p>
              <ul className="list-disc list-inside space-y-1 text-white/60">
                <li>Providing the Service: storing, processing, and publishing your video content to connected platforms on your behalf</li>
                <li>Authenticating your identity and managing your account and team</li>
                <li>Processing payments and managing subscriptions via Stripe</li>
                <li>Maintaining and automatically refreshing platform OAuth connections</li>
                <li>Sending transactional notifications (post success, failure, reconnect alerts)</li>
                <li>Generating AI-powered hashtag suggestions using Anthropic Claude (your caption/title text may be sent to Anthropic's API)</li>
                <li>Detecting and preventing fraud, abuse, and security incidents</li>
                <li>Complying with legal obligations</li>
                <li>Improving the Service based on aggregate, anonymized usage patterns</li>
              </ul>
              <p className="mt-3">
                We do <strong className="text-white/80">not</strong> sell, rent, or share your personal information with third parties for advertising or marketing purposes. We do not use your content or platform data to train AI models.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">4. Legal Basis for Processing (GDPR)</h2>
              <p className="mb-2">For users in the European Economic Area (EEA) and United Kingdom, we process your personal data on the following legal bases:</p>
              <ul className="space-y-2 text-white/60">
                <li><strong className="text-white/80">Performance of a contract:</strong> Processing necessary to provide the Service you signed up for (account management, video publishing, scheduling).</li>
                <li><strong className="text-white/80">Legitimate interests:</strong> Security monitoring, fraud prevention, service improvement, and sending service-critical communications.</li>
                <li><strong className="text-white/80">Legal obligation:</strong> Where we are required to process data to comply with applicable law.</li>
                <li><strong className="text-white/80">Consent:</strong> For optional communications such as product updates and marketing emails, where you have opted in. You may withdraw consent at any time.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">5. Google API Services and YouTube Data</h2>
              <p className="mb-2">
                Clip Dash uses Google APIs (including the YouTube Data API v3) to publish content to YouTube on your behalf. Our use of information received from Google APIs, including YouTube, adheres to the{" "}
                <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-white/80 underline">Google API Services User Data Policy</a>, including the Limited Use requirements.
              </p>
              <p className="mb-2">Specifically regarding Google/YouTube data:</p>
              <ul className="list-disc list-inside space-y-1 text-white/60">
                <li>We only request YouTube API scopes necessary to upload and manage your videos</li>
                <li>We do not use Google user data for advertising, profiling, or any purpose other than providing the scheduling Service</li>
                <li>We do not sell, transfer, or share Google user data with third parties except as necessary to operate the Service</li>
                <li>We do not use Google user data to train AI or machine learning models</li>
                <li>Human access to Google user data is strictly limited to troubleshooting issues at your direct request</li>
                <li>YouTube OAuth tokens are stored server-side, never exposed to the browser or third parties</li>
                <li>You can revoke Clip Dash&apos;s YouTube access at any time via Settings or through your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-white/80 underline">Google Account permissions</a></li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">6. Third-Party Services and Subprocessors</h2>
              <p className="mb-2">Clip Dash integrates with and relies on the following third-party services. Each processes your data only to the extent necessary for their stated function:</p>
              <ul className="space-y-3 text-white/60">
                <li><strong className="text-white/80">YouTube (Google LLC):</strong> Video publishing via YouTube Data API v3. Governed by <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-white/80 underline">Google Privacy Policy</a>.</li>
                <li><strong className="text-white/80">TikTok (TikTok Inc.):</strong> Video publishing via TikTok Content Posting API. Governed by <a href="https://www.tiktok.com/legal/page/us/privacy-policy/en" target="_blank" rel="noopener noreferrer" className="text-white/80 underline">TikTok Privacy Policy</a>.</li>
                <li><strong className="text-white/80">Facebook (Meta Platforms, Inc.):</strong> Video publishing to Facebook Pages via Meta Graph API. Governed by <a href="https://www.meta.com/privacy/policy/" target="_blank" rel="noopener noreferrer" className="text-white/80 underline">Meta Privacy Policy</a>.</li>
                <li><strong className="text-white/80">Instagram (Meta Platforms, Inc.):</strong> Reel/Story publishing via Instagram Graph API (Business and Creator accounts only). Governed by Meta Privacy Policy.</li>
                <li><strong className="text-white/80">LinkedIn (LinkedIn Corporation):</strong> Video publishing to LinkedIn profiles via LinkedIn API. Governed by <a href="https://www.linkedin.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-white/80 underline">LinkedIn Privacy Policy</a>.</li>
                <li><strong className="text-white/80">Threads (Meta Platforms, Inc.):</strong> Video publishing via Threads API. Governed by Meta Privacy Policy.</li>
                <li><strong className="text-white/80">Bluesky (Bluesky PBLLC):</strong> Video publishing via AT Protocol to bsky.social. Governed by <a href="https://bsky.social/about/support/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-white/80 underline">Bluesky Privacy Policy</a>. App passwords are stored server-side and never exposed to the browser.</li>
                <li><strong className="text-white/80">Supabase (Supabase Inc.):</strong> Database, authentication, and file storage infrastructure. Data stored in Supabase-managed PostgreSQL and object storage.</li>
                <li><strong className="text-white/80">Vercel Inc.:</strong> Cloud hosting and serverless function execution. May process request logs and IP addresses.</li>
                <li><strong className="text-white/80">Stripe Inc.:</strong> Payment processing and subscription management. Stripe processes payment card data directly and is PCI-DSS compliant. We store only your Stripe customer ID.</li>
                <li><strong className="text-white/80">Anthropic PBC:</strong> AI-powered hashtag suggestions. When you use this feature, your post title and description are sent to Anthropic&apos;s Claude API. Anthropic does not use this data to train models by default.</li>
                <li><strong className="text-white/80">Resend Inc.:</strong> Transactional email delivery (post status notifications, team invitations).</li>
              </ul>
              <p className="mt-3">
                We only transmit your content and data to these platforms as necessary to perform the actions you request. Video files are sent directly to the platform API at the scheduled time and are not forwarded to any other party.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">7. Data Storage, Security, and International Transfers</h2>
              <p className="mb-2">
                Your data is stored on servers operated by Supabase and Vercel, which may be located in the United States or other countries. By using the Service, you consent to the transfer and processing of your data in these locations.
              </p>
              <p className="mb-2">
                We take reasonable technical and organizational measures to protect your data, including:
              </p>
              <ul className="list-disc list-inside space-y-1 text-white/60">
                <li>HTTPS encryption for all data in transit</li>
                <li>OAuth tokens and app passwords stored server-side only, never exposed to the browser</li>
                <li>Database access restricted via service role credentials not accessible to client code</li>
                <li>Row-Level Security policies on database tables</li>
                <li>Access controls limiting employee and contractor access to user data</li>
              </ul>
              <p className="mt-3">
                For transfers of EEA personal data to the United States, we rely on Standard Contractual Clauses or equivalent mechanisms where required by applicable law.
              </p>
              <p className="mt-3">
                In the event of a data breach that is likely to result in risk to your rights and freedoms, we will notify you and relevant authorities as required by applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">8. Data Retention</h2>
              <p className="mb-2">We retain your data as follows:</p>
              <ul className="space-y-2 text-white/60">
                <li><strong className="text-white/80">Account data:</strong> Retained while your account is active. Deleted within 30 days of account deletion.</li>
                <li><strong className="text-white/80">Uploaded video files:</strong> Retained until you delete them or your account is closed.</li>
                <li><strong className="text-white/80">Scheduled and posted content metadata:</strong> Retained while your account is active.</li>
                <li><strong className="text-white/80">OAuth tokens:</strong> Retained while the platform connection is active. Deleted immediately upon disconnection.</li>
                <li><strong className="text-white/80">Bluesky app passwords:</strong> Retained while the connection is active. Deleted immediately upon disconnection.</li>
                <li><strong className="text-white/80">Billing records:</strong> Retained for up to 7 years as required by financial regulations.</li>
                <li><strong className="text-white/80">Server logs:</strong> Retained for up to 90 days for security and debugging purposes.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">9. Data Deletion and Facebook/Instagram Callback</h2>
              <p className="mb-2">You can request deletion of your data at any time:</p>
              <ul className="space-y-2 text-white/60">
                <li>
                  <strong className="text-white/80">Disconnect a platform:</strong> Go to Settings → Connections and click "Disconnect." This immediately deletes all stored tokens and platform-specific identifiers for that connection.
                </li>
                <li>
                  <strong className="text-white/80">Delete your account:</strong> Use the "Delete Account" option in Settings → Account. This permanently removes your account, uploaded files, scheduled posts, and all platform tokens. Account deletion is processed within 30 days.
                </li>
                <li>
                  <strong className="text-white/80">Facebook/Instagram data deletion:</strong> If you connected Facebook or Instagram, you may request data deletion directly through Facebook at{" "}
                  <a href="https://www.facebook.com/settings?tab=applications" target="_blank" rel="noopener noreferrer" className="text-white/80 underline">Facebook Settings → Apps and Websites</a>. We also provide an automated data deletion callback endpoint at{" "}
                  <code className="text-white/60 bg-white/5 px-1 rounded">/api/account/delete</code> as required by Meta Platform Terms.
                </li>
                <li>
                  <strong className="text-white/80">Contact us:</strong> Email <a href="mailto:privacy@clipdash.org" className="text-white/80 underline">privacy@clipdash.org</a> to request deletion of any specific data.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">10. Cookies and Tracking Technologies</h2>
              <p className="mb-2">
                We use cookies and similar technologies for:
              </p>
              <ul className="list-disc list-inside space-y-1 text-white/60">
                <li><strong className="text-white/80">Authentication:</strong> Supabase session cookies to keep you logged in across page visits</li>
                <li><strong className="text-white/80">Security:</strong> CSRF protection and OAuth state validation tokens</li>
                <li><strong className="text-white/80">Preferences:</strong> Local storage for UI settings (e.g., platform defaults)</li>
              </ul>
              <p className="mt-3">
                We do not use third-party advertising cookies or behavioral tracking. You can clear cookies via your browser settings, which will log you out of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">11. Your Rights</h2>
              <p className="mb-2">Depending on your location, you may have the following rights regarding your personal data:</p>
              <ul className="space-y-2 text-white/60">
                <li><strong className="text-white/80">Access:</strong> Request a copy of the personal data we hold about you.</li>
                <li><strong className="text-white/80">Rectification:</strong> Request correction of inaccurate or incomplete data.</li>
                <li><strong className="text-white/80">Erasure:</strong> Request deletion of your personal data ("right to be forgotten"), subject to legal retention requirements.</li>
                <li><strong className="text-white/80">Portability:</strong> Receive your data in a structured, machine-readable format.</li>
                <li><strong className="text-white/80">Restriction:</strong> Request that we restrict processing of your data in certain circumstances.</li>
                <li><strong className="text-white/80">Objection:</strong> Object to processing based on legitimate interests.</li>
                <li><strong className="text-white/80">Withdraw consent:</strong> Where processing is based on consent, withdraw it at any time without affecting prior processing.</li>
                <li><strong className="text-white/80">Revoke platform access:</strong> Disconnect any linked platform account at any time via Settings, or directly through each platform&apos;s security settings.</li>
              </ul>
              <p className="mt-3">
                To exercise any of these rights, email <a href="mailto:privacy@clipdash.org" className="text-white/80 underline">privacy@clipdash.org</a>. We will respond within 30 days (or within the timeframe required by applicable law). If you are an EEA resident, you also have the right to lodge a complaint with your local data protection authority.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">12. California Residents (CCPA/CPRA)</h2>
              <p className="mb-2">
                If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA):
              </p>
              <ul className="space-y-2 text-white/60">
                <li><strong className="text-white/80">Right to Know:</strong> Request disclosure of the categories and specific pieces of personal information we have collected about you, the sources, our business purpose for collecting it, and the categories of third parties with whom we share it.</li>
                <li><strong className="text-white/80">Right to Delete:</strong> Request deletion of personal information we have collected, subject to certain exceptions.</li>
                <li><strong className="text-white/80">Right to Correct:</strong> Request correction of inaccurate personal information.</li>
                <li><strong className="text-white/80">Right to Opt-Out of Sale or Sharing:</strong> We do not sell or share personal information for cross-context behavioral advertising.</li>
                <li><strong className="text-white/80">Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your privacy rights.</li>
              </ul>
              <p className="mt-3">
                To submit a request, email <a href="mailto:privacy@clipdash.org" className="text-white/80 underline">privacy@clipdash.org</a>. We will respond within 45 days.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">13. Children&apos;s Privacy</h2>
              <p>
                The Service is intended for users aged 13 and older. If you are in the EEA, you must be at least 16 (or the minimum age required by your country) to use the Service without parental consent. We do not knowingly collect personal information from children under 13. If we become aware that we have collected data from a child under 13, we will delete it promptly. If you believe a minor has provided us with personal data, contact us at <a href="mailto:privacy@clipdash.org" className="text-white/80 underline">privacy@clipdash.org</a>.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">14. Automated Decision-Making</h2>
              <p>
                We do not make any decisions about you based solely on automated processing that produce legal or similarly significant effects. The AI hashtag suggestion feature generates suggestions that you review and apply manually — it does not make automated decisions about your account.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">15. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. If we make material changes, we will notify you by email or by displaying a prominent notice in the Service at least 30 days before the changes take effect. The "Last updated" date at the top of this policy reflects the most recent revision. Continued use of the Service after changes take effect constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">16. Contact</h2>
              <p>
                For questions, concerns, or requests regarding this Privacy Policy or your personal data, contact us at:{" "}
                <a href="mailto:privacy@clipdash.org" className="text-white/80 underline">privacy@clipdash.org</a>
              </p>
            </section>

          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-xs text-white/30">Clip Dash · <a href="mailto:privacy@clipdash.org" className="hover:text-white/50 transition-colors">privacy@clipdash.org</a></p>
        </div>
      </div>
    </div>
  );
}
