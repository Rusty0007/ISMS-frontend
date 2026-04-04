import Link from "next/link";
import Image from "next/image";

const sports = [
  {
    key:   "pickleball",
    label: "PICKLEBALL",
    icon:  "🏓",
    img:   "/sports/pickleball.png",
    btn:   "Pickleball",
    glow:  "from-blue-600/20 to-transparent",
    border: "hover:border-blue-500/50",
  },
  {
    key:   "badminton",
    label: "BADMINTON",
    icon:  "🏸",
    img:   "/sports/badminton.png",
    btn:   "Badminton",
    glow:  "from-blue-400/20 to-transparent",
    border: "hover:border-blue-400/50",
  },
  {
    key:   "lawn_tennis",
    label: "LAWN TENNIS",
    icon:  "🎾",
    img:   "/sports/lawn-tennis-new.png",
    btn:   "Lawn Tennis",
    glow:  "from-emerald-600/20 to-transparent",
    border: "hover:border-emerald-500/50",
  },
  {
    key:   "table_tennis",
    label: "TABLE TENNIS",
    icon:  "🏓",
    img:   "/sports/table-tennis-new.png",
    btn:   "Table Tennis",
    glow:  "from-orange-600/20 to-transparent",
    border: "hover:border-orange-500/50",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#030711] text-zinc-100 font-sans selection:bg-blue-500/30 overflow-x-hidden">
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
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
          <Link href="#features"  className="hover:text-white transition-colors">Features</Link>
          <Link href="#sports"    className="hover:text-white transition-colors">Sports</Link>
          <Link href="/leaderboard" className="hover:text-white transition-colors">Leaderboard</Link>
          <Link href="/about"      className="hover:text-white transition-colors">About</Link>
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
      <section className="relative z-10 pt-32 lg:pt-48 pb-20 px-6 max-w-7xl mx-auto overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col gap-8 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 w-fit mx-auto lg:mx-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">The Future of Racket Sports</span>
            </div>
            
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9] uppercase">
              Elevate Your<br />
              <span className="bg-gradient-to-r from-blue-400 via-emerald-400 to-blue-500 bg-clip-text text-transparent">
                Competitive Edge
              </span>
            </h1>

            <p className="text-zinc-400 text-lg md:text-xl leading-relaxed max-w-xl mx-auto lg:mx-0">
              The intelligent OS for sports management. AI matchmaking, verified referee oversight, 
              and local leaderboards all in one unified ecosystem.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                href="/register"
                className="px-8 py-4 rounded-2xl font-black text-white text-sm bg-blue-600 hover:bg-blue-500 shadow-xl shadow-blue-900/20 transition-all hover:-translate-y-1 active:scale-95"
              >
                Start Competing Free
              </Link>
              <Link
                href="#features"
                className="px-8 py-4 rounded-2xl font-black text-white text-sm bg-white/5 border border-white/10 hover:bg-white/10 transition-all hover:-translate-y-1"
              >
                Explore Features
              </Link>
            </div>

            <div className="flex items-center gap-8 pt-4 justify-center lg:justify-start">
              <div className="flex -space-x-3">
                {[1,2,3,4].map(i => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-[#030711] bg-zinc-800 overflow-hidden">
                    <div className="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center text-[10px] font-bold">
                      {["PJ", "MD", "SL", "KV"][i-1]}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">5,000+ Active Players</p>
            </div>
          </div>

          {/* Hero Image / Illustration */}
          <div className="relative group perspective-1000">
            <div className="absolute -inset-4 bg-gradient-to-tr from-blue-600 to-emerald-500 rounded-[3rem] blur-2xl opacity-20 group-hover:opacity-30 transition-opacity" />
            <div className="relative bg-zinc-900/50 border border-white/10 rounded-[3rem] overflow-hidden aspect-[4/5] sm:aspect-square lg:aspect-[4/5] shadow-2xl backdrop-blur-sm">
              <Image
                src="/hero-athlete.jpg.png"
                alt="iSMS Elite Performance"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#030711] via-transparent to-transparent opacity-60" />
              
              <div className="absolute bottom-8 left-8 right-8 p-6 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-black uppercase tracking-widest text-blue-400">Live Calibration</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Active</span>
                </div>
                <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full w-[85%] bg-blue-500 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Divider */}
      <div className="border-y border-white/[0.03] bg-zinc-900/20 backdrop-blur-sm mb-24">
        <div className="max-w-7xl mx-auto px-6 py-12 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { label: "Daily Matches", val: "1.2k+" },
            { label: "Clubs Onboarded", val: "450+" },
            { label: "Referee Network", val: "850+" },
            { label: "Skill Precision", val: "99.2%" }
          ].map(s => (
            <div key={s.label} className="text-center lg:text-left">
              <p className="text-3xl font-black tracking-tight">{s.val}</p>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sports Section */}
      <section id="sports" className="relative z-10 px-6 pb-32 max-w-7xl mx-auto">
        <div className="mb-12 text-center lg:text-left">
          <h2 className="text-4xl font-black tracking-tight mb-4 uppercase">Dominating <span className="text-blue-500">4 Sports</span></h2>
          <p className="text-zinc-500 text-lg">Every discipline has its own ranking ladder and specialized rulesets.</p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {sports.map((s) => (
            <div 
              key={s.key} 
              className={`group relative h-[450px] bg-zinc-900/50 border border-white/10 rounded-[2rem] overflow-hidden transition-all duration-500 ${s.border} hover:-translate-y-2 hover:shadow-2xl`}
            >
              <div className={`absolute inset-0 bg-gradient-to-t ${s.glow}`} />
              
              <div className="relative z-10 p-8 h-full flex flex-col justify-between">
                <div className="flex justify-between items-start">
                  <h3 className="text-2xl font-black tracking-tighter uppercase leading-none">{s.label}</h3>
                  <span className="text-2xl p-2 bg-white/5 rounded-xl border border-white/10 backdrop-blur-md">{s.icon}</span>
                </div>
                
                <div className="relative w-full h-52 mt-6">
                  <Image
                    src={s.img}
                    alt={s.btn}
                    fill
                    quality={100}
                    sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 25vw"
                    className="object-contain object-bottom drop-shadow-2xl transition-transform duration-700 group-hover:scale-110 group-hover:-translate-y-4"
                  />
                </div>
                
                <Link 
                  href={`/register?sport=${s.key}`} 
                  className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-center hover:bg-white hover:text-black transition-all"
                >
                  Join Ladder
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="relative z-10 px-6 pb-32 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 relative group overflow-hidden rounded-[2.5rem] border border-white/10 bg-zinc-900/50 p-12 backdrop-blur-sm min-h-[500px] flex flex-col justify-between">
            <div className="absolute top-0 right-0 p-12 opacity-5 text-[20rem] font-black group-hover:scale-110 group-hover:opacity-10 transition-all duration-700">AI</div>
            <div className="relative z-10">
              <h3 className="text-4xl md:text-5xl font-black tracking-tighter mb-6 uppercase">Matchmaking<br /><span className="text-blue-500">Engine 2.0</span></h3>
              <p className="text-zinc-400 text-lg max-w-md leading-relaxed">
                Proprietary Glicko-2 algorithms analyze match history, style preferences, and geographic data 
                to find your perfect opponent in seconds.
              </p>
            </div>
            <div className="relative z-10 pt-12">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { l: "Skill Gap", v: "< 2%" },
                  { l: "Match Time", v: "45s" },
                  { l: "Accuracy", v: "99%" }
                ].map(stat => (
                  <div key={stat.l} className="bg-white/5 border border-white/5 p-4 rounded-2xl">
                    <p className="text-xl font-black text-white">{stat.v}</p>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{stat.l}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-zinc-900/50 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-sm hover:border-emerald-500/50 transition-colors">
              <span className="text-4xl mb-6 block">🏅</span>
              <h4 className="text-xl font-black mb-2 uppercase tracking-tight text-emerald-400">Verified Referees</h4>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Certified officials oversee matches, providing tamper-proof result submission and dispute resolution.
              </p>
            </div>
            <div className="bg-zinc-900/50 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-sm hover:border-blue-500/50 transition-colors">
              <span className="text-4xl mb-6 block">📍</span>
              <h4 className="text-xl font-black mb-2 uppercase tracking-tight text-blue-400">Local Leaderboards</h4>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Compete for recognition in city-wide, provincial, and regional ladders updated in real-time.
              </p>
            </div>
            <div className="bg-zinc-900/50 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-sm hover:border-orange-500/50 transition-colors">
              <span className="text-4xl mb-6 block">🏢</span>
              <h4 className="text-xl font-black mb-2 uppercase tracking-tight text-orange-400">Court Occupancy</h4>
              <p className="text-zinc-500 text-sm leading-relaxed">
                Live court status tracking for clubs helps you find available space without the guesswork.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 px-6 pb-32 max-w-4xl mx-auto">
        <div className="relative overflow-hidden rounded-[3rem] bg-zinc-900/50 border border-white/10 p-12 md:p-20 text-center shadow-3xl">
          <div className="absolute top-0 left-0 w-64 h-64 bg-blue-600/10 blur-[100px] -ml-32 -mt-32" />
          <div className="absolute bottom-0 right-0 w-64 h-64 bg-emerald-600/10 blur-[100px] -mr-32 -mb-32" />
          
          <div className="relative">
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white leading-tight mb-8 uppercase">
              Ready to claim your<br />
              <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">place in history?</span>
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
                Explore Leaderboards
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-12 border-t border-white/[0.03] bg-zinc-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center md:items-start gap-3">
            <Image src="/logo.png" alt="iSMS" width={100} height={30} className="h-7 w-auto grayscale opacity-50" />
            <p className="text-[10px] text-zinc-600 font-medium tracking-widest uppercase">Intelligent Sports Management System</p>
          </div>
          <div className="flex gap-10 text-[10px] font-black uppercase tracking-widest text-zinc-500">
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
            <Link href="/contact" className="hover:text-zinc-300 transition-colors">Contact</Link>
            <Link href="/developer" className="hover:text-zinc-300 transition-colors">Developer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
