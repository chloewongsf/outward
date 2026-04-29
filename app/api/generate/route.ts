import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";

interface Recommendation {
  taste_summary: string;
  today_go: { title: string; description: string; why: string };
  today_listen: { title: string; description: string; why: string };
  today_read: { title: string; description: string; why: string };
  today_nudge: string;
}

type CardKey = "today_go" | "today_listen" | "today_read";

const CARD_LABEL: Record<CardKey, string> = {
  today_go:     "a specific place or thing to do",
  today_listen: "a specific album or artist",
  today_read:   "a specific book, essay, or article — with author",
};

const CARD_DESCRIPTION: Record<CardKey, string> = {
  today_go:     "2-3 sentences. Say why it's worth going. Be concrete — hours, neighborhood, what to actually do there.",
  today_listen: "2-3 sentences. Say what it sounds like and why it fits today — not why it 'speaks to their soul'.",
  today_read:   "2-3 sentences. Say what it's actually about and why it's worth their time today.",
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GEMINI_API_KEY is not set" }, { status: 500 });
  }

  const body = await request.json();
  const {
    favoriteThings, location, adjectives, mood, timezone, history,
    recentSuggestions, regenerateOnly,
  } = body;

  if (!favoriteThings || !location || !adjectives || !mood) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(apiKey.trim());
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const tz = typeof timezone === "string" ? timezone : "UTC";
  const today = new Date().toLocaleDateString("en-GB", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const localTime = new Date().toLocaleTimeString("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit",
  });

  const avoidSection =
    Array.isArray(recentSuggestions) && recentSuggestions.length > 0
      ? `\nDo NOT suggest any of these — they have already been suggested recently:\n${
          recentSuggestions.slice(0, 30).map((t: string) => `- ${t}`).join("\n")
        }`
      : "";

  const historySection =
    Array.isArray(history) && history.length > 0
      ? `\nThings they've done from past suggestions (avoid repeating, use to refine taste):\n${
          history.slice(0, 10).map((h: { type: string; title: string; note?: string }) =>
            `- [${h.type}] ${h.title}${h.note ? ` — "${h.note}"` : ""}`
          ).join("\n")
        }`
      : "";

  const context = `
You are a cultural recommendation engine with good taste and no interest in performing it.

Write like a well-read friend who gives real suggestions — not a lifestyle brand, not a wellness coach.
Be specific, understated, and direct. Never use words like: sanctuary, masterpiece, tapestry, surgical,
refined, curated, elevate, resonate, or any metaphor involving light, shadows, or curtains.
No Hallmark card language. No observations dressed up as wisdom.

Today is ${today} and the local time is ${localTime}. Factor in the season, the day of the week, the time of day,
and what is plausibly open or happening in ${location} right now. If you know of specific venues,
exhibitions, or events likely running in ${location} around this time of year, mention them by name.

Profile:
- Things they love: ${favoriteThings}
- Location: ${location}
- Self-description: ${adjectives}
- Today's mood: ${mood}
${historySection}${avoidSection}

IMPORTANT — on personalization vs. exploration:
Use their profile as a starting point, not a cage. The best suggestions are ones that feel right for
them but aren't things they'd have thought of themselves. Introduce adjacent ideas, unexpected angles,
or genuine discoveries they'd likely appreciate given who they are. Don't just reflect their taste back
at them — expand it slightly. Someone who loves Joan Didion doesn't need another Joan Didion book;
they might love László Krasznahorkai for adjacent reasons.

For the "why" field on each card: write one short, conversational sentence explaining the specific
connection to their profile. Reference something concrete — a thing they mentioned loving, their mood
today, their location, or how they describe themselves. Be direct and personal, not flattering.
Example: "You mentioned loving restrained environments, and this place has that same quality without
trying." Not: "This perfectly aligns with your aesthetic sensibilities."`.trim();

  const whyField = `"why": "One sentence. Explain the specific connection to their profile — reference something concrete they mentioned. Direct and personal, not complimentary."`;

  const prompt = regenerateOnly && regenerateOnly in CARD_LABEL
    ? `${context}

Return ONLY a valid JSON object with no markdown, no code fences, no extra text:

{
  "${regenerateOnly}": {
    "title": "${CARD_LABEL[regenerateOnly as CardKey]} in or near ${location} today",
    "description": "${CARD_DESCRIPTION[regenerateOnly as CardKey]}",
    ${whyField}
  }
}`
    : `${context}

Return ONLY a valid JSON object with no markdown formatting, no code fences, no extra text:

{
  "taste_summary": "One or two plain sentences describing their taste — specific, not flattering. Name actual references if useful.",
  "today_go": {
    "title": "A specific place or thing to do in or near ${location} today",
    "description": "2-3 sentences. Say why it's worth going. Be concrete — hours, neighborhood, what to actually do there.",
    ${whyField}
  },
  "today_listen": {
    "title": "A specific album or artist",
    "description": "2-3 sentences. Say what it sounds like and why it fits today.",
    ${whyField}
  },
  "today_read": {
    "title": "A specific book, essay, or article — with author",
    "description": "2-3 sentences. Say what it's actually about and why it's worth their time today.",
    ${whyField}
  },
  "today_nudge": "One sentence. Actionable, not observational. No metaphors. Something they could actually do today."
}`;

  const MAX_ATTEMPTS = 4;
  const RETRYABLE = [503, 429];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await model.generateContent(prompt.trim());
      const text = result.response.text();
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      const parsed: Partial<Recommendation> = JSON.parse(cleaned);
      return Response.json(parsed);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const isRetryable = status !== undefined && RETRYABLE.includes(status);

      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        console.error(`Gemini error (attempt ${attempt}):`, err);
        const message =
          status === 503 ? "Gemini is busy right now — try again in a moment."
          : status === 429 ? "Rate limit hit — try again in a few seconds."
          : "Failed to generate recommendations.";
        return Response.json({ error: message }, { status: status ?? 500 });
      }

      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }

  return Response.json({ error: "Failed to generate recommendations." }, { status: 500 });
}
