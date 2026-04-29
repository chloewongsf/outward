"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Mood = "calm" | "curious" | "social" | "reflective";
const MOODS: Mood[] = ["calm", "curious", "social", "reflective"];
const PROFILE_KEY = "outward_profile";
const DAILY_KEY   = "outward_daily";
const SEEN_KEY    = "outward_seen";

function getSeenTitles(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"); } catch { return []; }
}
function saveSeenTitles(results: { today_go: { title: string }; today_listen: { title: string }; today_read: { title: string } }) {
  const fresh = [results.today_go.title, results.today_listen.title, results.today_read.title];
  const updated = [...fresh, ...getSeenTitles()].slice(0, 30);
  localStorage.setItem(SEEN_KEY, JSON.stringify(updated));
}

type Profile = {
  favoriteThings: string;
  location: string;
  adjectives: string;
  history?: unknown[];
};

type DailyCache = {
  date: string;
  results: unknown;
  submission: unknown;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

type Mode = "loading" | "onboarding" | "generating";

export default function Home() {
  const router = useRouter();
  const [mode, setMode]         = useState<Mode>("loading");
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState<string | null>(null);

  const [form, setForm] = useState({
    favoriteThings: "",
    location: "",
    adjectives: "",
    mood: "calm" as Mood,
  });

  useEffect(() => {
    const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

    try {
      const savedProfile = localStorage.getItem(PROFILE_KEY);
      if (!savedProfile) { setMode("onboarding"); return; }

      const profile: Profile = JSON.parse(savedProfile);

      const cached = localStorage.getItem(DAILY_KEY);
      if (cached) {
        const daily: DailyCache = JSON.parse(cached);
        if (daily.date === today) {
          sessionStorage.setItem("outward_results",         JSON.stringify(daily.results));
          sessionStorage.setItem("outward_last_submission", JSON.stringify(daily.submission));
          router.replace("/results");
          return;
        }
      }

      setMode("generating");
      autoGenerate(profile, tz, today);
    } catch {
      setMode("onboarding");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode !== "generating") return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => (p < 85 ? p + 1.5 : p));
    }, 200);
    return () => clearInterval(interval);
  }, [mode]);

  async function autoGenerate(profile: Profile, tz: string, today: string) {
    const submission = {
      favoriteThings:    profile.favoriteThings,
      location:          profile.location,
      adjectives:        profile.adjectives,
      history:           profile.history ?? [],
      mood:              "calm" as Mood,
      timezone:          tz,
      recentSuggestions: getSeenTitles(),
    };

    try {
      const res = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(submission),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }

      const results = await res.json();
      saveSeenTitles(results);
      localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, results, submission }));
      sessionStorage.setItem("outward_results",         JSON.stringify(results));
      sessionStorage.setItem("outward_last_submission", JSON.stringify(submission));

      setProgress(100);
      await new Promise((r) => setTimeout(r, 300));
      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setMode("onboarding");
    }
  }

  // ── Onboarding submit ──────────────────────────────────────────────────────

  const [submitting, setSubmitting]     = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [submitDone, setSubmitDone]     = useState(false);

  useEffect(() => {
    if (!submitting) return;
    setSubmitProgress(0);
    const interval = setInterval(() => {
      setSubmitProgress((p) => (p < 85 ? p + 1.5 : p));
    }, 200);
    return () => clearInterval(interval);
  }, [submitting]);

  useEffect(() => {
    if (submitDone) setSubmitProgress(100);
  }, [submitDone]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const tz    = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });

    const profile: Profile = {
      favoriteThings: form.favoriteThings,
      location:       form.location,
      adjectives:     form.adjectives,
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));

    const submission = { ...form, timezone: tz, recentSuggestions: getSeenTitles() };

    try {
      const res = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(submission),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Something went wrong");
      }

      const results = await res.json();
      saveSeenTitles(results);
      localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, results, submission }));
      sessionStorage.setItem("outward_results",         JSON.stringify(results));
      sessionStorage.setItem("outward_last_submission", JSON.stringify(submission));

      setSubmitDone(true);
      await new Promise((r) => setTimeout(r, 350));
      router.push("/results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Shared styles ──────────────────────────────────────────────────────────

  const bg = "linear-gradient(160deg, #FDF8F2 0%, #F5E2DF 45%, #E8D8EE 100%)";

  // ── Auto-generate / loading screen ────────────────────────────────────────

  if (mode === "loading" || mode === "generating") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6"
        style={{ background: bg }}>
        {mode === "generating" && (
          <div className="fixed top-0 left-0 right-0 h-[2px] bg-white/40 z-50">
            <div
              className="h-full bg-[var(--color-ink)] transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <div className="text-center">
          <h1
            className="text-6xl sm:text-7xl lg:text-8xl leading-none mb-6"
            style={{ fontFamily: "var(--font-serif)", color: "rgba(180, 130, 140, 0.55)" }}
          >
            {greeting().split(" ").map((w, i) => <span key={i} className="block">{w}</span>)}
          </h1>
          {mode === "generating" && !error && (
            <p className="text-[10px] tracking-[0.2em] text-[rgba(120,90,80,0.5)] uppercase">
              Finding your day…
            </p>
          )}
          {error && (
            <div className="mt-6 space-y-3">
              <p className="text-xs text-red-400">{error}</p>
              <button
                onClick={() => setMode("onboarding")}
                className="text-[10px] tracking-[0.18em] text-[var(--color-muted)] uppercase underline underline-offset-2"
              >
                Edit your profile
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Onboarding form ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ background: bg }}>
      {(submitting || submitDone) && (
        <div className="fixed top-0 left-0 right-0 h-[2px] bg-white/40 z-50">
          <div
            className="h-full bg-[var(--color-ink)]"
            style={{
              width: `${submitProgress}%`,
              transition: submitDone ? "width 0.3s ease-out" : "width 0.2s linear",
            }}
          />
        </div>
      )}

      <main className="max-w-md sm:max-w-xl lg:max-w-2xl mx-auto px-6 sm:px-10 lg:px-16 pt-16 sm:pt-20 lg:pt-28 pb-16">
        <div className="mb-10 lg:mb-14">
          <p className="text-[10px] lg:text-xs tracking-[0.2em] text-[rgba(120,90,80,0.5)] uppercase mb-3">
            Outward
          </p>
          <h1
            className="text-6xl sm:text-7xl lg:text-8xl leading-none"
            style={{ fontFamily: "var(--font-serif)", color: "rgba(180, 130, 140, 0.55)" }}
          >
            {greeting().split(" ").map((w, i) => <span key={i} className="block">{w}</span>)}
          </h1>
        </div>

        <div className="bg-white/90 rounded-3xl shadow-sm p-7 sm:p-8 lg:p-12">
          <p className="text-xs lg:text-sm text-[var(--color-muted)] leading-relaxed mb-7 lg:mb-9">
            Tell us about yourself once — we&apos;ll handle the rest every morning.
          </p>

          <form onSubmit={handleSubmit} className="space-y-7 lg:space-y-9">
            <div>
              <label className="block text-[10px] lg:text-xs tracking-[0.18em] text-[var(--color-warm)] uppercase mb-2.5 lg:mb-3">
                Things you love
              </label>
              <textarea
                rows={2}
                placeholder="Le Mary Celeste, Joan Didion, Porto Venere"
                value={form.favoriteThings}
                onChange={(e) => setForm({ ...form, favoriteThings: e.target.value })}
                required
                className="w-full bg-transparent text-[var(--color-ink)] placeholder:text-stone-300 text-sm lg:text-base leading-relaxed border-b border-stone-200 focus:border-[var(--color-ink)] focus:outline-none pb-2 resize-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] lg:text-xs tracking-[0.18em] text-[var(--color-warm)] uppercase mb-2.5 lg:mb-3">
                Where you are
              </label>
              <input
                type="text"
                placeholder="Paris"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                required
                className="w-full bg-transparent text-[var(--color-ink)] placeholder:text-stone-300 text-sm lg:text-base border-b border-stone-200 focus:border-[var(--color-ink)] focus:outline-none pb-2 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] lg:text-xs tracking-[0.18em] text-[var(--color-warm)] uppercase mb-2.5 lg:mb-3">
                How you&apos;d describe yourself
              </label>
              <input
                type="text"
                placeholder="introverted, restrained, design-conscious"
                value={form.adjectives}
                onChange={(e) => setForm({ ...form, adjectives: e.target.value })}
                required
                className="w-full bg-transparent text-[var(--color-ink)] placeholder:text-stone-300 text-sm lg:text-base border-b border-stone-200 focus:border-[var(--color-ink)] focus:outline-none pb-2 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] lg:text-xs tracking-[0.18em] text-[var(--color-warm)] uppercase mb-3">
                Today&apos;s mood
              </label>
              <div className="flex gap-2 flex-wrap">
                {MOODS.map((mood) => (
                  <button
                    key={mood}
                    type="button"
                    onClick={() => setForm({ ...form, mood })}
                    className={`px-4 py-1.5 lg:px-5 lg:py-2 rounded-full text-xs lg:text-sm border transition-colors capitalize ${
                      form.mood === mood
                        ? "bg-[var(--color-ink)] text-white border-[var(--color-ink)]"
                        : "text-[var(--color-muted)] border-stone-200 hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    {mood}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 lg:py-4 text-xs lg:text-sm tracking-[0.15em] uppercase rounded-2xl bg-[var(--color-ink)] text-white hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {submitting ? "Generating…" : "Get My Daily Suggestions"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
