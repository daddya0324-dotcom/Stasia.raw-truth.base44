// @polsia:user-owned

import { describe, expect, it } from 'vitest';
import { ConversationCreate, ConversationItem, ConversationList } from '@/lib/contracts/conversations';

describe('private conversation contracts', () => {
  it('accepts a prompt and the explicit unavailable assistant state', () => {
    const created = ConversationCreate.parse({ prompt: '  Help me plan my weekend.  ' });
    expect(created.prompt).toBe('Help me plan my weekend.');

    const item = ConversationItem.parse({
      id: 'conversation-1',
      title: 'Help me plan my weekend.',
      prompt: created.prompt,
      assistantStatus: 'unavailable',
      assistantContent: null,
      createdAt: '2026-10-17T12:00:00.000Z',
      updatedAt: '2026-10-17T12:00:00.000Z',
    });
    expect(item.assistantStatus).toBe('unavailable');
    expect(item.assistantContent).toBeNull();
    expect(ConversationList.parse({ conversations: [item] }).conversations).toHaveLength(1);
  });

  it('rejects an empty prompt and any fabricated assistant response', () => {
    expect(ConversationCreate.safeParse({ prompt: '   ' }).success).toBe(false);
    expect(
      ConversationItem.safeParse({
        id: 'conversation-1',
        title: 'A prompt',
        prompt: 'A prompt',
        assistantStatus: 'ready',
        assistantContent: 'An invented answer',
        createdAt: '2026-10-17T12:00:00.000Z',
        updatedAt: '2026-10-17T12:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});
