// @polsia:user-owned — shared zod contract for private conversations.

import { z } from 'zod';

export const ConversationCreate = z.object({
  prompt: z.string().trim().min(1, 'Write a prompt first.').max(5000, 'Your prompt is too long.'),
});

export const ConversationItem = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  assistantStatus: z.literal('unavailable'),
  assistantContent: z.null(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ConversationList = z.object({
  conversations: z.array(ConversationItem),
});

export type ConversationCreate = z.infer<typeof ConversationCreate>;
export type ConversationItem = z.infer<typeof ConversationItem>;
export type ConversationList = z.infer<typeof ConversationList>;
