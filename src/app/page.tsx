import Link from 'next/link';
import Image from 'next/image';
import {
  MessageSquare,
  Sparkles,
  Zap,
  Shield,
  BarChart3,
  Code,
  ArrowRight,
  Check,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-ce-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="bg-ce-navy rounded-lg p-1.5">
                <Image
                  src="/Clara-Logo-white-caps.svg"
                  alt="Clara"
                  width={80}
                  height={24}
                  priority
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm font-medium text-ce-text hover:text-ce-teal transition-colors"
              >
                Log In
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-ce-navy bg-ce-lime rounded-full hover:opacity-90 transition-opacity"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-ce-muted to-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-sm font-medium text-ce-teal bg-ce-teal/10 rounded-full">
            <Sparkles className="w-4 h-4" />
            AI-Powered Customer Support
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-ce-navy leading-tight">
            Meet Clara
          </h1>
          <p className="mt-2 text-4xl sm:text-5xl lg:text-6xl font-bold text-ce-teal leading-tight">
            Your AI Chatbot, Built in Minutes
          </p>
          <p className="mt-6 text-lg sm:text-xl text-ce-text-muted max-w-2xl mx-auto">
            Create a custom AI chatbot for your website. Train it with your knowledge base,
            customize its personality, and deploy it anywhere — no coding required.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-semibold text-ce-navy bg-ce-lime rounded-full hover:opacity-90 transition-opacity"
            >
              Start Building Free
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="#features"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-medium text-ce-navy border-2 border-ce-navy rounded-full hover:bg-ce-navy hover:text-white transition-colors"
            >
              See How It Works
            </Link>
          </div>
        </div>

        {/* Chat Preview */}
        <div className="mt-16 max-w-lg mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-ce-border overflow-hidden">
            {/* Chat header */}
            <div className="bg-ce-navy px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-ce-lime flex items-center justify-center">
                <span className="text-ce-navy font-bold">C</span>
              </div>
              <div>
                <h3 className="text-white font-medium">Clara</h3>
                <p className="text-white/60 text-xs">Online</p>
              </div>
            </div>
            {/* Chat messages */}
            <div className="p-4 space-y-4 bg-gray-50">
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-ce-navy flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-medium">C</span>
                </div>
                <div className="bg-white px-4 py-2 rounded-lg border border-ce-border max-w-[80%]">
                  <p className="text-sm text-ce-text">
                    Hi! I&apos;m Clara. How can I help you today?
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <div className="bg-ce-teal text-white px-4 py-2 rounded-lg max-w-[80%]">
                  <p className="text-sm">What services do you offer?</p>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-ce-navy flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-medium">C</span>
                </div>
                <div className="bg-white px-4 py-2 rounded-lg border border-ce-border max-w-[80%]">
                  <p className="text-sm text-ce-text">
                    We offer dedicated developers, team augmentation, and full project
                    delivery. Would you like to know more about pricing?
                  </p>
                </div>
              </div>
            </div>
            {/* Suggestion chips */}
            <div className="p-4 bg-gray-50 border-t border-ce-border flex flex-wrap gap-2">
              <span className="px-3 py-1.5 text-xs font-medium text-ce-teal border border-ce-teal rounded-full">
                Tell me about pricing
              </span>
              <span className="px-3 py-1.5 text-xs font-medium text-ce-teal border border-ce-teal rounded-full">
                Book a call
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-ce-navy">
              Everything You Need to Delight Visitors
            </h2>
            <p className="mt-4 text-lg text-ce-text-muted max-w-2xl mx-auto">
              Clara comes packed with features to help you convert more visitors
              into customers.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-6 bg-ce-muted rounded-xl">
              <div className="w-12 h-12 bg-ce-lime rounded-lg flex items-center justify-center mb-4">
                <MessageSquare className="w-6 h-6 text-ce-navy" />
              </div>
              <h3 className="text-lg font-semibold text-ce-navy mb-2">
                Knowledge Base Chat
              </h3>
              <p className="text-ce-text-muted">
                Train Clara with your FAQ, docs, and transcripts. She answers
                questions accurately using your content.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 bg-ce-muted rounded-xl">
              <div className="w-12 h-12 bg-ce-lime rounded-lg flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-ce-navy" />
              </div>
              <h3 className="text-lg font-semibold text-ce-navy mb-2">
                Smart Suggestion Chips
              </h3>
              <p className="text-ce-text-muted">
                Strategic follow-up questions guide visitors toward booking a call
                or learning more about your services.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 bg-ce-muted rounded-xl">
              <div className="w-12 h-12 bg-ce-lime rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-ce-navy" />
              </div>
              <h3 className="text-lg font-semibold text-ce-navy mb-2">
                Instant Escalation
              </h3>
              <p className="text-ce-text-muted">
                When Clara detects buying intent, she suggests booking a call with
                your calendar link — no friction.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 bg-ce-muted rounded-xl">
              <div className="w-12 h-12 bg-ce-lime rounded-lg flex items-center justify-center mb-4">
                <BarChart3 className="w-6 h-6 text-ce-navy" />
              </div>
              <h3 className="text-lg font-semibold text-ce-navy mb-2">
                Gap Detection
              </h3>
              <p className="text-ce-text-muted">
                Clara flags questions she can&apos;t confidently answer. Review gaps
                and add new Q&A pairs to improve coverage.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 bg-ce-muted rounded-xl">
              <div className="w-12 h-12 bg-ce-lime rounded-lg flex items-center justify-center mb-4">
                <Code className="w-6 h-6 text-ce-navy" />
              </div>
              <h3 className="text-lg font-semibold text-ce-navy mb-2">
                Easy Embed
              </h3>
              <p className="text-ce-text-muted">
                Add a floating widget to your site with one line of code. Works
                everywhere — WordPress, Webflow, custom sites.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 bg-ce-muted rounded-xl">
              <div className="w-12 h-12 bg-ce-lime rounded-lg flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-ce-navy" />
              </div>
              <h3 className="text-lg font-semibold text-ce-navy mb-2">
                Bring Your Own Key
              </h3>
              <p className="text-ce-text-muted">
                Use your own OpenAI or Anthropic API key. Full control over costs
                and data. No middleman markup.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-ce-navy">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Live in 15 Minutes
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
              No complex setup. No developer needed. Just sign up and start chatting.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-ce-lime rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-ce-navy font-bold text-lg">1</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Add Your Knowledge
              </h3>
              <p className="text-white/70">
                Paste transcripts, import CSVs, or add Q&A pairs manually. Clara
                learns from your content.
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-ce-lime rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-ce-navy font-bold text-lg">2</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Customize & Test
              </h3>
              <p className="text-white/70">
                Set your brand colors, personality, and booking link. Test in the
                playground until it&apos;s perfect.
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-ce-lime rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-ce-navy font-bold text-lg">3</span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Embed & Go Live
              </h3>
              <p className="text-white/70">
                Copy one line of code to your website. Clara starts answering
                questions immediately.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-ce-muted rounded-2xl p-8 sm:p-12 text-center">
            <h2 className="text-3xl font-bold text-ce-navy mb-4">
              Free to Start. Scale as You Grow.
            </h2>
            <p className="text-lg text-ce-text-muted mb-8">
              Clara is free to use with your own API key. No per-message fees,
              no hidden costs. Just bring your OpenAI or Anthropic key.
            </p>
            <ul className="inline-flex flex-col items-start gap-3 mb-8 text-left">
              <li className="flex items-center gap-2 text-ce-text">
                <Check className="w-5 h-5 text-ce-teal flex-shrink-0" />
                Unlimited Q&A pairs
              </li>
              <li className="flex items-center gap-2 text-ce-text">
                <Check className="w-5 h-5 text-ce-teal flex-shrink-0" />
                Unlimited conversations
              </li>
              <li className="flex items-center gap-2 text-ce-text">
                <Check className="w-5 h-5 text-ce-teal flex-shrink-0" />
                Custom branding & personality
              </li>
              <li className="flex items-center gap-2 text-ce-text">
                <Check className="w-5 h-5 text-ce-teal flex-shrink-0" />
                Gap detection & analytics
              </li>
              <li className="flex items-center gap-2 text-ce-text">
                <Check className="w-5 h-5 text-ce-teal flex-shrink-0" />
                Embeddable widget
              </li>
            </ul>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-semibold text-ce-navy bg-ce-lime rounded-full hover:opacity-90 transition-opacity"
            >
              Create Your Chatbot
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 bg-ce-navy">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <Image
                src="/Clara-Logo-white-caps.svg"
                alt="Clara"
                width={100}
                height={30}
              />
            </div>
            <p className="text-white/60 text-sm">
              Built by{' '}
              <a
                href="https://cloudemployee.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ce-lime hover:text-white transition-colors"
              >
                Cloud Employee
              </a>
            </p>
            <div className="flex items-center gap-6 text-sm">
              <Link
                href="/login"
                className="text-white/60 hover:text-white transition-colors"
              >
                Log In
              </Link>
              <a
                href="https://github.com/cloudemployee/ce-chatbot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/60 hover:text-white transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
