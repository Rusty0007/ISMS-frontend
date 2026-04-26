"use client";

import NavBar from "@/components/NavBar";
import SportsCardGrid from "@/components/SportsCardGrid";

const mockRatings = [
    { sport: "lawn_tennis", match_format: "singles", rating: 1850, skill_level: "PLATINUM IV", matches_played: 45, wins: 32, losses: 13, rating_status: "RATED" },
    { sport: "badminton", match_format: "doubles", rating: 1420, skill_level: "GOLD II", matches_played: 12, wins: 7, losses: 5, rating_status: "RATED" },
    { sport: "pickleball", match_format: "mixed_doubles", rating: 1200, skill_level: "SILVER I", matches_played: 4, wins: 2, losses: 2, rating_status: "CALIBRATING" },
    { sport: "table_tennis", match_format: "singles", rating: 2100, skill_level: "DIAMOND I", matches_played: 89, wins: 65, losses: 24, rating_status: "RATED" },
];

export default function SportsCardShowcase() {
    return (
        <div className="min-h-screen bg-[#050b14] text-white">
            <NavBar />
            <main className="max-w-7xl mx-auto px-6 pt-32 pb-20">
                <header className="mb-12">
                    <h1 className="text-4xl font-black uppercase italic tracking-tighter">Tactical Sports Cards</h1>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mt-2">New Grid Layout for Combat Disciplines</p>
                </header>
                
                <section className="space-y-12">
                    <div>
                        <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-500 mb-8 px-2">Operator Grid View</h2>
                        <SportsCardGrid ratings={mockRatings} />
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 lg:p-12">
                        <h3 className="text-xl font-black uppercase italic mb-6">Design Features</h3>
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                            <li className="flex items-center gap-4">
                                <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]" />
                                Individual Format Cards
                            </li>
                            <li className="flex items-center gap-4">
                                <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]" />
                                Integrated &quot;Find Match&quot; Button
                            </li>
                            <li className="flex items-center gap-4">
                                <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]" />
                                Calibration Scanline Effect
                            </li>
                            <li className="flex items-center gap-4">
                                <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]" />
                                Color-Coded Sport Accents
                            </li>
                            <li className="flex items-center gap-4">
                                <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]" />
                                Win/Loss/Total Quick Stats
                            </li>
                            <li className="flex items-center gap-4">
                                <span className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,1)]" />
                                Adaptive Grid (1 to 4 columns)
                            </li>
                        </ul>
                    </div>
                </section>
            </main>
        </div>
    );
}
