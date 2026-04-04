import Link from "next/link";
import Image from "next/image";

const stack = [
  { label: "Next.js",      color: "bg-white/10 text-white", category: "Frontend" },
  { label: "TypeScript",   color: "bg-blue-500/20 text-blue-300", category: "Language" },
  { label: "TailwindCSS",  color: "bg-sky-500/20 text-sky-300", category: "Frontend" },
  { label: "FastAPI",      color: "bg-emerald-500/20 text-emerald-300", category: "Backend" },
  { label: "Python",       color: "bg-yellow-500/20 text-yellow-300", category: "Language" },
  { label: "PostgreSQL",   color: "bg-indigo-500/20 text-indigo-300", category: "Database" },
  { label: "SQLAlchemy",   color: "bg-red-500/20 text-red-300", category: "Backend" },
  { label: "Docker",       color: "bg-blue-400/20 text-blue-200", category: "DevOps" },
  { label: "Firebase",     color: "bg-orange-500/20 text-orange-300", category: "Auth/Cloud" },
  { label: "REST APIs",    color: "bg-purple-500/20 text-purple-300", category: "Backend" },
];

const achievements = [
  { icon: "🏗️", title: "Full-Stack Architecture", desc: "Designed the system from database schema to frontend UI, ensuring seamless data flow and performance." },
  { icon: "🤖", title: "AI Matchmaking Engine", desc: "Built a Glicko-2 based skill-rating system that evolves with player performance." },
  { icon: "🏅", title: "Referee Lifecycle", desc: "Engineered a robust system for referee certification, match duty, and verified result submission." },
  { icon: "📊", title: "Dynamic Rankings", desc: "Implemented geo-scoped leaderboards with live updates and career growth tracking." },
  { icon: "🏢", title: "Management Suite", desc: "Developed comprehensive tools for club owners and court managers to oversee operations." },
  { icon: "🚀", title: "Scalable Deployment", desc: "Containerized with Docker, optimized for cloud deployment and high-concurrency environments." },
];

const milestones = [
  { date: "Oct 2025", title: "The Vision", desc: "Conceived ISMS to modernize racket sport management." },
  { date: "Nov 2025", title: "Backend Core", desc: "Built the FastAPI foundation and PostgreSQL schema." },
  { date: "Dec 2025", title: "AI & Logic", desc: "Implemented the Glicko-2 matchmaking and sport rulesets." },
  { date: "Jan 2026", title: "Frontend UI", desc: "Crafted the Next.js experience with TailwindCSS." },
  { date: "Feb 2026", title: "Real-time Sync", desc: "Integrated Firebase for live notifications and updates." },
  { date: "Mar 2026", title: "Launch Ready", desc: "Final optimizations, testing, and system-wide verification." },
];

export default function DeveloperPage() {
  return (
    <div className="min-h-screen bg-[#030711] text-zinc-100 font-sans selection:bg-blue-500/30">
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.08),transparent_50%)]" />
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.4'%3E%3Cpath d='M36 34v-2h-2v2h2zm4 8h-2v2h2v-2zm8 4h-2v2h2v-2zm-12 0h-2v2h2v-2zm-8-8h-2v2h2v-2zm-4-4h-2v2h2v-2zm-8-8h-2v2h2v-2zm-4-4h-2v2h2v-2zm-8-8h-2v2h2v-2zm0 8h2v2h-2v-2zm0 8h2v2h-2v-2zm0 8h2v2h-2v-2zm0 8h2v2h-2v-2zm8 8h2v2h-2v-2zm8 8h2v2h-2v-2zm8 8h2v2h-2v-2zm8 8h2v2h-2v-2zm8-8v-2h-2v2h2zm-4-8v-2h-2v2h2zm-4-8v-2h-2v2h2zm-4-8v-2h-2v2h2zm-4-8v-2h-2v2h2zm-4-8v-2h-2v2h2zm-4-8v-2h-2v2h2zm-4-8v-2h-2v2h2zm-4-8v-2h-2v2h2zm-4-8v-2h-2v2h2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
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
          <Link href="/about"      className="hover:text-white transition-colors">About</Link>
          <Link href="/developer"  className="text-white border-b border-blue-500 pb-1">Developer</Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">Log in</Link>
          <Link href="/register" className="px-4 py-1.5 text-sm font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] transition-all active:scale-95">
            Join
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 pt-32 pb-20 px-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-12 items-center">
          {/* Profile Card */}
          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-tr from-blue-600 to-emerald-500 rounded-[2.5rem] blur-2xl opacity-20 group-hover:opacity-30 transition-opacity" />
            <div className="relative bg-zinc-900/50 border border-white/10 rounded-[2rem] p-8 backdrop-blur-sm overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16" />
              
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-blue-500 rounded-2xl rotate-6 group-hover:rotate-3 transition-transform duration-500" />
                  <div className="relative w-40 h-40 rounded-2xl overflow-hidden border border-white/10 bg-zinc-800">
                    <Image
                      src="/developer.png"
                      alt="Rusty Lloyd Abang"
                      width={160}
                      height={160}
                      className="object-cover w-full h-full scale-105 group-hover:scale-100 transition-transform duration-500"
                      style={{ objectPosition: "center 10%" }}
                      priority
                    />
                  </div>
                </div>

                <h1 className="text-3xl font-black mb-1 tracking-tight">Rusty Lloyd <span className="text-blue-500">Abang</span></h1>
                <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest mb-6">Full Stack Developer</p>
                
                <div className="flex gap-4 mb-8">
                  <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.042-1.416-4.042-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
                  </button>
                  <button className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                  </button>
                  <button className="px-6 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold transition-all shadow-lg shadow-blue-900/20 active:scale-95">
                    Connect
                  </button>
                </div>

                <div className="w-full grid grid-cols-2 gap-4 border-t border-white/5 pt-6">
                  <div className="text-left">
                    <p className="text-[10px] text-zinc-500 uppercase font-black tracking-tighter mb-1">Based in</p>
                    <p className="text-xs font-bold">Zamboanga del Norte</p>
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] text-zinc-500 uppercase font-black tracking-tighter mb-1">Education</p>
                    <p className="text-xs font-bold truncate">JRMSU</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bio & Intro */}
          <div className="flex flex-col gap-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Available for Collaboration</span>
              </div>
              <h2 className="text-4xl sm:text-6xl font-black tracking-tighter leading-[0.9]">
                Architecting the<br />
                <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">Future of Sports</span>.
              </h2>
              <p className="text-zinc-400 text-lg leading-relaxed max-w-2xl">
                I am a passionate software engineer focused on building intelligent ecosystems.
                With ISMS, I combined my love for racket sports with advanced engineering
                principles—from Glicko-2 matchmaking algorithms to real-time notification systems.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {stack.map((s) => (
                <div
                  key={s.label}
                  className={`group relative flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 ${s.color} transition-all duration-300 hover:scale-105`}
                >
                  <span className="text-sm font-bold tracking-tight">{s.label}</span>
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-800 rounded border border-white/10 text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                    {s.category}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-6 items-center pt-4">
              <div className="flex -space-x-3">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-[#030711] bg-zinc-800 overflow-hidden">
                    <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-[10px] font-bold">
                      {["PJ", "MD", "SL", "KV"][i-1]}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-sm font-bold">Trusted by many</p>
                <p className="text-xs text-zinc-500">Helping players level up their game.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Divider */}
      <div className="border-y border-white/[0.03] bg-zinc-900/20 backdrop-blur-sm mb-24">
        <div className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: "Code Lines", val: "50k+" },
            { label: "Components", val: "120+" },
            { label: "API Endpoints", val: "80+" },
            { label: "Uptime", val: "99.9%" }
          ].map(s => (
            <div key={s.label} className="text-center md:text-left">
              <p className="text-3xl font-black tracking-tight">{s.val}</p>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content: Features & Journey */}
      <section className="relative z-10 px-6 max-w-6xl mx-auto pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
          
          {/* Achievements Grid */}
          <div>
            <div className="mb-10">
              <h3 className="text-2xl font-black mb-2 tracking-tight">Core Infrastructure</h3>
              <p className="text-zinc-500 text-sm">Key subsystems designed and implemented by Rusty.</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {achievements.map((a) => (
                <div
                  key={a.title}
                  className="group relative bg-zinc-900/30 border border-white/10 hover:border-blue-500/50 rounded-2xl p-6 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 group-hover:scale-150 transition-all text-4xl">
                    {a.icon}
                  </div>
                  <h4 className="font-bold text-white text-sm mb-2">{a.title}</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed">{a.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline / Journey */}
          <div>
            <div className="mb-10">
              <h3 className="text-2xl font-black mb-2 tracking-tight">The Journey</h3>
              <p className="text-zinc-500 text-sm">Development milestones of the ISMS platform.</p>
            </div>

            <div className="space-y-8 relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-gradient-to-b from-blue-500/50 via-zinc-800 to-transparent" />
              {milestones.map((m, i) => (
                <div key={i} className="relative pl-8 group">
                  <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-[#030711] border-2 border-blue-500 z-10 group-hover:scale-125 transition-transform" />
                  <div>
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-tighter mb-1 block">
                      {m.date}
                    </span>
                    <h4 className="font-bold text-sm mb-1">{m.title}</h4>
                    <p className="text-xs text-zinc-500 leading-relaxed">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Quote Section */}
      <section className="relative z-10 px-6 pb-32 max-w-4xl mx-auto">
        <div className="relative overflow-hidden rounded-[3rem] bg-zinc-900/50 border border-white/10 p-12 md:p-20 text-center shadow-3xl">
          <div className="absolute top-0 left-0 w-64 h-64 bg-blue-600/10 blur-[100px] -ml-32 -mt-32" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-emerald-600/10 blur-[100px] -mr-32 -mb-32" />
          
          <div className="relative">
            <span className="inline-block text-6xl text-blue-500 font-serif leading-none mb-4">“</span>
            <p className="text-2xl md:text-3xl font-black tracking-tighter text-white leading-tight mb-8 max-w-2xl mx-auto">
              I built ISMS to give racket sport players something they never had —
              a single, intelligent platform that handles everything.
            </p>
            <div className="flex items-center justify-center gap-4">
              <div className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10 overflow-hidden">
                <Image src="/developer.png" alt="Rusty" width={40} height={40} className="object-cover" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold">Rusty Lloyd Abang</p>
                <p className="text-[10px] text-zinc-500 font-medium">Lead Software Engineer</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 px-6 pb-32 text-center">
        <h2 className="text-3xl font-black mb-8 tracking-tight">Ready to experience the platform?</h2>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/register"
            className="px-8 py-4 rounded-2xl font-black text-white text-sm bg-blue-600 hover:bg-blue-500 shadow-xl shadow-blue-900/20 transition-all hover:-translate-y-1 active:scale-95"
          >
            Start Your Career
          </Link>
          <Link
            href="/#features"
            className="px-8 py-4 rounded-2xl font-black text-white text-sm bg-white/5 border border-white/10 hover:bg-white/10 transition-all hover:-translate-y-1"
          >
            Learn More
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-10 border-t border-white/[0.03] bg-zinc-950/50 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-2">
            <Image src="/logo.png" alt="iSMS" width={80} height={25} className="h-6 w-auto grayscale opacity-50" />
            <p className="text-[10px] text-zinc-600 font-medium">© {new Date().getFullYear()} ISMS. Handcrafted with passion.</p>
          </div>
          <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-zinc-300 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
