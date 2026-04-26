"use client";

import Link from "next/link";
import type { FormEvent, ReactNode } from "react";

type SessionCard = {
    id: string;
    title: string;
    sport: string;
    sport_emoji: string;
    session_date: string;
    duration_hours: number;
    max_players: number;
    confirmed_count: number;
    price_per_head: number;
    status: string;
    is_joined: boolean;
    court_name: string | null;
    skill_min: number | null;
    skill_max: number | null;
};

type CourtBasic = {
    id: string;
    name: string;
    sport: string | null;
};

type Props = {
    clubName: string;
    clubSport: string | null;
    openingTime: string;
    closingTime: string;
    sessions: SessionCard[];
    sessLoading: boolean;
    joiningId: string | null;
    selectedDate: string;
    isAdmin: boolean;
    showForm: boolean;
    formSport: string;
    formMatchFormat: string;
    formQueueMode: string;
    formRotationMode: string;
    formSkillMin: string;
    formSkillMax: string;
    formDate: string;
    formEndTime: string;
    formMax: string;
    formPrice: string;
    formCourt: string;
    courts: CourtBasic[];
    formSubmitting: boolean;
    onSelectDate: (value: string) => void;
    onJoinSession: (id: string) => void;
    onToggleForm: () => void;
    onCreateSession: (event: FormEvent<HTMLFormElement>) => void;
    setFormSport: (value: string) => void;
    setFormMatchFormat: (value: string) => void;
    setFormQueueMode: (value: string) => void;
    setFormRotationMode: (value: string) => void;
    setFormSkillMin: (value: string) => void;
    setFormSkillMax: (value: string) => void;
    setFormDate: (value: string) => void;
    setFormEndTime: (value: string) => void;
    setFormMax: (value: string) => void;
    setFormPrice: (value: string) => void;
    setFormCourt: (value: string) => void;
};

const SPORT_THEME: Record<string, { border: string; tint: string; text: string; progress: string }> = {
    badminton: { border: "border-purple-500/20", tint: "bg-purple-500/10", text: "text-purple-400", progress: "from-purple-500 to-indigo-500" },
    pickleball: { border: "border-blue-500/20", tint: "bg-blue-500/10", text: "text-blue-400", progress: "from-blue-500 to-cyan-500" },
    lawn_tennis: { border: "border-emerald-500/20", tint: "bg-emerald-500/10", text: "text-emerald-400", progress: "from-emerald-500 to-lime-500" },
    table_tennis: { border: "border-orange-500/20", tint: "bg-orange-500/10", text: "text-orange-400", progress: "from-orange-500 to-amber-500" },
};

function todayISO() { return new Date().toISOString().slice(0, 10); }
function offsetDate(base: string, days: number) { const d = new Date(base + "T00:00:00"); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
function dateDayLabel(iso: string, today: string) { if (iso === today) return "Today"; if (iso === offsetDate(today, -1)) return "Yesterday"; if (iso === offsetDate(today, 1)) return "Tomorrow"; return new Date(iso + "T00:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }); }
function sessionHourSlot(iso: string) { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:00`; }
function fmtHour(hhmm: string) { const [h, m] = hhmm.split(":").map(Number); const ampm = h >= 12 ? "PM" : "AM"; const display = h % 12 || 12; return m ? `${display}:${String(m).padStart(2, "0")} ${ampm}` : `${display} ${ampm}`; }
function sportLabel(value: string | null | undefined) { if (!value) return "All Protocols"; return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }
function formatSkillRange(min: number | null, max: number | null) { if (min == null && max == null) return "All Ratings"; if (min != null && max != null) return `${min}-${max}`; if (min != null) return `${min}+`; return `Up to ${max}`; }

export default function ClubOpenPlayPanel(props: Props) {
    const today = todayISO();
    const dateCards = [-1, 0, 1, 2, 3, 4].map((d) => offsetDate(today, d));
    const bySlot: Record<string, SessionCard[]> = {};
    for (const session of props.sessions) {
        const slot = sessionHourSlot(session.session_date);
        if (!bySlot[slot]) bySlot[slot] = [];
        bySlot[slot].push(session);
    }
    const groupedSlots = Object.entries(bySlot).sort(([a], [b]) => a.localeCompare(b));
    const totalSlotsLeft = props.sessions.reduce((sum, session) => sum + Math.max(0, session.max_players - session.confirmed_count), 0);
    const liveSessions = props.sessions.filter((session) => session.status === "ongoing").length;
    const totalCapacity = props.sessions.reduce((sum, session) => sum + Math.max(session.max_players, 0), 0);
    const fillRate = totalCapacity > 0 ? Math.round((props.sessions.reduce((sum, session) => sum + session.confirmed_count, 0) / totalCapacity) * 100) : 0;
    const nextSession = props.sessions.slice().sort((a, b) => new Date(a.session_date).getTime() - new Date(b.session_date).getTime())[0] ?? null;
    const selectedDateLabel = new Date(props.selectedDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    const fieldClass = "h-11 rounded-xl border border-white/10 bg-black/40 px-3 text-[10px] font-black uppercase tracking-widest text-white outline-none transition focus:border-cyan-500/50";
    const sportOptions = props.clubSport ? [props.clubSport] : ["badminton", "pickleball", "lawn_tennis", "table_tennis"];
    const sportLocked = sportOptions.length === 1;

    return (
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-8">
                {/* Tactical Header Card */}
                <section className="relative overflow-hidden rounded-[2.5rem] border border-white/5 bg-[#0a111a]/40 backdrop-blur-xl shadow-2xl">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 blur-[80px] rounded-full -mr-32 -mt-32" />
                    <div className="relative p-8 lg:p-10 flex flex-col lg:flex-row gap-8 lg:items-center">
                        <div className="flex-1 space-y-4">
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500">OPERATIONAL CALENDAR</p>
                                <h2 className="text-3xl lg:text-4xl font-black tracking-tighter text-white uppercase italic leading-none">{selectedDateLabel}</h2>
                            </div>
                            <p className="text-sm text-slate-400 italic leading-relaxed max-w-md">Accessing active session blocks and managing facility rhythm for the current cycle.</p>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <span className="px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-[9px] font-black uppercase tracking-widest text-cyan-400">
                                    OPEN {fmtHour(props.openingTime)} - {fmtHour(props.closingTime)}
                                </span>
                                {nextSession && (
                                    <span className="px-3 py-1 rounded-full border border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                        NEXT OPS: {new Date(nextSession.session_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3 w-full lg:w-72">
                            <MiniStat label="ACTIVE OPS" value={props.sessions.length} />
                            <MiniStat label="LIVE NOW" value={liveSessions} highlight={liveSessions > 0} />
                            <MiniStat label="VACANCY" value={totalSlotsLeft} />
                            <MiniStat label="LOAD" value={`${fillRate}%`} />
                        </div>
                    </div>
                </section>

                {/* Date Selection Grid */}
                <section className="bg-[#0a111a]/40 border border-white/5 rounded-[2.5rem] p-6 lg:p-8">
                    <div className="flex items-center justify-between px-2 mb-6">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">CYCLE SELECTOR</h2>
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest italic">NEURAL SYNC ACTIVE</span>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                        {dateCards.map((date) => {
                            const isSelected = date === props.selectedDate;
                            const isPast = date < today;
                            const d = new Date(date + "T00:00:00");
                            return (
                                <button 
                                    key={date} 
                                    onClick={() => props.onSelectDate(date)} 
                                    className={`flex-shrink-0 min-w-[90px] group relative overflow-hidden rounded-2xl border transition-all ${
                                        isSelected 
                                            ? "border-cyan-500/30 bg-white text-black scale-[1.05] shadow-2xl" 
                                            : isPast 
                                            ? "border-white/5 bg-white/[0.02] text-slate-600 grayscale opacity-50" 
                                            : "border-white/5 bg-white/[0.04] text-white hover:border-white/10 hover:bg-white/5"
                                    }`}
                                >
                                    <div className="p-4 flex flex-col items-center gap-1 relative z-10">
                                        <p className={`text-[9px] font-black uppercase tracking-widest ${isSelected ? 'text-black/60' : 'text-slate-500'}`}>
                                            {dateDayLabel(date, today).split(',')[0]}
                                        </p>
                                        <p className="text-3xl font-black italic leading-none tracking-tighter transition-transform group-hover:scale-110">
                                            {d.getDate()}
                                        </p>
                                        <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${isSelected ? 'text-black/40' : 'text-slate-600'}`}>
                                            {d.toLocaleDateString([], { month: 'short' })}
                                        </p>
                                    </div>
                                    {isSelected && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-black rounded-full mb-1 animate-pulse" />}
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* Session Timeline */}
                <section className="space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">SESSION TIMELINE</h2>
                        <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">
                            {props.sessions.length} BLOCKS SCHEDULED
                        </div>
                    </div>

                    {props.sessLoading ? (
                        <div className="space-y-4">
                            {[1,2,3].map((i) => <div key={i} className="h-40 rounded-[2.5rem] bg-white/5 animate-pulse" />)}
                        </div>
                    ) : props.sessions.length === 0 ? (
                        <div className="rounded-[2.5rem] border border-white/5 border-dashed bg-[#0a111a]/40 p-20 text-center space-y-6">
                            <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest italic">No active operations scheduled for this cycle.</p>
                            {props.isAdmin && (
                                <button onClick={props.onToggleForm} className="px-8 py-3.5 bg-white text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-cyan-50 transition-all">
                                    Initiate Session
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-10">
                            {groupedSlots.map(([slot, slotSessions]) => (
                                <section key={slot} className="relative group">
                                    <div className="absolute left-[34px] top-10 bottom-0 w-[1px] bg-white/5 group-last:hidden" />
                                    <div className="flex items-center gap-6 mb-6">
                                        <div className="w-[70px] h-[70px] shrink-0 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 flex items-center justify-center shadow-lg shadow-cyan-500/5 relative z-10 backdrop-blur-md">
                                            <span className="text-[10px] font-black text-cyan-400 uppercase italic tracking-tighter">{fmtHour(slot)}</span>
                                        </div>
                                        <div className="h-px flex-1 bg-white/5" />
                                        <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">
                                            {slotSessions.length} SUB-BLOCKS
                                        </div>
                                    </div>
                                    <div className="pl-10 space-y-4">
                                        {slotSessions.map((session) => (
                                            <SessionCardItem key={session.id} session={session} joining={props.joiningId === session.id} onJoin={() => props.onJoinSession(session.id)} />
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <aside className="space-y-8 xl:sticky xl:top-24 self-start">
                {/* Admin / Info Panel */}
                <section className="bg-[#0a111a]/80 backdrop-blur-xl border border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-8 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-emerald-500 opacity-50" />
                    <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500">{props.isAdmin ? "OPERATOR CONSOLE" : "DEPLOYMENT NOTES"}</p>
                        <h3 className="text-xl font-black text-white uppercase italic tracking-tight">{props.isAdmin ? "Control Center" : "Tactical Brief"}</h3>
                    </div>

                    {props.isAdmin ? (
                        <div className="space-y-6">
                            <button 
                                onClick={props.onToggleForm} 
                                className={`w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                    props.showForm 
                                        ? "border border-white/10 text-white hover:bg-white/5" 
                                        : "bg-white text-black hover:bg-cyan-50 shadow-lg shadow-white/5"
                                }`}
                            >
                                {props.showForm ? "Close Interface" : "Schedule Deployment"}
                            </button>
                            
                            {props.showForm && (
                                <form onSubmit={props.onCreateSession} className="space-y-6 animate-in fade-in slide-in-from-top-4">
                                    <div className="space-y-4">
                                        <Field label={sportLocked ? "Primary Protocol" : "Protocol"}>
                                            {sportLocked ? (
                                                <div className="space-y-2">
                                                    <div className="px-4 py-3 rounded-xl border border-white/5 bg-white/[0.02] text-[10px] font-black text-slate-400 uppercase italic">
                                                        {sportLabel(sportOptions[0])}
                                                    </div>
                                                </div>
                                            ) : (
                                                <select value={props.formSport} onChange={(e) => props.setFormSport(e.target.value)} className={fieldClass}>
                                                    {sportOptions.map((sport) => <option key={sport} value={sport}>{sportLabel(sport)}</option>)}
                                                </select>
                                            )}
                                        </Field>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Field label="Format">
                                                <select value={props.formMatchFormat} onChange={(e) => props.setFormMatchFormat(e.target.value)} className={fieldClass}>
                                                    <option value="doubles">Doubles</option>
                                                    <option value="mixed_doubles">Mixed</option>
                                                    <option value="singles">Singles</option>
                                                </select>
                                            </Field>
                                            <Field label="Max Units">
                                                <input required type="number" min="2" value={props.formMax} onChange={(e) => props.setFormMax(e.target.value)} className={fieldClass} />
                                            </Field>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Field label="Start">
                                                <input required type="time" value={props.formDate} min={props.openingTime} max={props.closingTime} onChange={(e) => props.setFormDate(e.target.value)} className={fieldClass} />
                                            </Field>
                                            <Field label="End">
                                                <input required type="time" value={props.formEndTime} min={props.openingTime} max={props.closingTime} onChange={(e) => props.setFormEndTime(e.target.value)} className={fieldClass} />
                                            </Field>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <Field label="Min Rating">
                                                <input type="number" value={props.formSkillMin} onChange={(e) => props.setFormSkillMin(e.target.value)} className={fieldClass} placeholder="Any" />
                                            </Field>
                                            <Field label="Max Rating">
                                                <input type="number" value={props.formSkillMax} onChange={(e) => props.setFormSkillMax(e.target.value)} className={fieldClass} placeholder="Any" />
                                            </Field>
                                        </div>
                                        <Field label="Credit / Fee (₱)">
                                            <input type="number" min="0" step="0.01" value={props.formPrice} onChange={(e) => props.setFormPrice(e.target.value)} className={fieldClass} />
                                        </Field>
                                    </div>
                                    <button 
                                        type="submit" 
                                        disabled={props.formSubmitting} 
                                        className="w-full py-4 bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-cyan-500/20 transition-all disabled:opacity-50"
                                    >
                                        {props.formSubmitting ? "TRANSMITTING..." : "PUBLISH BLOCK"}
                                    </button>
                                </form>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol 01</p>
                                <p className="text-xs text-slate-400 italic leading-relaxed">Ensure neural sync is optimal before requesting session entry.</p>
                            </div>
                            <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol 02</p>
                                <p className="text-xs text-slate-400 italic leading-relaxed">Waitlist deployment will activate automatically if primary slots are engaged.</p>
                            </div>
                        </div>
                    )}
                </section>
            </aside>
        </div>
    );
}

function MiniStat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
    return (
        <div className={`p-5 rounded-2xl border transition-all ${highlight ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-white/[0.02] border-white/5'}`}>
            <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${highlight ? 'text-cyan-400' : 'text-slate-500'}`}>{label}</p>
            <p className="text-2xl font-black italic tracking-tighter text-white">{value}</p>
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return <label className="flex flex-col gap-2"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">{label}</span>{children}</label>;
}

function SessionCardItem({ session, joining, onJoin }: { session: SessionCard; joining: boolean; onJoin: () => void }) {
    const theme = SPORT_THEME[session.sport] ?? SPORT_THEME.pickleball;
    const slotsLeft = Math.max(0, session.max_players - session.confirmed_count);
    const isFull = slotsLeft <= 0;
    const fill = session.max_players > 0 ? Math.min(100, Math.round((session.confirmed_count / session.max_players) * 100)) : 0;
    
    return (
        <article className="group relative overflow-hidden rounded-2xl border border-white/5 bg-[#0a111a]/80 backdrop-blur-md shadow-2xl transition-all hover:border-white/10">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.01] to-transparent -translate-x-full group-hover:animate-shimmer" />
            
            <div className="p-5 lg:p-6 flex flex-col md:flex-row md:items-center gap-6 relative z-10">
                {/* Icon & Primary Info */}
                <div className="flex-1 flex gap-5 min-w-0">
                    <div className="relative shrink-0">
                        <div className={`absolute inset-0 ${theme.tint} blur-lg rounded-full opacity-40`} />
                        <div className={`w-14 h-14 shrink-0 rounded-xl border ${theme.border} ${theme.tint} flex items-center justify-center text-2xl shadow-lg relative overflow-hidden group-hover:scale-105 transition-transform`}>
                            {session.sport_emoji}
                        </div>
                    </div>

                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <h3 className="text-lg font-black text-white uppercase italic tracking-tight truncate">{session.title}</h3>
                            <div className="flex items-center gap-2">
                                <span className="w-1 h-1 rounded-full bg-slate-800" />
                                <span className={`text-[9px] font-black ${theme.text} uppercase tracking-[0.2em]`}>
                                    {sportLabel(session.sport)}
                                </span>
                            </div>
                            {session.status === "ongoing" && (
                                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 text-[7px] font-black text-emerald-400 uppercase tracking-widest">
                                    <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
                                    ENGAGED
                                </span>
                            )}
                        </div>
                        
                        {/* Sub-details */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                            <DetailItem label="UNIT" value={session.court_name ?? "TBD"} />
                            <DetailItem label="FEE" value={session.price_per_head > 0 ? `₱${session.price_per_head}` : "FREE"} />
                            <DetailItem label="RATING" value={formatSkillRange(session.skill_min, session.skill_max)} />
                        </div>
                    </div>
                </div>

                {/* Capacity & Action */}
                <div className="shrink-0 flex flex-col md:items-end gap-4 min-w-[200px]">
                    <div className="w-full md:w-48 space-y-2">
                        <div className="flex justify-between items-end text-[8px] font-black uppercase tracking-widest">
                            <span className={isFull ? 'text-rose-500' : 'text-slate-500'}>
                                {isFull ? 'DEPLOYMENT FULL' : `${slotsLeft} SLOTS VACANT`}
                            </span>
                            <span className="text-white italic">{session.confirmed_count} / {session.max_players}</span>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden p-px border border-white/5">
                            <div className={`h-full rounded-full bg-gradient-to-r ${theme.progress} shadow-[0_0_8px_rgba(255,255,255,0.1)]`} style={{ width: `${fill}%` }} />
                        </div>
                    </div>

                    <div className="flex gap-2 w-full">
                        <Link href={`/open-play/${session.id}`} className="flex-1 px-4 py-2.5 border border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-white rounded-lg text-center hover:bg-white/10 transition-all">
                            BRIEF
                        </Link>
                        {session.is_joined ? (
                            <div className="flex-1 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase tracking-[0.2em] rounded-lg text-center backdrop-blur-sm">
                                JOINED
                            </div>
                        ) : (
                            <button 
                                onClick={onJoin} 
                                disabled={joining} 
                                className="flex-1 px-4 py-2.5 bg-white text-black text-[9px] font-black uppercase tracking-[0.2em] rounded-lg text-center hover:bg-cyan-50 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                            >
                                {joining ? "SYNCING..." : isFull ? "WAITLIST" : "ENGAGE"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </article>
    );
}

function DetailItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-[7px] font-black text-slate-600 uppercase tracking-[0.2em]">{label}:</span>
            <span className="text-[9px] font-black text-slate-300 uppercase italic tracking-wider">{value}</span>
        </div>
    );
}
