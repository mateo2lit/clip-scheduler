import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      </div>

      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1 text-sm text-white/40 transition-colors hover:text-white/70"
        >
          <CaretLeft className="w-4 h-4" weight="bold" />
          Back to Home
        </Link>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-white/50">Last updated: March 2026</p>
          <p className="mt-5 text-sm text-white/70 max-w-3xl">
            These Terms of Service govern your access to and use of Clip Dash. By using the Service, you agree to be bound by these terms. If you do not agree, do not use the Service.
          </p>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_20px_70px_rgba(2,6,23,0.45)] sm:p-8">
          <div className="space-y-8 text-sm text-white/70 leading-relaxed">

            <section>
              <h2 className="text-base font-medium text-white mb-3">1. Acceptance of Terms</h2>
              <p>
                By creating an account, accessing, or using Clip Dash ("the Service"), you agree to be bound by these Terms of Service and our Privacy Policy. If you are using the Service on behalf of a business or organization, you represent that you have authority to bind that entity, and "you" refers to that entity. If you do not agree to all terms, do not use the Service.
              </p>
              <p className="mt-2">
                You must be at least 13 years old to use the Service (or 16 in the EEA where applicable). By using the Service, you represent that you meet this age requirement.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">2. Description of Service</h2>
              <p>
                Clip Dash is a video scheduling and publishing platform that allows content creators and teams to upload video content and schedule it for automatic publication across connected social media platforms, including YouTube, TikTok, Instagram (Business/Creator accounts only), Facebook, LinkedIn, and Bluesky. The Service acts as an authorized intermediary, publishing content on your behalf using the access credentials you explicitly grant.
              </p>
              <p className="mt-2">
                The Service includes features for team collaboration, post scheduling, content templates, analytics viewing, comment management, and AI-assisted caption suggestions.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">3. Accounts and Authorization</h2>
              <p className="mb-2">
                To use the Service, you must create an account using a valid email address and connect at least one social media platform. You are responsible for:
              </p>
              <ul className="list-disc list-inside space-y-1 text-white/60">
                <li>Maintaining the confidentiality of your account credentials</li>
                <li>All activity that occurs under your account</li>
                <li>Notifying us immediately at <a href="mailto:support@clipdash.org" className="text-white/80 underline">support@clipdash.org</a> of any unauthorized access</li>
                <li>Ensuring that any team members you invite agree to these Terms</li>
              </ul>
              <p className="mt-2">
                You authorize Clip Dash to access and act on your connected social media accounts through each platform&apos;s official OAuth authorization flow (or, for Bluesky, via app password). You can revoke access at any time through Settings or through each platform&apos;s own security settings.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">4. Team Plans and Multi-User Access</h2>
              <p className="mb-2">
                Team plans allow multiple users to access a shared workspace. The account owner is responsible for all activity within the team, including the actions of invited members.
              </p>
              <ul className="list-disc list-inside space-y-1 text-white/60">
                <li>The team owner controls billing and can add, remove, or change roles of team members</li>
                <li>Admins may connect/disconnect platform accounts and schedule posts</li>
                <li>Members may create and schedule posts but cannot manage platform connections or billing</li>
                <li>Removing a team member revokes their access to the workspace immediately</li>
                <li>Platform connections and posted content belong to the team, not individual members</li>
                <li>Team plans are subject to member seat limits based on the selected plan tier</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">5. User Content</h2>
              <p>
                You retain full ownership of all video content, captions, and metadata you upload to the Service. By using Clip Dash, you grant us a limited, non-exclusive, royalty-free license to store, process, and transmit your content solely for the purpose of delivering the Service — specifically, to publish your content to your connected platforms at your scheduled times.
              </p>
              <p className="mt-2">
                We do not claim ownership of your content. We do not use your content to train AI models. Your content is not shared with any third party other than the platforms you explicitly select for publication.
              </p>
              <p className="mt-2">
                You represent and warrant that: (a) you own or have the necessary rights to all content you upload; (b) your content does not infringe any third party&apos;s intellectual property, privacy, or other rights; and (c) your content complies with the terms of service of each platform you publish to and all applicable laws.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">6. Acceptable Use</h2>
              <p className="mb-2">You agree not to use the Service to:</p>
              <ul className="list-disc list-inside space-y-1 text-white/60">
                <li>Upload or publish content that violates any applicable law, regulation, or platform policy</li>
                <li>Infringe or misappropriate any intellectual property, privacy, or other rights of any person</li>
                <li>Distribute spam, malware, phishing content, or deceptive material</li>
                <li>Harass, threaten, or harm any person</li>
                <li>Circumvent, reverse engineer, or interfere with the Service or its security features</li>
                <li>Attempt to gain unauthorized access to any system, account, or data</li>
                <li>Use the Service to post content that violates platform community guidelines (including YouTube Community Guidelines, TikTok Community Guidelines, Meta Community Standards, LinkedIn Professional Community Policies)</li>
                <li>Resell, sublicense, or commercialize the Service or your access to it without our written consent</li>
                <li>Use automated means to create accounts or access the Service in ways not intended by us</li>
                <li>Impersonate any person or entity</li>
              </ul>
              <p className="mt-2">
                We reserve the right to remove content, suspend, or terminate accounts that violate these terms or applicable platform policies.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">7. Third-Party Platforms</h2>
              <p>
                Clip Dash integrates with YouTube, TikTok, Instagram, Facebook, LinkedIn, Bluesky, and other platforms. Your use of these platforms is independently subject to their own terms of service, community guidelines, and privacy policies. Clip Dash is not affiliated with, endorsed by, or responsible for any third-party platform.
              </p>
              <p className="mt-2">
                Publishing through Clip Dash does not exempt you from complying with each platform&apos;s rules. If a platform rejects, removes, or takes action on your content, that is between you and the platform. We are not liable for platform decisions regarding your content.
              </p>
              <p className="mt-2">
                Platforms may change their APIs, policies, or access requirements at any time. We will make reasonable efforts to maintain integrations but cannot guarantee perpetual availability of any specific platform connection.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">8. Automated Publishing Disclosure</h2>
              <p>
                Clip Dash automatically publishes content to your connected platforms at your scheduled times without requiring you to be present or take manual action. By scheduling a post, you acknowledge and authorize this automated publication.
              </p>
              <p className="mt-2">
                You are solely responsible for reviewing your content before scheduling. Once a post is published by the Service, we cannot retract it from the destination platform — only you can delete it directly on that platform.
              </p>
              <p className="mt-2">
                Some platforms (Instagram) use an asynchronous publishing process that may take several minutes to complete after the scheduled time. We do not guarantee exact publication times.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">9. Subscriptions, Billing, and Trials</h2>
              <p className="mb-2">
                Access to certain features requires a paid subscription, processed through Stripe. By subscribing, you authorize us to charge your payment method on a recurring basis until you cancel.
              </p>
              <ul className="space-y-2 text-white/60">
                <li><strong className="text-white/80">Trial periods:</strong> If offered, free trials automatically convert to paid subscriptions at the end of the trial unless you cancel before the trial expires. You will be notified of the trial end date at signup.</li>
                <li><strong className="text-white/80">Billing cycle:</strong> Subscriptions are billed monthly or annually depending on the plan you select. Billing renews automatically at the end of each period.</li>
                <li><strong className="text-white/80">Price changes:</strong> We may change subscription prices with at least 30 days&apos; advance notice. Continued use after the notice period constitutes acceptance of the new pricing.</li>
                <li><strong className="text-white/80">Failed payments:</strong> If a payment fails, we will retry the charge. If payment remains unsuccessful, your account may be downgraded or suspended until resolved.</li>
                <li><strong className="text-white/80">Taxes:</strong> Prices are exclusive of applicable taxes. You are responsible for any sales, use, VAT, or similar taxes applicable to your subscription.</li>
                <li><strong className="text-white/80">Payment information:</strong> Card details are processed directly by Stripe. We do not store card numbers. You must maintain accurate, current payment information.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">10. Cancellation and Refunds</h2>
              <p className="mb-2">
                You may cancel your subscription at any time through Settings → Billing. Cancellation takes effect at the end of your current billing period; you retain access to paid features until then.
              </p>
              <p className="mb-2">
                Except where required by applicable consumer protection law, subscription fees are non-refundable. If you believe a billing error has occurred, contact us at <a href="mailto:support@clipdash.org" className="text-white/80 underline">support@clipdash.org</a> within 30 days of the charge, and we will review the issue in good faith.
              </p>
              <p>
                Users in jurisdictions with mandatory cooling-off or cancellation rights (such as the EU&apos;s 14-day right of withdrawal) may be entitled to a refund if they cancel within the applicable statutory period, provided the service has not been substantially used.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">11. Service Availability and No Warranty for Publishing</h2>
              <p>
                We strive to maintain high availability but do not guarantee uninterrupted, error-free access to the Service. Scheduled posts may fail or be delayed due to:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-white/60">
                <li>Platform API outages, rate limits, or policy changes</li>
                <li>Expired or revoked OAuth tokens</li>
                <li>Platform rejection of content for policy violations</li>
                <li>Network issues, server maintenance, or force majeure events</li>
                <li>Errors in your content (invalid format, size limits exceeded)</li>
              </ul>
              <p className="mt-2">
                We will make reasonable efforts to notify you of failed posts via email (if enabled) and through the dashboard. We are not liable for any loss of reach, revenue, opportunities, or other damages resulting from failed, delayed, or incorrect publications.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">12. Intellectual Property</h2>
              <p>
                The Service, including its design, code, features, logos, and branding, is owned by Clip Dash and protected by intellectual property laws. You are granted a limited, non-exclusive, non-transferable license to use the Service as intended. You may not copy, modify, distribute, sell, or create derivative works from any part of the Service without our written permission.
              </p>
              <p className="mt-2">
                If you believe content you own has been infringed through the Service, contact us at <a href="mailto:support@clipdash.org" className="text-white/80 underline">support@clipdash.org</a> with a description of the claim. We will investigate and respond in accordance with applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">13. Disclaimer of Warranties</h2>
              <p>
                THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS. NO ADVICE OR INFORMATION OBTAINED FROM US CREATES ANY WARRANTY NOT EXPRESSLY STATED IN THESE TERMS.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">14. Limitation of Liability</h2>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CLIP DASH AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITIES, ARISING FROM OR RELATED TO YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
              </p>
              <p className="mt-2">
                OUR TOTAL CUMULATIVE LIABILITY TO YOU FOR ANY CLAIMS ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL FEES YOU PAID TO US IN THE 12 MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS (USD $100).
              </p>
              <p className="mt-2">
                Some jurisdictions do not allow the exclusion or limitation of certain damages, so the above limitations may not apply to you to the extent prohibited by law.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">15. Indemnification</h2>
              <p>
                You agree to defend, indemnify, and hold harmless Clip Dash and its officers, directors, employees, and agents from and against any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys&apos; fees) arising from: (a) your use of the Service; (b) your violation of these Terms; (c) your content or the content you publish through the Service; (d) your violation of any platform&apos;s terms of service; or (e) your infringement of any third party&apos;s rights.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">16. Termination</h2>
              <p className="mb-2">
                Either party may terminate the relationship at any time:
              </p>
              <ul className="space-y-2 text-white/60">
                <li><strong className="text-white/80">By you:</strong> Cancel your subscription and delete your account via Settings. Your data will be deleted within 30 days per our Privacy Policy.</li>
                <li><strong className="text-white/80">By us:</strong> We may suspend or terminate your account immediately, with or without notice, if you violate these Terms, fail to pay applicable fees, engage in abusive behavior, or if required by law or platform partner demand.</li>
              </ul>
              <p className="mt-2">
                Upon termination, your access to the Service ceases and your stored data will be deleted per our data retention policy. Provisions of these Terms that by their nature should survive termination (including intellectual property, limitation of liability, indemnification, and governing law) shall survive.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">17. Dispute Resolution</h2>
              <p>
                Before filing any formal dispute, you agree to contact us at <a href="mailto:support@clipdash.org" className="text-white/80 underline">support@clipdash.org</a> and give us 30 days to attempt to resolve the issue informally.
              </p>
              <p className="mt-2">
                If informal resolution fails, disputes shall be resolved through binding arbitration administered under applicable arbitration rules, except that either party may seek injunctive or other equitable relief in any court of competent jurisdiction for claims related to intellectual property or unauthorized access. You waive the right to participate in a class action lawsuit or class-wide arbitration.
              </p>
              <p className="mt-2">
                Nothing in this section prevents users in the European Union from bringing claims before their local courts or consumer protection authorities.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">18. Governing Law</h2>
              <p>
                These Terms are governed by and construed in accordance with applicable law, without regard to conflict-of-law principles. Users in the European Union retain the benefit of any mandatory consumer protection provisions of their local law that cannot be contractually excluded.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">19. Force Majeure</h2>
              <p>
                Neither party shall be liable for delays or failures in performance resulting from events beyond their reasonable control, including natural disasters, power outages, internet disruptions, government actions, strikes, platform API changes, or other circumstances outside a party&apos;s reasonable control.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">20. Changes to Terms</h2>
              <p>
                We may update these Terms at any time. If we make material changes, we will notify you by email or prominent in-app notice at least 30 days before the new terms take effect. Continued use of the Service after the effective date constitutes acceptance of the updated Terms. If you disagree with the changes, you may cancel your account before the effective date.
              </p>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">21. General</h2>
              <ul className="space-y-2 text-white/60">
                <li><strong className="text-white/80">Entire Agreement:</strong> These Terms and our Privacy Policy constitute the entire agreement between you and Clip Dash regarding the Service and supersede any prior agreements.</li>
                <li><strong className="text-white/80">Severability:</strong> If any provision of these Terms is found to be unenforceable, the remaining provisions remain in full force and effect.</li>
                <li><strong className="text-white/80">No Waiver:</strong> Our failure to enforce any right or provision of these Terms does not constitute a waiver of that right or provision.</li>
                <li><strong className="text-white/80">Assignment:</strong> You may not assign your rights or obligations under these Terms without our prior written consent. We may assign our rights freely, including in connection with a merger, acquisition, or sale of assets.</li>
                <li><strong className="text-white/80">Notices:</strong> We may send notices to the email address associated with your account. You are responsible for keeping your email address current.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-base font-medium text-white mb-3">22. Contact</h2>
              <p>
                For questions about these Terms of Service, contact us at{" "}
                <a href="mailto:support@clipdash.org" className="text-white/80 underline">support@clipdash.org</a>.
              </p>
            </section>

          </div>
        </div>

        <div className="mt-16 pt-8 border-t border-white/5 text-center">
          <p className="text-xs text-white/30">Clip Dash · <a href="mailto:support@clipdash.org" className="hover:text-white/50 transition-colors">support@clipdash.org</a></p>
        </div>
      </div>
    </div>
  );
}
