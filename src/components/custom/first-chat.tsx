// @polsia:user-owned — client island for the private first-chat journey.

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import {
  type ConversationItem as Conversation,
  ConversationCreate,
  ConversationItem,
  ConversationList,
} from '@/lib/contracts/conversations';

type LoadState = 'loading' | 'ready' | 'signed-out' | 'error';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
}

export function FirstChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/api/conversations', { credentials: 'include', schema: ConversationList })
      .then((data) => {
        if (!active) return;
        setConversations(data.conversations);
        setSelectedId(data.conversations[0]?.id ?? null);
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (!active) return;
        const status =
          error instanceof Error && error.cause && typeof error.cause === 'object'
            ? (error.cause as { error?: string }).error
            : undefined;
        setLoadState(status === 'Unauthorized' ? 'signed-out' : 'error');
      });

    return () => {
      active = false;
    };
  }, []);

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null;

  async function saveConversation() {
    const parsed = ConversationCreate.safeParse({ prompt });
    if (!parsed.success) {
      toast.error(parsed.error.flatten().fieldErrors.prompt?.[0] ?? 'Write a prompt first.');
      return;
    }

    setIsSaving(true);
    try {
      const conversation = await apiFetch('/api/conversations', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(parsed.data),
        schema: ConversationItem,
      });
      setConversations((current) => [conversation, ...current]);
      setSelectedId(conversation.id);
      setPrompt('');
      toast.success('Your private conversation was saved.');
    } catch {
      toast.error('Could not save your conversation. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  if (loadState === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading your private conversations…</p>;
  }

  if (loadState === 'signed-out') {
    return (
      <Card className="border-border/70 bg-card/90">
        <CardHeader>
          <CardTitle>Sign in to your private chat</CardTitle>
          <CardDescription>
            Your saved conversations are only available to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/login">Sign in to continue</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loadState === 'error') {
    return (
      <p className="text-sm text-destructive">Your conversations are temporarily unavailable.</p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <Card className="h-fit border-border/70 bg-card/90">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Your conversations</CardTitle>
          <CardDescription>Private to this account.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
                className={`w-full min-w-0 justify-start overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  conversation.id === selectedId
                    ? 'border-primary bg-accent text-accent-foreground'
                    : 'border-border/60 hover:bg-muted'
                }`}
              >
                <span className="block max-w-full truncate font-medium">{conversation.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {formatDate(conversation.updatedAt)}
                </span>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="border-border/70 bg-card/90">
          <CardHeader>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              First chat
            </p>
            <CardTitle>What would be helpful today?</CardTitle>
            <CardDescription>
              Write one question, plan, or small task. It will be saved privately to your account.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Textarea
              aria-label="Your prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="For example: Help me make a gentle plan for Saturday."
              rows={5}
              maxLength={5000}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Your prompt stays private to this account.
              </p>
              <Button type="button" onClick={saveConversation} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save conversation'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {selected ? (
          <Card className="border-border/70 bg-card/90" data-testid="saved-conversation">
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-lg">{selected.title}</CardTitle>
                <CardDescription>Saved {formatDate(selected.updatedAt)}</CardDescription>
              </div>
              <Badge variant="outline">Private</Badge>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="rounded-xl bg-muted/60 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  You
                </p>
                <p className="whitespace-pre-wrap text-sm leading-7">{selected.prompt}</p>
              </div>
              <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Dayweft assistant
                </p>
                <p className="text-sm leading-7 text-foreground">
                  The assistant is not available yet. Your prompt is saved, and no answer was
                  generated.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed border-border/70 bg-card/70">
            <CardContent className="py-10 text-center">
              <p className="font-medium">Your first conversation will appear here.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Save a prompt above to keep it with your account.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
