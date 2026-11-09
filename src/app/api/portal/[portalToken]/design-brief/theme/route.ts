export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';

const schema = z.object({
  options: z.array(z.object({
    title: z.string().describe('Short 2-4 word style name'),
    description: z.string().describe('2-3 sentence design direction for the operator'),
  })).length(3),
});

export async function POST(req: NextRequest, { params }: { params: { portalToken: string } }) {
  const event = await prisma.event.findFirst({ where: { portalToken: params.portalToken } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { theme, templateName, colorVariantName, fontPairingName } = await req.json();
  if (!theme?.trim()) return NextResponse.json({ error: 'Theme is required.' }, { status: 400 });

  const prompt = `You are a creative director for photo booth design. A client has described their event theme as: "${theme}".
They have selected the "${templateName}" layout${colorVariantName ? `, the "${colorVariantName}" color palette` : ''}${fontPairingName ? `, and the "${fontPairingName}" font pairing` : ''}.

Generate exactly 3 distinct design direction options for the operator to choose from. Each should interpret the theme differently — vary the mood, energy, and visual approach. Keep descriptions practical and actionable for a graphic designer.`;

  try {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY! });
    const result = await generateObject({
      model: google('gemini-2.0-flash'),
      schema,
      prompt,
    });
    return NextResponse.json(result.object);
  } catch {
    // Fallback to Claude
    const anthropic = createAnthropic();
    const result = await generateObject({
      model: anthropic('claude-haiku-4-5-20251001'),
      schema,
      prompt,
    });
    return NextResponse.json(result.object);
  }
}
