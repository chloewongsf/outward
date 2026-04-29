"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { getSkyGradient } from "../lib/sky";

interface Recommendation {
  taste_summary: string;
  today_go: { title: string; description: string; why?: string };
  today_listen: { title: string; description: string; why?: string };
  today_read: { title: string; description: string; why?: string };
  today_nudge: string;
}

type Mood = "calm" | "curious" | "social" | "reflective";
const MOODS: Mood[] = ["calm", "curious", "social", "reflective"];
const PROFILE_KEY = "outward_profile";

type HistoryEntry = {
  date: string;
  type: "go" | "listen" | "read";
  title: string;
  note?: string;
};

type Profile = {
  favoriteThings: string;
  location: string;
  adjectives: string;
  history?: HistoryEntry[];
};

type Submission = Profile & { mood: Mood; timezone?: string };

const SECTIONS: {
  key: "today_go" | "today_listen" | "today_read";
  label: string;
  type: "go" | "listen" | "read";
  span: string;
}[] = [
  { key: "today_go",     label: "Today — Go",     type: "go",     span: ""              },
  { key: "today_listen", label: "Today — Listen", type: "listen", span: ""              },
  { key: "today_read",   label: "Today — Read",   type: "read",   span: "lg:col-span-2" },
];

const containerVariants = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
  exit:   { transition: { staggerChildren: 0.06, staggerDirection: -1 as const } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
  exit:   { opacity: 0, y: -12, transition: { duration: 0.25, ease: "easeIn" as const } },
};

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 280 : -280, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 320, damping: 32 } },
  exit:  (dir: number) => ({ x: dir < 0 ? 280 : -280, opacity: 0, transition: { duration: 0.2 } }),
};

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

export default function ResultsPage() {
  const router = useRouter();
  const [data, setData]             = useState<Recommendation | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [profile, setProfile]       = useState<Profile | null>(null);
  const [editing, setEditing]       = useState(false);
  const [draft, setDraft]           = useState<Profile>({ favoriteThings: "", location: "", adjectives: "" });
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [animKey, setAnimKey]       = useState(0);
  const [dateline, setDateline]     = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [added, setAdded]           = useState<Set<string>>(new Set());
  const [cardLoading, setCardLoading]   = useState<string | null>(null);
  const [bg, setBg]                 = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem("outward_results");
    if (!stored) { router.replace("/"); return; }
    try { setData(JSON.parse(stored)); }
    catch { router.replace("/"); return; }

    try {
      const sub = sessionStorage.getItem("outward_last_submission");
      if (sub) setSubmission(JSON.parse(sub));
    } catch { /* ignore */ }

    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved) {
        const p: Profile = JSON.parse(saved);
        setProfile(p);
        setDraft({ favoriteThings: p.favoriteThings, location: p.location, adjectives: p.adjectives });
      }
    } catch { /* ignore */ }
  }, [router]);

  useEffect(() => {
    const tz = submission?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const update = () => {
      const now  = new Date();
      const time = now.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
      const date = now.toLocaleDateString("en-GB",  { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
      setDateline(`${date} · ${time}`);
    };
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [submission?.timezone]);

  function openFeedback(key: string) {
    setFeedbackOpen(key);
    setFeedbackNote("");
  }

  function addToProfile(type: "go" | "listen" | "read", title: string) {
    const entry: HistoryEntry = {
      date:  new Date().toISOString().split("T")[0],
      type,
      title,
      note:  feedbackNote.trim() || undefined,
    };
    const saved = localStorage.getItem(PROFILE_KEY);
    const current: Profile = saved ? JSON.parse(saved) : { favoriteThings: "", location: "", adjectives: "" };
    const updated = { ...current, history: [entry, ...(current.history ?? [])].slice(0, 20) };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
    setProfile(updated);
    setAdded((prev) => new Set(prev).add(type));
    setFeedbackOpen(null);
    setFeedbackNote("");
  }

  async function regenerate(mood: Mood) {
    if (!submission) return;
    setRegenerating(true);
    setError(null);

    const savedProfile = localStorage.getItem(PROFILE_KEY);
    const profileData: Profile = savedProfile ? JSON.parse(savedProfile) : {};
    const next: Submission = { ...submission, ...profileData, mood };
    setSubmission(next);
    sessionStorage.setItem("outward_last_submission", JSON.stringify(next));

    try {
      const res = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(next),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Something went wrong");
      }
      const d = await res.json();
      const tz    = next.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      localStorage.setItem("outward_daily", JSON.stringify({ date: today, results: d, submission: next }));
      sessionStorage.setItem("outward_results", JSON.stringify(d));
      setData(d);
      setAdded(new Set());
      setAnimKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRegenerating(false);
    }
  }

  async function regenerateCard(type: "go" | "listen" | "read") {
    if (!submission || !data) return;
    setCardLoading(type);

    try {
      const seenRaw = localStorage.getItem("outward_seen");
      const seen: string[] = seenRaw ? JSON.parse(seenRaw) : [];
      const otherTitles = SECTIONS.filter((s) => s.type !== type).map((s) => data[s.key].title);

      const res = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...submission,
          recentSuggestions: [...otherTitles, ...seen],
          regenerateOnly: `today_${type}`,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Something went wrong");
      }
      const d = await res.json();
      const updated = { ...data, [`today_${type}`]: d[`today_${type}`] };

      const tz    = submission.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: tz });
      localStorage.setItem("outward_daily", JSON.stringify({ date: today, results: updated, submission }));
      sessionStorage.setItem("outward_results", JSON.stringify(updated));

      const newSeen = [d[`today_${type}`].title, ...seen].slice(0, 30);
      localStorage.setItem("outward_seen", JSON.stringify(newSeen));

      setData(updated);
    } catch {
      // fail silently — card stays as-is
    } finally {
      setCardLoading(null);
    }
  }

  function saveProfile() {
    const saved = localStorage.getItem(PROFILE_KEY);
    const current: Profile = saved ? JSON.parse(saved) : {};
    const updated = { ...current, ...draft };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
    setProfile(updated);
    if (submission) setSubmission({ ...submission, ...draft });
    setEditing(false);
  }

  useEffect(() => {
    setBg(getSkyGradient());
    const interval = setInterval(() => setBg(getSkyGradient()), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return null;
  const feedbackProps = { added, feedbackOpen, feedbackNote, setFeedbackNote, openFeedback, addToProfile, setFeedbackOpen, cardLoading, regenerateCard };

  return (
    <div className="min-h-screen" style={{ background: bg, transition: "background 90s linear" }}>
      <main className="max-w-md sm:max-w-xl lg:max-w-6xl mx-auto px-6 sm:px-10 lg:px-14 xl:px-20 pt-12 sm:pt-16 lg:pt-20 pb-16 lg:pb-24">

        {/* Nav + dateline */}
        <div className="flex items-center justify-between mb-8 lg:mb-12">
          <Link
            href="/"
            className="text-[10px] lg:text-sm tracking-[0.18em] text-[rgba(120,90,80,0.6)] hover:text-[var(--color-ink)] uppercase transition-colors"
          >
            ← Outward
          </Link>
          {dateline && (
            <p className="text-[10px] lg:text-sm tracking-[0.1em] text-[rgba(120,90,80,0.5)] tabular-nums">
              {dateline}
            </p>
          )}
        </div>

        {/* Greeting */}
        <div className="mb-8 lg:mb-10">
          <h1
            className="text-5xl sm:text-6xl lg:text-6xl leading-tight"
            style={{ fontFamily: "var(--font-serif)", color: "rgba(180, 130, 140, 0.55)" }}
          >
            {greeting().split(" ").map((w, i) => (
              <span key={i} className="block">{w}</span>
            ))}
          </h1>
          <p className="text-xs lg:text-sm tracking-[0.12em] text-[var(--color-muted)] mt-4 uppercase">
            Here&apos;s your day
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={animKey}
            variants={containerVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-5"
          >
            {/* Taste summary */}
            <motion.div
              variants={cardVariants}
              whileHover={{ y: -4, boxShadow: "0 16px 40px rgba(160,120,100,0.11)" }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="bg-white/90 rounded-3xl shadow-sm p-6 sm:p-8 lg:p-8 lg:col-span-2"
            >
              <p className="text-[10px] lg:text-sm tracking-[0.18em] text-[var(--color-warm)] uppercase mb-3 lg:mb-4">
                Your taste
              </p>
              <p
                className="text-lg sm:text-xl lg:text-xl leading-relaxed text-[var(--color-ink)]"
                style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 300 }}
              >
                {data.taste_summary}
              </p>
            </motion.div>

            {/* Mobile-only swipeable carousel */}
            <motion.div variants={cardVariants} className="lg:hidden">
              <MobileCarousel
                sections={SECTIONS}
                data={data}
                location={submission?.location}
                {...feedbackProps}
              />
            </motion.div>

            {/* Desktop-only individual cards */}
            {SECTIONS.map(({ key, label, type, span }) => (
              <motion.div
                key={key}
                variants={cardVariants}
                whileHover={{ y: -4, boxShadow: "0 16px 40px rgba(160,120,100,0.11)" }}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
                className={`hidden lg:block bg-white/90 rounded-3xl shadow-sm p-6 sm:p-8 lg:p-8${span ? ` ${span}` : ""}`}
              >
                <CardContent
                  label={label}
                  title={data[key].title}
                  description={data[key].description}
                  why={data[key].why}
                  type={type}
                  location={submission?.location}
                  {...feedbackProps}
                />
              </motion.div>
            ))}

            {/* Nudge card */}
            <motion.div
              variants={cardVariants}
              whileHover={{ y: -4, boxShadow: "0 16px 40px rgba(35,31,24,0.22)" }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="bg-[var(--color-ink)] rounded-3xl shadow-sm p-6 sm:p-8 lg:p-8 lg:col-span-2"
            >
              <p className="text-[10px] lg:text-sm tracking-[0.18em] text-white/40 uppercase mb-3 lg:mb-4">
                Today&apos;s nudge
              </p>
              <p
                className="text-base sm:text-lg lg:text-lg text-white leading-relaxed"
                style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}
              >
                {data.today_nudge}
              </p>
            </motion.div>
          </motion.div>
        </AnimatePresence>

        {/* Not feeling it + Profile — side by side on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-5 mt-3 lg:mt-5">

          {submission && (
            <motion.div
              whileHover={{ y: -4, boxShadow: "0 16px 40px rgba(160,120,100,0.11)" }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="bg-white/90 rounded-3xl shadow-sm p-6 sm:p-8 lg:p-8"
            >
              <p
                className="text-sm lg:text-base text-[var(--color-ink)] mb-1"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Not feeling these?
              </p>
              <p className="text-xs lg:text-sm text-[var(--color-muted)] mb-5 lg:mb-6">
                Pick a different mood or just shake it up.
              </p>
              <div className="flex gap-2 flex-wrap mb-5 lg:mb-6">
                {MOODS.map((mood) => (
                  <motion.button
                    key={mood}
                    type="button"
                    onClick={() => setSubmission({ ...submission, mood })}
                    whileTap={{ scale: 0.93 }}
                    className={`px-4 py-1.5 lg:px-5 lg:py-2 rounded-full text-xs lg:text-sm border transition-colors capitalize ${
                      submission.mood === mood
                        ? "bg-[var(--color-ink)] text-white border-[var(--color-ink)]"
                        : "text-[var(--color-muted)] border-stone-200 hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    {mood}
                  </motion.button>
                ))}
              </div>
              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
              <motion.button
                onClick={() => regenerate(submission.mood)}
                disabled={regenerating}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3.5 lg:py-4 text-xs lg:text-sm tracking-[0.15em] uppercase rounded-2xl bg-[var(--color-ink)] text-white hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {regenerating ? "Finding something else…" : "Give me something different"}
              </motion.button>
            </motion.div>
          )}

          {/* Profile */}
          {profile && (
            <motion.div
              whileHover={{ y: -4, boxShadow: "0 16px 40px rgba(160,120,100,0.11)" }}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
              className="bg-white/90 rounded-3xl shadow-sm p-6 sm:p-8 lg:p-8"
            >
              <div className="flex items-center justify-between mb-5 lg:mb-6">
                <p className="text-[10px] lg:text-sm tracking-[0.18em] text-[var(--color-muted)] uppercase">
                  Your profile
                </p>
                {!editing ? (
                  <motion.button
                    onClick={() => setEditing(true)}
                    whileTap={{ scale: 0.95 }}
                    className="text-[10px] lg:text-sm tracking-[0.18em] text-[var(--color-muted)] hover:text-[var(--color-ink)] uppercase transition-colors underline underline-offset-2"
                  >
                    Edit
                  </motion.button>
                ) : (
                  <div className="flex gap-4">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setDraft({ favoriteThings: profile.favoriteThings, location: profile.location, adjectives: profile.adjectives });
                        setEditing(false);
                      }}
                      className="text-[10px] lg:text-sm tracking-[0.18em] text-[var(--color-muted)] uppercase"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={saveProfile}
                      className="text-[10px] lg:text-sm tracking-[0.18em] text-[var(--color-ink)] uppercase underline underline-offset-2"
                    >
                      Save
                    </motion.button>
                  </div>
                )}
              </div>

              {!editing ? (
                <div className="space-y-3 lg:space-y-4">
                  <ProfileRow label="Loves"    value={profile.favoriteThings} />
                  <ProfileRow label="Location" value={profile.location} />
                  <ProfileRow label="Self"     value={profile.adjectives} />
                  {profile.history && profile.history.length > 0 && (
                    <div className="pt-4 border-t border-stone-100 space-y-2 lg:space-y-3">
                      <p className="text-[10px] lg:text-sm tracking-[0.16em] text-[var(--color-muted)] uppercase mb-3">
                        Past activity
                      </p>
                      {profile.history.slice(0, 5).map((h, i) => (
                        <div key={i} className="flex gap-3 items-baseline">
                          <span className="text-[10px] lg:text-sm tracking-widest text-[var(--color-muted)] uppercase w-10 shrink-0">{h.type}</span>
                          <span className="text-xs lg:text-sm text-[var(--color-ink)]">{h.title}</span>
                          {h.note && <span className="text-xs lg:text-sm text-[var(--color-muted)] italic truncate">— {h.note}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6 lg:space-y-8">
                  <EditField label="Things you love"             value={draft.favoriteThings} onChange={(v) => setDraft({ ...draft, favoriteThings: v })} />
                  <EditField label="Where you are"               value={draft.location}       onChange={(v) => setDraft({ ...draft, location: v })} />
                  <EditField label="How you'd describe yourself" value={draft.adjectives}      onChange={(v) => setDraft({ ...draft, adjectives: v })} />
                  <p className="text-[10px] lg:text-sm text-[var(--color-muted)] leading-relaxed">
                    Hit &ldquo;Give me something different&rdquo; above to apply changes.
                  </p>
                </div>
              )}
            </motion.div>
          )}

        </div>

      </main>
    </div>
  );
}

// ── Shared card content ────────────────────────────────────────────────────────

type FeedbackProps = {
  added: Set<string>;
  feedbackOpen: string | null;
  feedbackNote: string;
  setFeedbackNote: (v: string) => void;
  openFeedback: (key: string) => void;
  addToProfile: (type: "go" | "listen" | "read", title: string) => void;
  setFeedbackOpen: (v: string | null) => void;
  cardLoading: string | null;
  regenerateCard: (type: "go" | "listen" | "read") => void;
};

function CardContent({
  label, title, description, why, type, location,
  added, feedbackOpen, feedbackNote, setFeedbackNote, openFeedback, addToProfile, setFeedbackOpen,
  cardLoading, regenerateCard,
}: {
  label: string;
  title: string;
  description: string;
  why?: string;
  type: "go" | "listen" | "read";
  location?: string;
} & FeedbackProps) {
  const isLoading = cardLoading === type;

  return (
    <>
      <div className="flex items-center justify-between mb-3 lg:mb-4">
        <p className="text-[10px] lg:text-sm tracking-[0.18em] text-[var(--color-warm)] uppercase">
          {label}
        </p>
        <motion.button
          onClick={() => regenerateCard(type)}
          disabled={!!cardLoading}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          className={`flex items-center gap-1.5 text-[10px] lg:text-xs tracking-[0.12em] uppercase border rounded-full px-3 py-1 transition-colors ${
            isLoading
              ? "border-[var(--color-ink)] text-[var(--color-ink)] opacity-60"
              : "border-stone-300 text-[var(--color-muted)] hover:border-[var(--color-ink)] hover:text-[var(--color-ink)]"
          } disabled:cursor-not-allowed`}
          title="Try a different suggestion"
        >
          <svg
            width="11" height="11" viewBox="0 0 16 16" fill="none"
            className={isLoading ? "animate-spin" : ""}
            style={{ animationDuration: "0.7s" }}
          >
            <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M8 1l2 2-2 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {isLoading ? "Finding…" : "Try another"}
        </motion.button>
      </div>
      <h2
        className="text-lg sm:text-xl lg:text-xl leading-snug text-[var(--color-ink)] mb-2 lg:mb-3"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        {title}
      </h2>
      <p className="text-sm lg:text-base text-[var(--color-muted)] leading-relaxed mb-4 lg:mb-5">
        {description}
      </p>

      {why && (
        <div className="border-l-2 border-[var(--color-warm)]/30 pl-3 mb-4 lg:mb-6">
          <p className="text-[10px] lg:text-xs tracking-[0.14em] text-[var(--color-warm)] uppercase mb-1">
            Why this fits you
          </p>
          <p className="text-xs lg:text-sm text-[var(--color-muted)] leading-relaxed italic">
            {why}
          </p>
        </div>
      )}

      <ActionLinks type={type} title={title} location={location} />

      {added.has(type) ? (
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs lg:text-sm text-[var(--color-muted)] italic"
        >
          Saved to your profile
        </motion.p>
      ) : feedbackOpen === type ? (
        <div className="space-y-3">
          <input
            type="text"
            autoFocus
            placeholder="How was it? (optional)"
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addToProfile(type, title)}
            className="w-full bg-transparent text-sm lg:text-base text-[var(--color-ink)] placeholder:text-stone-300 border-b border-stone-200 focus:border-[var(--color-ink)] focus:outline-none pb-1.5 transition-colors"
          />
          <div className="flex gap-4">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => addToProfile(type, title)}
              className="text-xs lg:text-sm font-medium text-[var(--color-ink)] underline underline-offset-2"
            >
              Save to profile
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setFeedbackOpen(null)}
              className="text-xs lg:text-sm text-[var(--color-muted)]"
            >
              Cancel
            </motion.button>
          </div>
        </div>
      ) : (
        <motion.button
          onClick={() => openFeedback(type)}
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.95 }}
          className="text-xs lg:text-sm text-[var(--color-muted)] border border-stone-200 rounded-full px-4 py-1.5 hover:border-[var(--color-ink)] hover:text-[var(--color-ink)] transition-colors"
        >
          I did this →
        </motion.button>
      )}
    </>
  );
}

// ── Mobile swipeable carousel ──────────────────────────────────────────────────

function MobileCarousel({
  sections, data, location,
  added, feedbackOpen, feedbackNote, setFeedbackNote, openFeedback, addToProfile, setFeedbackOpen,
  cardLoading, regenerateCard,
}: {
  sections: typeof SECTIONS;
  data: Recommendation;
  location?: string;
} & FeedbackProps) {
  const [index, setIndex]     = useState(0);
  const [direction, setDir]   = useState(0);

  function go(dir: number) {
    const next = index + dir;
    if (next < 0 || next >= sections.length) return;
    setDir(dir);
    setIndex(next);
  }

  const { key, label, type } = sections[index];

  return (
    <div>
      <div className="relative overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={index}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragEnd={(_, info) => {
              if (info.offset.x < -50 || info.velocity.x < -400) go(1);
              else if (info.offset.x > 50 || info.velocity.x > 400) go(-1);
            }}
            className="bg-white/90 rounded-3xl shadow-sm p-6 sm:p-8 cursor-grab active:cursor-grabbing select-none"
          >
            <CardContent
              label={label}
              title={data[key].title}
              description={data[key].description}
              why={data[key].why}
              type={type}
              location={location}
              added={added}
              feedbackOpen={feedbackOpen}
              feedbackNote={feedbackNote}
              setFeedbackNote={setFeedbackNote}
              openFeedback={openFeedback}
              addToProfile={addToProfile}
              setFeedbackOpen={setFeedbackOpen}
              cardLoading={cardLoading}
              regenerateCard={regenerateCard}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Dot indicators + swipe hint */}
      <div className="flex items-center justify-center gap-2 mt-3">
        {sections.map((_, i) => (
          <motion.button
            key={i}
            onClick={() => { setDir(i > index ? 1 : -1); setIndex(i); }}
            animate={{ width: i === index ? 20 : 6, opacity: i === index ? 1 : 0.35 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="h-1.5 rounded-full bg-[var(--color-ink)]"
          />
        ))}
      </div>
    </div>
  );
}

// ── Action links ───────────────────────────────────────────────────────────────

function ActionLinks({ type, title, location }: {
  type: "go" | "listen" | "read";
  title: string;
  location?: string;
}) {
  const q    = encodeURIComponent(title);
  const mapQ = encodeURIComponent(location ? `${title} ${location}` : title);

  const links: { label: string; href: string }[] =
    type === "go"
      ? [
          { label: "Google Maps", href: `https://maps.google.com/maps/search/?api=1&query=${mapQ}` },
          { label: "Apple Maps",  href: `https://maps.apple.com/?q=${mapQ}` },
        ]
      : type === "listen"
      ? [
          { label: "Spotify",       href: `https://open.spotify.com/search/${q}` },
          { label: "Apple Music",   href: `https://music.apple.com/search?term=${q}` },
          { label: "YouTube Music", href: `https://music.youtube.com/search?q=${q}` },
        ]
      : [
          { label: "Goodreads",    href: `https://www.goodreads.com/search?q=${q}` },
          { label: "Google Books", href: `https://books.google.com/books?q=${q}` },
        ];

  return (
    <div className="flex flex-wrap gap-2 mb-4 lg:mb-6">
      {links.map(({ label, href }) => (
        <motion.a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.95 }}
          className="text-[10px] lg:text-sm tracking-[0.12em] text-[var(--color-muted)] border border-stone-200 rounded-full px-3 py-1 hover:border-[var(--color-ink)] hover:text-[var(--color-ink)] transition-colors"
        >
          {label} ↗
        </motion.a>
      ))}
    </div>
  );
}

// ── Profile helpers ────────────────────────────────────────────────────────────

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4">
      <span className="text-[10px] lg:text-sm tracking-widest text-[var(--color-muted)] uppercase w-20 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs lg:text-sm text-[var(--color-ink)] leading-relaxed">{value}</span>
    </div>
  );
}

function EditField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const base = "w-full bg-transparent text-[var(--color-ink)] text-sm lg:text-base border-b border-stone-200 focus:border-[var(--color-ink)] focus:outline-none pb-2 transition-colors";
  return (
    <div>
      <label className="block text-[10px] lg:text-sm tracking-[0.18em] text-[var(--color-warm)] uppercase mb-2">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={base} />
    </div>
  );
}
