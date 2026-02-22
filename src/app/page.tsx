import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ce-muted">
      <div className="text-center">
        <div className="mb-6 flex justify-center">
          <div className="rounded-2xl bg-ce-navy p-6">
            <Image
              src="/Clara-Logo-white-caps.svg"
              alt="Clara"
              width={160}
              height={48}
              priority
            />
          </div>
        </div>
        <p className="mt-4 text-lg text-ce-text-muted">
          Your AI-Powered Chatbot, Built in Minutes
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block rounded-full bg-ce-lime px-8 py-3 font-semibold text-ce-navy transition hover:opacity-90"
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}
