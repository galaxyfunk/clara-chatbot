'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Script from 'next/script';
import {
  MessageSquare,
  Sparkles,
  Zap,
  Shield,
  BarChart3,
  Code,
  ArrowRight,
  Check,
  Layout,
  Command,
} from 'lucide-react';

// Layout types for the hero preview
type LayoutType = 'classic' | 'side-whisper' | 'command-bar';

// ═══════════════════════════════════════════════════════════════════
// LAYOUT MOCKUP COMPONENTS
// ═══════════════════════════════════════════════════════════════════

function ClassicBubbleMockup() {
  return (
    <div className="relative w-full h-[320px] bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden">
      {/* Simulated website content */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-full bg-gray-300" />
          <div className="h-4 w-24 bg-gray-300 rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-3 w-3/4 bg-gray-300 rounded" />
          <div className="h-3 w-1/2 bg-gray-300 rounded" />
          <div className="h-3 w-2/3 bg-gray-300 rounded" />
        </div>
      </div>

      {/* Floating bubble trigger */}
      <div className="absolute bottom-4 right-4 w-14 h-14 rounded-full bg-[#2A7F7F] shadow-lg flex items-center justify-center cursor-pointer hover:scale-105 transition-transform">
        <MessageSquare className="w-6 h-6 text-white" />
      </div>

      {/* Chat window preview */}
      <div className="absolute bottom-20 right-4 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="bg-[#213D66] px-3 py-2 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#C5E84D] flex items-center justify-center">
            <span className="text-[#213D66] font-bold text-xs">C</span>
          </div>
          <span className="text-white text-sm font-medium">Clara</span>
        </div>
        <div className="p-3 bg-gray-50 space-y-2">
          <div className="flex gap-2">
            <div className="w-5 h-5 rounded-full bg-[#213D66] flex-shrink-0" />
            <div className="bg-white px-2 py-1 rounded text-xs text-gray-700 border">
              Hi! How can I help?
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SideWhisperMockup() {
  return (
    <div className="relative w-full h-[320px] bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden">
      {/* Simulated website content */}
      <div className="p-6 pr-32">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-full bg-gray-300" />
          <div className="h-4 w-24 bg-gray-300 rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-3 w-3/4 bg-gray-300 rounded" />
          <div className="h-3 w-1/2 bg-gray-300 rounded" />
          <div className="h-3 w-2/3 bg-gray-300 rounded" />
        </div>
      </div>

      {/* Side panel with frosted glass */}
      <div className="absolute top-0 right-0 bottom-0 w-48 bg-white/80 backdrop-blur-xl border-l border-white/50 shadow-[-12px_0_40px_rgba(33,61,102,0.1)]">
        {/* Gradient accent strip */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-[#C5E84D] via-[#2A7F7F] to-[#213D66]" />

        {/* Header */}
        <div className="p-3 border-b border-gray-200/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#213D66] flex items-center justify-center">
              <span className="text-white text-xs font-bold">C</span>
            </div>
            <div>
              <div className="text-sm font-semibold text-[#213D66]">Clara</div>
              <div className="text-[10px] text-[#2A7F7F]">Assistant</div>
            </div>
          </div>
        </div>

        {/* Message preview */}
        <div className="p-3">
          <div className="text-xs text-gray-600">
            Hi! How can I help you today?
          </div>
        </div>
      </div>

      {/* Trigger tab on edge */}
      <div className="absolute right-48 top-1/2 -translate-y-1/2 w-9 h-24 bg-white/85 backdrop-blur-lg rounded-l-xl shadow-lg flex flex-col items-center justify-center gap-2 border border-white/50 border-r-0">
        <div className="w-2 h-2 rounded-full bg-[#2A7F7F] shadow-[0_0_8px_rgba(42,127,127,0.4)]" />
        <span className="text-[8px] font-semibold text-[#213D66] [writing-mode:vertical-rl] rotate-180">ASK CLARA</span>
      </div>
    </div>
  );
}

function CommandBarMockup() {
  return (
    <div className="relative w-full h-[320px] bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden">
      {/* Simulated website content (dimmed) */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-full bg-gray-300" />
          <div className="h-4 w-24 bg-gray-300 rounded" />
        </div>
        <div className="space-y-3">
          <div className="h-3 w-3/4 bg-gray-300 rounded" />
          <div className="h-3 w-1/2 bg-gray-300 rounded" />
          <div className="h-3 w-2/3 bg-gray-300 rounded" />
        </div>
      </div>

      {/* Blurred backdrop overlay */}
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" />

      {/* Centered modal with frosted glass */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] bg-white/85 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 overflow-hidden">
        {/* Gradient accent strip top */}
        <div className="absolute top-0 left-4 right-4 h-[3px] bg-gradient-to-r from-[#C5E84D] via-[#2A7F7F] to-[#213D66] rounded-b" />

        {/* Header */}
        <div className="p-3 border-b border-gray-200/50 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#213D66] flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">C</span>
          </div>
          <span className="text-sm font-semibold text-[#213D66]">Clara</span>
          <span className="text-[10px] text-[#2A7F7F]">Assistant</span>
        </div>

        {/* Suggestion preview */}
        <div className="p-3 space-y-1">
          <div className="text-[10px] text-gray-500 uppercase font-semibold">Suggestions</div>
          <div className="text-xs text-gray-700 py-1 flex items-center gap-1">
            <MessageSquare className="w-3 h-3 text-[#2A7F7F] opacity-50" />
            What services do you offer?
          </div>
        </div>
      </div>

      {/* Pill trigger at bottom */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-2 bg-white/85 backdrop-blur-xl rounded-xl shadow-lg flex items-center gap-2 border border-white/50">
        <svg className="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <div className="w-1.5 h-1.5 rounded-full bg-[#2A7F7F] animate-pulse" />
        <span className="text-[10px] text-gray-400">Ask about...</span>
        <kbd className="text-[9px] bg-gray-100 px-1 py-0.5 rounded text-gray-400 border">⌘K</kbd>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════════════════════════════

export default function HomePage() {
  const [activeLayout, setActiveLayout] = useState<LayoutType>('side-whisper');

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
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-ce-muted to-white">
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
          <p className="mt-2 text-xl sm:text-2xl font-medium text-ce-navy/70">
            Styled Your Way
          </p>
          <p className="mt-6 text-lg sm:text-xl text-ce-text-muted max-w-2xl mx-auto">
            Choose from three beautiful layouts — classic bubble, sleek side whisper,
            or lightning-fast command bar. All with real frosted glass effects.
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
              href="#demo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 text-lg font-medium text-ce-navy border-2 border-ce-navy rounded-full hover:bg-ce-navy hover:text-white transition-colors"
            >
              Try the Demo
            </Link>
          </div>
        </div>

        {/* Layout Preview with Tabs */}
        <div className="mt-16 max-w-xl mx-auto">
          {/* Layout selector tabs */}
          <div className="flex justify-center gap-2 mb-6">
            {[
              { id: 'classic' as LayoutType, label: 'Classic Bubble' },
              { id: 'side-whisper' as LayoutType, label: 'Side Whisper', isNew: true },
              { id: 'command-bar' as LayoutType, label: 'Command Bar', isNew: true },
            ].map((layout) => (
              <button
                key={layout.id}
                onClick={() => setActiveLayout(layout.id)}
                className={`px-4 py-2 text-sm font-medium rounded-full transition-all flex items-center gap-1.5 ${
                  activeLayout === layout.id
                    ? 'bg-ce-navy text-white'
                    : 'bg-white text-ce-text hover:bg-ce-muted border border-ce-border'
                }`}
              >
                {layout.label}
                {layout.isNew && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-ce-lime text-ce-navy rounded">
                    NEW
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Layout mockup display */}
          <div className="bg-white rounded-2xl shadow-2xl border border-ce-border overflow-hidden p-4">
            {activeLayout === 'classic' && <ClassicBubbleMockup />}
            {activeLayout === 'side-whisper' && <SideWhisperMockup />}
            {activeLayout === 'command-bar' && <CommandBarMockup />}
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
            {/* Feature 1: Three Widget Styles */}
            <div className="p-6 bg-ce-muted rounded-xl">
              <div className="w-12 h-12 bg-ce-lime rounded-lg flex items-center justify-center mb-4">
                <Layout className="w-6 h-6 text-ce-navy" />
              </div>
              <h3 className="text-lg font-semibold text-ce-navy mb-2">
                Three Widget Styles
              </h3>
              <p className="text-ce-text-muted">
                Classic bubble, side whisper panel, or command bar. Pick the style
                that matches your brand.
              </p>
            </div>

            {/* Feature 2: Keyboard Shortcuts */}
            <div className="p-6 bg-ce-muted rounded-xl">
              <div className="w-12 h-12 bg-ce-lime rounded-lg flex items-center justify-center mb-4">
                <Command className="w-6 h-6 text-ce-navy" />
              </div>
              <h3 className="text-lg font-semibold text-ce-navy mb-2">
                Lightning Fast Access
              </h3>
              <p className="text-ce-text-muted">
                Power users love keyboard shortcuts. Press ⌘K to open Clara
                instantly — no clicking required.
              </p>
            </div>

            {/* Feature 3: Premium Design */}
            <div className="p-6 bg-ce-muted rounded-xl">
              <div className="w-12 h-12 bg-ce-lime rounded-lg flex items-center justify-center mb-4">
                <Sparkles className="w-6 h-6 text-ce-navy" />
              </div>
              <h3 className="text-lg font-semibold text-ce-navy mb-2">
                Premium Glass Design
              </h3>
              <p className="text-ce-text-muted">
                Real frosted glass effects for a native-app feel. No dated chat
                widgets here.
              </p>
            </div>

            {/* Feature 4 */}
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

            {/* Feature 5 */}
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

            {/* Feature 6 */}
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

            {/* Feature 7 */}
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

            {/* Feature 8 */}
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

            {/* Feature 9 - Streaming Responses */}
            <div className="p-6 bg-ce-muted rounded-xl">
              <div className="w-12 h-12 bg-ce-lime rounded-lg flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-ce-navy" />
              </div>
              <h3 className="text-lg font-semibold text-ce-navy mb-2">
                Real-Time Streaming
              </h3>
              <p className="text-ce-text-muted">
                Responses stream in word-by-word for a natural, conversational
                feel. No waiting for the full response.
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
                All three widget layouts
              </li>
              <li className="flex items-center gap-2 text-ce-text">
                <Check className="w-5 h-5 text-ce-teal flex-shrink-0" />
                Custom branding & personality
              </li>
              <li className="flex items-center gap-2 text-ce-text">
                <Check className="w-5 h-5 text-ce-teal flex-shrink-0" />
                Gap detection & analytics
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
