// @polsia:user-owned — private first-chat page.

import type { Metadata } from 'next';
import Link from 'next/link';
import { FirstChat } from '@/components/custom/first-chat';

export const metadata: Metadata = {
  title: 'First chat',
  description: 'Start a private Dayweft conversation and keep it with your account.',
};

export default function ChatPage() {
  return (
    <main className="min-h-dvh bg-[var(--background)] px-gutter py-12 md:py-20">
      <div className="mx-auto grid max-w-5xl gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              A private place to begin
            </p>
            <h1 className="mt-3 text-h1 text-foreground">Start with what is on your mind.</h1>
            <p className="mt-4 max-w-xl text-body-lg text-muted-foreground">
              Your first prompt is saved to your personal account, with no workspace or membership
              to manage.
            </p>
          </div>
          <Link
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            href="/profile"
          >
            Back to profile
          </Link>
        </div>
        <FirstChat />
      </div>
    </main>
  );
}
