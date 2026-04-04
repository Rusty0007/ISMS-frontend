import Link from "next/link";
import Image from "next/image";

const features = [
  {
    number: "01",
    title: "AI Matchmaking",
    desc: "Our intelligent matchmaking engine pairs players based on skill rating, play style, sport format preference, and location. Rather than random pairings, the system continuously learns from match outcomes to refine its recommendations — ensuring every game is competitive, fair, and enjoyable for both sides.",
  },
  {
    number: "02",
    title: "Multi-Sport Support",
    desc: "ISMS is purpose-built for four racket sports: Pickleball, Badminton, Lawn Tennis, and Table Tennis. Each sport has its own ranking ladder, match format options (singles, doubles, mixed), stat tracking, and leaderboard — all unified under one account.",
  },
  {
    number: "03",
    title: "Verified Referee System",
    desc: "Matches can be officiated by certified referees who are verified and badged within the platform. Referees submit match results directly, eliminating score disputes. Players can request a referee for any scheduled match, and clubs can designate on-duty referees for their courts.",
  },
  {
    number: "04",
    title: "Match History & Records",
    desc: "Every match played on ISMS is permanently recorded — opponent, score, format, date, court, and referee. Players can review their full history, filter by sport or format, and track performance trends over time. Match records are tamper-proof and linked to both players' profiles.",
  },
  {
    number: "05",
    title: "Club & Court Management",
    desc: "Club administrators can create and manage sports clubs with full control over membership, court listings, and booking schedules. Define court availability, set member roles, and monitor occupancy in real time. Club pages are publicly visible so players can discover and join clubs in their area.",
  },
  {
    number: "06",
    title: "Club-Based Matchmaking",
    desc: "Players can opt into club-scoped matchmaking — finding opponents within their own club before searching the wider pool. This is ideal for recreational clubs that want internal ladders and social play while still being part of the broader ISMS network.",
  },
  {
    number: "07",
    title: "Real-Time Court Occupancy",
    desc: "Club managers can mark courts as occupied or available in real time. Members viewing the club page see live court status — no more walking to a full court. Occupancy data also feeds into booking suggestions and peak-hour analytics.",
  },
  {
    number: "08",
    title: "Ranking & Leaderboard System",
    desc: "ISMS maintains dynamic skill ratings updated after every match. Leaderboards are scoped at three geographic levels — city, province, and region — so players compete for local recognition as well as broader standing. Ratings are sport-specific and format-aware (singles vs. doubles).",
  },
  {
    number: "09",
    title: "Calibration Phase",
    desc: "New players go through a calibration phase — a set of placement matches that establish their initial rating. This prevents new accounts from being immediately ranked and ensures the rating system starts with a meaningful baseline rather than an arbitrary default.",
  },
  {
    number: "10",
    title: "Tournament Support",
    desc: "Clubs and administrators can organize official tournaments within ISMS. Set participant limits, registration deadlines, sport and format, and prize tiers. The system manages registration, seeding, and result submission — with all outcomes feeding directly into player ratings.",
  },
  {
    number: "11",
    title: "Bracket Visualization",
    desc: "Tournaments include a live bracket view that updates as results come in. Players, spectators, and referees can follow the draw in real time — seeing who advances, upcoming matchups, and final standings as they unfold.",
  },
  {
    number: "12",
    title: "In-Depth Player Statistics",
    desc: "Beyond win/loss records, ISMS tracks granular stats per sport and format: win rate, average match duration, opponent rating faced, home vs. away performance, and rating trajectory over time. Players can use these insights to identify strengths and areas to develop.",
  },
  {
    number: "13",
    title: "AI Performance Insights",
    desc: "The platform's AI layer analyses a player's historical data to surface personalized insights — identifying patterns in performance, recommending training focuses, and flagging when a rating change is expected based on recent match trends. Think of it as a data-driven coach in your profile.",
  },
  {
    number: "14",
    title: "Real-Time Notifications",
    desc: "ISMS keeps players and administrators informed at every step. Receive instant alerts for match invitations, booking confirmations, referee assignments, tournament registrations, club join requests, and result approvals — in-app and as browser push notifications.",
  },
  {
    number: "15",
    title: "Connected Ecosystem",
    desc: "Every piece of ISMS is integrated: matchmaking pulls from rankings, rankings update from verified match results, clubs connect to courts and bookings, referees connect to matches, and notifications tie everything together. It is a complete, coherent platform — not a collection of separate tools.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Background grid */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Navbar */}
      <nav className="relative z-20 w-full px-8 py-4 flex items-center justify-between border-b border-white/[0.08] bg-zinc-950/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <Link href="/">
          <Image src="/logo.png" alt="iSMS" width={120} height={40} className="h-10 w-auto" />
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
          <Link href="/#features"  className="relative hover:text-white transition-colors duration-200 after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-blue-400 after:transition-[width] after:duration-300 hover:after:w-full">Features</Link>
          <Link href="/#sports"    className="relative hover:text-white transition-colors duration-200 after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-blue-400 after:transition-[width] after:duration-300 hover:after:w-full">Sports</Link>
          <Link href="/leaderboard" className="relative hover:text-white transition-colors duration-200 after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-blue-400 after:transition-[width] after:duration-300 hover:after:w-full">Leaderboard</Link>
          <Link href="/about"      className="relative hover:text-white transition-colors duration-200 after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-blue-400 after:transition-[width] after:duration-300 hover:after:w-full">About</Link>
          <Link href="/developer"  className="relative hover:text-white transition-colors duration-200 after:absolute after:bottom-[-4px] after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-blue-400 after:transition-[width] after:duration-300 hover:after:w-full">Developer</Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-white transition-colors">
            Log in
          </Link>
          <Link href="/register" className="px-5 py-2 text-sm font-bold rounded-lg bg-blue-500 hover:bg-blue-400 text-white transition-colors">
            Join Now
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-8 pt-20 pb-16 text-center max-w-3xl mx-auto">
        <span className="text-xs font-bold tracking-[0.3em] text-blue-400 uppercase mb-4 block">
          Platform Capabilities
        </span>
        <h1 className="text-5xl font-black tracking-tight mb-5 uppercase">
          Everything ISMS<br />
          <span className="text-blue-400">Can Do</span>
        </h1>
        <p className="text-zinc-400 text-base leading-relaxed">
          ISMS is a comprehensive sports management platform built for racket sport communities.
          From AI-powered matchmaking to verified referees and live court occupancy,
          every feature is designed to make competitive play more accessible, fair, and data-driven.
        </p>
      </section>

      {/* Features list */}
      <section className="relative z-10 px-6 md:px-8 pb-24 max-w-5xl mx-auto">
        <div className="flex flex-col gap-4">
          {features.map((f) => (
            <div
              key={f.number}
              className="bg-zinc-900 border border-white/10 hover:border-blue-500/30 rounded-2xl p-6 flex gap-6 transition-colors"
            >
              <span className="text-blue-400 font-black text-2xl tabular-nums shrink-0 pt-0.5">
                {f.number}
              </span>
              <div>
                <h3 className="font-bold text-white text-lg mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-16">
          <Link
            href="/register"
            className="inline-block px-10 py-4 rounded-xl font-bold text-white text-base bg-blue-500 hover:bg-blue-400 transition-colors"
          >
            Create your account →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-6 flex items-center justify-between text-sm text-zinc-600 border-t border-white/5">
        <span>© {new Date().getFullYear()} ISMS. All rights reserved.</span>
        <Image src="/logo.png" alt="iSMS" width={60} height={20} className="h-5 w-auto opacity-60" />
      </footer>
    </div>
  );
}
