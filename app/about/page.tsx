import Link from "next/link";
import Image from "next/image";

const categories = [
  {
    name: "Matchmaking & Rankings",
    features: [
      { id: "01", title: "AI Matchmaking", desc: "Our engine pairs players based on skill rating, style, and location, learning from every outcome." },
      { id: "08", title: "Global Leaderboards", desc: "Dynamic ratings updated live across city, province, and regional levels for four sports." },
      { id: "09", title: "Calibration Phase", desc: "Placement matches ensure every new player starts with a meaningful, fair baseline rating." },
      { id: "06", title: "Club-Based Pairing", desc: "Prioritize internal club matches for social play while staying in the global network." },
    ]
  },
  {
    name: "Management & Operations",
    features: [
      { id: "05", title: "Club & Court Suite", desc: "Full control over membership, court listings, and real-time occupancy monitoring." },
      { id: "03", title: "Verified Referees", desc: "Certified officials submit tamper-proof results directly, eliminating any score disputes." },
      { id: "10", title: "Tournament Engine", desc: "Organize official events with registration, seeding, and prize tier management." },
      { id: "07", title: "Live Occupancy", desc: "Real-time court status updates for members, feeding into peak-hour analytics." },
    ]
  },
  {
    name: "Insights & Ecosystem",
    features: [
      { id: "12", title: "Granular Stats", desc: "Track win rates, duration, and trajectory across every sport and match format." },
      { id: "13", title: "AI Coaching", desc: "Personalized insights flag performance patterns and recommend training focuses." },
      { id: "11", title: "Live Brackets", desc: "Visualize tournament progression in real-time for players, referees, and fans." },
      { id: "14", title: "Push Ecosystem", desc: "Instant alerts for invites, bookings, and results across web and mobile." },
    ]
  }
];

const values = [
  { icon: "⚖️", title: "Fairness", desc: "Verified referees and calibration ensure every win is earned." },
  { icon: "🔗", title: "Unity", desc: "One account for all your racket sports, clubs, and rankings." },
  { icon: "📈", title: "Growth", desc: "Data-driven insights to help you reach the next level." },
  { icon: "🌍", title: "Community", desc: "Building real connections through local competition." },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#030711] text-zinc-100 font-sans selection:bg-blue-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.05),transparent_50%)]" />
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 30 L31 31 M0 0 L1 1' stroke='%23ffffff' stroke-width='1' fill='none'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Navbar */}
      <nav className="fixed top-0 z-50 w-full px-6 py-4 flex items-center justify-between border-b border-white/[0.05] bg-[#030711]/80 backdrop-blur-md">
        <Link href="/" className="transition-transform active:scale-95">
          <Image src="/logo.png" alt="iSMS" width={110} height={35} className="h-8 w-auto" />
        </Link>
        <div className="hidden md:flex items-center gap-6 text-[13px] font-medium text-zinc-400">
          <Link href="/#features"  className="hover:text-white transition-colors">Features</Link>
          <Link href="/#sports"    className="hover:text-white transition-colors">Sports</Link>
          <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
          <Link href="/about"      className="text-white border-b border-blue-500 pb-1">About</Link>
          <Link href="/developer"  className="hover:text-white transition-colors">Developer</Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Log in</Link>
          <Link href="/register" className="px-4 py-1.5 text-sm font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] transition-all active:scale-95">
            Join
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-32 pb-20 px-6 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 mb-6">
          <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Platform Philosophy</span>
        </div>
        <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none mb-8">
          The Intelligent<br />
          <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Sports Ecosystem</span>.
        </h1>
        <p className="text-zinc-400 text-lg md:text-xl leading-relaxed max-w-3xl mx-auto">
          ISMS was built to bridge the gap between passion and technology. We provide a unified, 
          intelligent platform that handles everything from the first match to professional career tracking.
        </p>
      </section>

      {/* Mission & Vision Cards */}
      <section className="relative z-10 px-6 pb-24 max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="group relative bg-zinc-900/50 border border-white/10 rounded-[2rem] p-10 backdrop-blur-sm overflow-hidden transition-all hover:border-blue-500/30">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-8xl font-black italic">MISSION</div>
          <h2 className="text-2xl font-black mb-4 tracking-tight">Our Mission</h2>
          <p className="text-zinc-400 leading-relaxed relative z-10">
            To make every racket sport match more competitive, transparent, and connected 
            by giving players, clubs, and referees the tools they actually need to excel.
          </p>
        </div>
        <div className="group relative bg-zinc-900/50 border border-white/10 rounded-[2rem] p-10 backdrop-blur-sm overflow-hidden transition-all hover:border-emerald-500/30">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-8xl font-black italic">VISION</div>
          <h2 className="text-2xl font-black mb-4 tracking-tight">Our Vision</h2>
          <p className="text-zinc-400 leading-relaxed relative z-10">
            Becoming the global standard for amateur and semi-pro racket sports management, 
            where data empowers performance and community builds the game.
          </p>
        </div>
      </section>

      {/* Stats Bar */}
      <div className="border-y border-white/[0.03] bg-zinc-900/20 backdrop-blur-sm mb-24">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: "Racket Sports", val: "04" },
            { label: "Core Features", val: "15+" },
            { label: "Referees", val: "Verified" },
            { label: "Matchmaking", val: "AI-Driven" }
          ].map(s => (
            <div key={s.label} className="text-center md:text-left">
              <p className="text-3xl font-black tracking-tight text-blue-500">{s.val}</p>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Values Section */}
      <section className="relative z-10 px-6 pb-24 max-w-6xl mx-auto">
        <div className="mb-12 text-center">
          <h3 className="text-3xl font-black tracking-tight mb-2">Built on Integrity</h3>
          <p className="text-zinc-500 text-sm">The four pillars that guide every line of code in ISMS.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {values.map((v) => (
            <div
              key={v.title}
              className="group bg-zinc-900/30 border border-white/10 hover:border-blue-500/50 rounded-2xl p-6 transition-all duration-300"
            >
              <span className="text-4xl mb-4 block group-hover:scale-110 transition-transform">{v.icon}</span>
              <h4 className="font-bold text-white text-sm mb-2">{v.title}</h4>
              <p className="text-xs text-zinc-500 leading-relaxed">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Categorized Features Grid */}
      <section className="relative z-10 px-6 pb-32 max-w-6xl mx-auto">
        <div className="mb-16 text-center">
          <h3 className="text-4xl font-black tracking-tight mb-4">The Platform Engine</h3>
          <p className="text-zinc-500 text-lg">A unified suite of 15 features across three core domains.</p>
        </div>

        <div className="space-y-20">
          {categories.map((cat, idx) => (
            <div key={cat.name} className="relative">
              <div className="flex items-center gap-4 mb-8">
                <span className="text-4xl font-black text-white/10">0{idx + 1}</span>
                <h4 className="text-2xl font-black tracking-tight">{cat.name}</h4>
                <div className="h-[1px] flex-1 bg-white/[0.05]" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {cat.features.map(f => (
                  <div key={f.id} className="bg-zinc-900/20 border border-white/5 rounded-2xl p-6 hover:bg-zinc-900/40 transition-colors">
                    <span className="text-[10px] font-black text-blue-500 mb-3 block">FEATURE {f.id}</span>
                    <h5 className="font-bold text-sm mb-2">{f.title}</h5>
                    <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final Quote/CTA */}
      <section className="relative z-10 px-6 pb-32 max-w-4xl mx-auto">
        <div className="relative overflow-hidden rounded-[3rem] bg-zinc-900/50 border border-white/10 p-12 md:p-20 text-center">
          <div className="absolute top-0 left-0 w-64 h-64 bg-blue-600/10 blur-[100px] -ml-32 -mt-32" />
          
          <div className="relative">
            <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white leading-tight mb-8">
              Join the future of<br />
              racket sports today.
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                href="/register"
                className="px-8 py-4 rounded-2xl font-black text-white text-sm bg-blue-600 hover:bg-blue-500 shadow-xl shadow-blue-900/20 transition-all hover:-translate-y-1 active:scale-95"
              >
                Create Free Account
              </Link>
              <Link
                href="/leaderboard"
                className="px-8 py-4 rounded-2xl font-black text-white text-sm bg-white/5 border border-white/10 hover:bg-white/10 transition-all hover:-translate-y-1"
              >
                View Rankings
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-12 border-t border-white/[0.03] bg-zinc-950/50 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center md:items-start gap-3">
            <Image src="/logo.png" alt="iSMS" width={100} height={30} className="h-7 w-auto grayscale opacity-50" />
            <p className="text-[10px] text-zinc-600 font-medium tracking-widest uppercase">Intelligent Sports Management System</p>
          </div>
          <div className="flex gap-10 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-zinc-300 transition-colors">Contact</Link>
            <Link href="/developer" className="text-blue-500/50 hover:text-blue-500 transition-colors">Developer</Link>
          </div>
        </div>
        <div className="max-w-6xl mx-auto mt-8 pt-8 border-t border-white/[0.02] text-center md:text-left">
          <p className="text-[10px] text-zinc-700 font-medium italic">
            Built to empower the next generation of racket sport enthusiasts.
          </p>
        </div>
      </footer>
    </div>
  );
}
