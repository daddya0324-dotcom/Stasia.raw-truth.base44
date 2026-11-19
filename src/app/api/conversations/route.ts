// @polsia:user-owned — owner-scoped private first-chat API.

import 'server-only';

import { NextResponse } from 'next/server';
import {
  ConversationCreate,
  ConversationItem,
  ConversationList,
} from '@/lib/contracts/conversations';
import { prisma } from '@/lib/db';
import { requireAuth, type SessionUser } from '@/lib/require-auth';

export const dynamic = 'force-dynamic';

function toConversationItem(conversation: {
  id: string;
  title: string;
  prompt: string;
  assistantStatus: string;
  assistantContent: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return ConversationItem.parse({
    id: conversation.id,
    title: conversation.title,
    prompt: conversation.prompt,
    assistantStatus: conversation.assistantStatus,
    assistantContent: conversation.assistantContent,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  });
}

async function getUser(request: Request): Promise<SessionUser | Response> {
  try {
    return await requireAuth(request);
  } catch (response) {
    return response as Response;
  }
}

export async function GET(request: Request) {
  const user = await getUser(request);
  if (user instanceof Response) return user;

  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(
    ConversationList.parse({
      conversations: conversations.map(toConversationItem),
    }),
  );
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (user instanceof Response) return user;

  const body = await request.json().catch(() => null);
  const parsed = ConversationCreate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        errors: {
          prompt: parsed.error.flatten().fieldErrors.prompt?.[0] ?? 'Write a prompt first.',
        },
      },
      { status: 400 },
    );
  }

  const prompt = parsed.data.prompt;
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: prompt.length > 72 ? `${prompt.slice(0, 69)}…` : prompt,
      prompt,
      assistantStatus: 'unavailable',
      assistantContent: null,
    },
  });

  return NextResponse.json(toConversationItem(conversation), { status: 201 });
}
