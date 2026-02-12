'use client'

import Link from 'next/link'
import styles from './legal.module.css'

export default function PrivacyPolicy() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>← Home</Link>
      </header>

      <main className={styles.content}>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.updated}>Last Updated: February 2026</p>

        <section className={styles.section}>
          <h2>The Short Version</h2>
          <p>
            Spark collects only what's necessary to provide the service. Your ideas are yours. 
            We don't sell your data. We use AI to help you think, not to train models on your content.
          </p>
        </section>

        <section className={styles.section}>
          <h2>What We Collect</h2>
          
          <h3>Account Information</h3>
          <p><strong>Email address</strong> — Used for sign-in via magic link. We don't use passwords.</p>
          
          <h3>Content You Create</h3>
          <p><strong>Ideas</strong> — Titles, current thinking, and all elements you add</p>
          <p><strong>Jots</strong> — Thoughts, links, images, and files in your holding area</p>
          <p><strong>Scouts</strong> — Topics you select and provocations you save</p>
          
          <h3>Automatically Collected</h3>
          <p><strong>Basic analytics</strong> — Page views and general usage patterns (via Vercel)</p>
          <p><strong>Error logs</strong> — To fix bugs and improve the service</p>
        </section>

        <section className={styles.section}>
          <h2>How We Use Your Data</h2>
          
          <h3>To Provide the Service</h3>
          <p>Store and display your ideas, jots, and elements. Process AI requests (Sparks, Scouts, Summarize). Send magic link emails for authentication.</p>
          
          <h3>AI Processing</h3>
          <p>
            When you use Spark features (like "Spark It" or "Go deeper"), your content is sent to 
            Anthropic's Claude API to generate responses. This includes your current thinking, 
            elements in the idea, and any custom prompts you write.
          </p>
          <p>
            <strong>Important:</strong> Your content is not used to train AI models. Anthropic's API 
            has a zero-retention policy for API inputs.
          </p>
          
          <h3>We Do NOT</h3>
          <p>Sell your data to third parties. Use your content for advertising. Share your ideas with other users. Train AI models on your content.</p>
        </section>

        <section className={styles.section}>
          <h2>Data Storage</h2>
          <p>
            Your data is stored in Supabase (database hosted on AWS). Files and images are stored 
            in Supabase Storage. All data is associated with your account and protected by row-level 
            security — you can only access your own data.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Data Retention</h2>
          <p>
            Your data is kept as long as your account exists. If you delete your account, all your 
            data (ideas, elements, settings) is permanently deleted. We don't keep backups of deleted accounts.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Third-Party Services</h2>
          <p>Spark uses the following services:</p>
          <p><strong>Supabase</strong> — Database & Authentication</p>
          <p><strong>Anthropic</strong> — AI Processing</p>
          <p><strong>Vercel</strong> — Hosting</p>
          <p><strong>Resend</strong> — Email Delivery</p>
          <p><strong>Cloudflare</strong> — DNS & Security</p>
        </section>

        <section className={styles.section}>
          <h2>Your Rights</h2>
          <p>You can:</p>
          <p><strong>Access</strong> your data anytime through the app</p>
          <p><strong>Delete</strong> your account and all associated data</p>
          <p><strong>Contact us</strong> with questions at hello@sparkideas.app</p>
        </section>

        <section className={styles.section}>
          <h2>Cookies & Local Storage</h2>
          <p>
            Spark uses Supabase auth cookies to keep you signed in, and localStorage to remember 
            your theme preference and scouts in progress. We don't use tracking cookies or 
            third-party analytics cookies.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Children</h2>
          <p>Spark is not intended for children under 13. We don't knowingly collect data from children.</p>
        </section>

        <section className={styles.section}>
          <h2>Changes to This Policy</h2>
          <p>
            If we make significant changes, we'll notify you via email or in-app notice. 
            Continued use after changes means you accept the updated policy.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Contact</h2>
          <p>Questions? Email us at <a href="mailto:hello@sparkideas.app">hello@sparkideas.app</a></p>
        </section>

        <p className={styles.footer}>
          This policy is meant to be readable by humans. If something is unclear, please ask.
        </p>
      </main>
    </div>
  )
}