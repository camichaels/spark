'use client'

import Link from 'next/link'
import styles from './legal.module.css'

export default function TermsOfService() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>← Home</Link>
      </header>

      <main className={styles.content}>
        <h1 className={styles.title}>Terms of Service</h1>
        <p className={styles.updated}>Last Updated: February 2026</p>

        <section className={styles.section}>
          <h2>The Short Version</h2>
          <p>
            Spark is a tool for developing your ideas. Use it responsibly. Your content is yours. 
            Don't abuse the service. We'll do our best to keep it running, but we can't guarantee perfection.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Using Spark</h2>
          
          <h3>What Spark Is</h3>
          <p>Spark is a web application that helps you develop and refine your thinking through AI-assisted challenges and provocations.</p>
          
          <h3>What Spark Is Not</h3>
          <p>Not a replacement for professional advice (legal, medical, financial, etc.). Not a guarantee of good ideas or outcomes. Not a storage/backup service — keep copies of important content.</p>
          
          <h3>Account</h3>
          <p>You need an email address to create an account. You're responsible for your account activity. One account per person. You must be at least 13 years old.</p>
        </section>

        <section className={styles.section}>
          <h2>Your Content</h2>
          
          <h3>You Own It</h3>
          <p>Everything you create in Spark — ideas, thoughts, elements — belongs to you. We don't claim any ownership of your content.</p>
          
          <h3>You're Responsible For It</h3>
          <p>
            You agree not to use Spark to: create, store, or share illegal content; harass, threaten, 
            or harm others; spam or abuse the AI features; attempt to hack, overload, or disrupt 
            the service; or violate anyone else's rights.
          </p>
          
          <h3>License to Operate</h3>
          <p>
            By using Spark, you give us permission to store and display your content to you, 
            process your content through AI services to provide features, and create backups 
            for service reliability. This license is only for operating the service.
          </p>
        </section>

        <section className={styles.section}>
          <h2>AI Features</h2>
          
          <h3>How It Works</h3>
          <p>Spark uses AI (Anthropic's Claude) to generate challenges, provocations, and summaries based on your content.</p>
          
          <h3>Limitations</h3>
          <p>
            AI responses may be inaccurate, incomplete, or unhelpful. AI doesn't have access to 
            real-time information (unless using search features). AI may occasionally produce 
            unexpected or inappropriate responses. You should evaluate AI suggestions critically, 
            not follow them blindly.
          </p>
          
          <h3>Your Responsibility</h3>
          <p>You're responsible for how you use AI-generated content. Don't blindly trust or act on AI suggestions without your own judgment.</p>
        </section>

        <section className={styles.section}>
          <h2>The Service</h2>
          
          <h3>What We Provide</h3>
          <p>Access to the Spark web application. Storage of your ideas and elements. AI-powered features (Sparks, Scouts, Summarize).</p>
          
          <h3>What We Don't Guarantee</h3>
          <p>
            100% uptime or availability. That the service will meet all your needs. That AI responses 
            will be accurate or useful. That your data will never be lost (keep your own backups of critical content).
          </p>
          
          <h3>Changes</h3>
          <p>
            We may update features, design, or functionality; add or remove features; change pricing 
            (we'll give notice for paid features); or discontinue the service (we'll give reasonable notice).
          </p>
        </section>

        <section className={styles.section}>
          <h2>Termination</h2>
          
          <h3>You Can Leave Anytime</h3>
          <p>Delete your account through settings, or email hello@sparkideas.app. All your data will be permanently deleted.</p>
          
          <h3>We Can Terminate Access</h3>
          <p>
            We may suspend or terminate accounts that violate these terms, abuse the service or AI features, 
            are used for illegal purposes, or haven't been active for extended periods (we'll notify you first).
          </p>
        </section>

        <section className={styles.section}>
          <h2>Liability</h2>
          
          <h3>Our Limits</h3>
          <p>
            To the maximum extent allowed by law: Spark is provided "as is" without warranties. 
            We're not liable for any damages from using (or inability to use) the service. 
            We're not liable for lost data, lost profits, or any indirect damages. 
            Our total liability is limited to the amount you've paid us (currently $0 for free tier).
          </p>
          
          <h3>Your Responsibility</h3>
          <p>
            You agree to not hold us responsible for decisions you make based on AI suggestions, 
            content you create or share, or any consequences of using the service.
          </p>
        </section>

        <section className={styles.section}>
          <h2>General</h2>
          <p>
            These terms are governed by the laws of the United States. Disputes will be handled 
            in courts located in California. These terms (plus the Privacy Policy) are the complete 
            agreement between you and Spark Ideas. If any part of these terms is found unenforceable, 
            the rest still applies.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Contact</h2>
          <p>Questions? Concerns? Feedback? Email us at <a href="mailto:hello@sparkideas.app">hello@sparkideas.app</a></p>
        </section>

        <p className={styles.footer}>
          These terms are meant to be fair and readable. We're not trying to trick you. 
          If something seems unclear or unfair, let us know.
        </p>
      </main>
    </div>
  )
}