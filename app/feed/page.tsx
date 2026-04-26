"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getAccessToken, clearAuthSession, isUnauthorized } from "@/lib/auth";
import Link from "next/link";
import Image from "next/image";
import NavBar from "@/components/NavBar";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Author {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
}

interface PreviewComment {
    id: string;
    content: string;
    created_at: string;
    parent_id: string | null;
    author: Omit<Author, "id">;
}

interface Post {
    id: string;
    post_type: "manual" | "match_result" | "tournament_update" | "open_play_invite" | "announcement";
    content: string | null;
    image_url: string | null;
    meta: Record<string, unknown> | null;
    is_pinned: boolean;
    created_at: string;
    author: Author | null;
    club_id: string | null;
    tournament_id: string | null;
    match_id: string | null;
    open_play_id: string | null;
    club_name: string | null;
    club_logo: string | null;
    reaction_counts: Record<string, number>;
    my_reaction: string | null;
    comment_count: number;
    preview_comments: PreviewComment[];
}

interface Comment {
    id: string;
    content: string;
    created_at: string;
    parent_id: string | null;
    author: Author;
}

interface Me {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = [
    { value: "all",         label: "All Activity" },
    { value: "clubs",       label: "Facilities" },
    { value: "tournaments", label: "Tournaments" },
    { value: "matches",     label: "Matches" },
    { value: "following",   label: "Network" },
] as const;

const POST_TYPES = [
    { type: "manual",            icon: "📝", label: "Post" },
    { type: "match_result",      icon: "🎯", label: "Match Result" },
    { type: "tournament_update", icon: "🏆", label: "Tournament Update" },
    { type: "open_play_invite",  icon: "📍", label: "Open Play" },
    { type: "announcement",      icon: "📢", label: "Announcement" },
] as const;

const REACTIONS = [
    { key: "like",    emoji: "👍", label: "Like" },
    { key: "hype",    emoji: "🔥", label: "Hype" },
    { key: "respect", emoji: "👏", label: "Respect" },
    { key: "strong",  emoji: "💪", label: "Strong" },
    { key: "skill",   emoji: "🎯", label: "Skill" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return "Just Now";
    if (m < 60) return `${m}M AGO`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}H AGO`;
    return `${Math.floor(h / 24)}D AGO`;
}

function displayName(a: Pick<Author, "first_name" | "last_name">): string {
    return [a.first_name, a.last_name].filter(Boolean).join(" ") || "Unknown";
}

function totalReactions(counts: Record<string, number> | null | undefined): number {
    if (!counts) return 0;
    return Object.values(counts).reduce((s, n) => s + n, 0);
}

// ── Components ────────────────────────────────────────────────────────────────

function HUDCorner({ className = "" }: { className?: string }) {
    return (
        <div className={`absolute w-2 h-2 border-t border-l border-cyan-500/30 ${className}`} />
    );
}

function SidebarTab({ href, label, icon, active }: { href: string; label: string; icon: string; active: boolean }) {
    return (
        <Link href={href} className={`flex items-center gap-4 px-4 py-2.5 rounded-2xl transition-all group ${active ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"}`}>
            <span className={`text-lg group-hover:scale-110 transition-transform ${active ? "opacity-100" : "opacity-50"}`}>{icon}</span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">{label}</span>
            {active && <div className="ml-auto w-1 h-1 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,1)]" />}
        </Link>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FeedPage() {
    const router = useRouter();
    const pathname = usePathname();

    const [me,          setMe]          = useState<Me | null>(null);
    const [posts,       setPosts]       = useState<Post[]>([]);
    const [loading,     setLoading]     = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore,     setHasMore]     = useState(false);
    const [tab,         setTab]         = useState<string>("all");
    
    const [createContent,  setCreateContent]  = useState("");
    const [createType,     setCreateType]     = useState<string>("manual");
    const [createBusy,     setCreateBusy]     = useState(false);
    const [showTypeBar,    setShowTypeBar]    = useState(false);

    const [sidebarMatches,     setSidebarMatches]     = useState<{id:string;name:string;sport:string;status:string}[]>([]);
    const [sidebarTournaments, setSidebarTournaments] = useState<{id:string;name:string;sport:string;status:string;participant_count:number;max_participants:number}[]>([]);

    const cursorRef = useRef<string | null>(null);

    const fetchFeed = useCallback(async (activeTab: string, reset = false) => {
        const token = getAccessToken();
        if (!token) { router.replace("/login"); return; }
        if (reset) { cursorRef.current = null; setLoading(true); }
        else setLoadingMore(true);

        const params = new URLSearchParams({ tab: activeTab, limit: "15" });
        if (!reset && cursorRef.current) params.set("before", cursorRef.current);

        const res = await fetch(`/api/feed?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (isUnauthorized(res.status)) { clearAuthSession(); router.replace("/login"); return; }
        if (res.ok) {
            const d = await res.json();
            const newPosts: Post[] = d.posts ?? [];
            setPosts(prev => reset ? newPosts : [...prev, ...newPosts]);
            setHasMore(d.has_more ?? false);
            if (newPosts.length > 0)
                cursorRef.current = newPosts[newPosts.length - 1].created_at;
        }
        setLoading(false);
        setLoadingMore(false);
    }, [router]);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;
        fetch("/api/players/me", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null)
            .then(d => d && setMe({ id: d.id, first_name: d.first_name, last_name: d.last_name, avatar_url: d.avatar_url }))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;
        const h = { Authorization: `Bearer ${token}` };
        fetch("/api/matches?status=ongoing&limit=3", { headers: h })
            .then(r => r.ok ? r.json() : null)
            .then(d => d && setSidebarMatches(d.matches ?? []))
            .catch(() => {});
        fetch("/api/tournaments?status=upcoming&limit=5", { headers: h })
            .then(r => r.ok ? r.json() : null)
            .then(d => d && setSidebarTournaments(d.tournaments ?? []))
            .catch(() => {});
    }, []);

    useEffect(() => { fetchFeed(tab, true); }, [tab, fetchFeed]);

    const handleCreatePost = async () => {
        if (!createContent.trim()) return;
        const token = getAccessToken();
        if (!token) return;
        setCreateBusy(true);
        const res = await fetch("/api/feed", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ post_type: createType, content: createContent.trim() }),
        });
        if (res.ok) {
            const d = await res.json();
            setPosts(prev => [d.post, ...prev]);
            setCreateContent("");
            setCreateType("manual");
            setShowTypeBar(false);
        }
        setCreateBusy(false);
    };

    const handleReact = async (postId: string, reaction: string) => {
        const token = getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/feed/${postId}/react`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ reaction }),
        });
        if (res.ok) {
            const d = await res.json();
            setPosts(prev => prev.map(p => {
                if (p.id !== postId) return p;
                const counts = { ...p.reaction_counts };
                if (p.my_reaction) counts[p.my_reaction] = Math.max(0, (counts[p.my_reaction] ?? 0) - 1);
                if (d.action === "removed") return { ...p, reaction_counts: counts, my_reaction: null };
                counts[reaction] = (counts[reaction] ?? 0) + 1;
                return { ...p, reaction_counts: counts, my_reaction: reaction };
            }));
        }
    };

    const handleDelete = async (postId: string) => {
        const token = getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/feed/${postId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setPosts(prev => prev.filter(p => p.id !== postId));
    };

    return (
        <div className="min-h-screen bg-[#050b14] text-white selection:bg-cyan-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,36,60,0.4)_0%,transparent_50%)]" />
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                <div className="absolute inset-0 animate-scanline pointer-events-none opacity-[0.01] bg-[linear-gradient(transparent,rgba(255,255,255,0.5),transparent)] h-20" />
            </div>

            <NavBar />

            <main className="relative z-10 max-w-[1600px] mx-auto px-4 py-8 pb-32 pt-24">
                <div className="flex flex-col lg:flex-row gap-8">
                    
                    {/* LEFT SIDEBAR: Navigation (Command Center) */}
                    <aside className="hidden lg:block w-64 shrink-0 space-y-6 sticky top-24 self-start max-h-[calc(100vh-120px)] overflow-y-auto no-scrollbar pb-8">
                        {/* Identity Module */}
                        <div className="flex flex-col items-center text-center space-y-4 px-4">
                            <div className="relative group">
                                <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full opacity-50" />
                                <div className="relative w-16 h-16 rounded-[1.2rem] border border-white/10 overflow-hidden bg-[#0a111a] shadow-xl">
                                    {me?.avatar_url ? (
                                        <Image src={me.avatar_url} alt="Avatar" fill className="object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-xl font-black text-cyan-500 bg-cyan-500/5">
                                            {me?.first_name?.[0]?.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white uppercase italic tracking-tight leading-tight">{me?.first_name} {me?.last_name}</h3>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-0.5">{me?.first_name} {me?.last_name}</p>
                            </div>
                        </div>

                        <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-3 space-y-1">
                            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 px-4 mb-3 mt-2">Command Center</h2>
                            <SidebarTab href="/dashboard" label="HQ" icon="🏠" active={pathname === "/dashboard"} />
                            <SidebarTab href="/feed" label="Insights" icon="📡" active={pathname.startsWith("/feed")} />
                            <SidebarTab href="/matches" label="Matches" icon="🎾" active={pathname.startsWith("/matches") && !pathname.includes("queue") && !pathname.includes("party")} />
                            <SidebarTab href="/matches/queue" label="Queue" icon="⚡" active={pathname.includes("queue")} />
                            <SidebarTab href="/clubs" label="Facilities" icon="🏢" active={pathname.startsWith("/clubs")} />
                            <SidebarTab href="/tournaments" label="Tournaments" icon="🏆" active={pathname.startsWith("/tournaments")} />
                            <SidebarTab href="/leaderboard" label="Rankings" icon="📊" active={pathname.startsWith("/leaderboard")} />
                            <SidebarTab href="/friends" label="Network" icon="👥" active={pathname.startsWith("/friends")} />
                        </section>
                    </aside>

                    {/* CENTRAL CONTENT: Feed */}
                    <div className="flex-1 space-y-8 min-w-0">
                        
                        {/* Create Post Section */}
                        <section className="relative p-6 lg:p-8 rounded-[2.5rem] border border-white/5 bg-[#0a111a]/80 backdrop-blur-xl shadow-2xl overflow-hidden">
                            <HUDCorner className="top-6 left-6" />
                            <HUDCorner className="top-6 right-6 rotate-90" />
                            <div className="flex gap-4">
                                <div className="relative shrink-0">
                                    <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 overflow-hidden">
                                        {me?.avatar_url ? <Image src={me.avatar_url} alt="Me" fill className="object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-black text-slate-500">{me?.first_name?.[0]?.toUpperCase()}</div>}
                                    </div>
                                </div>
                                <div className="flex-1 space-y-4">
                                    <textarea
                                        rows={showTypeBar || createContent ? 3 : 1}
                                        value={createContent}
                                        onChange={e => setCreateContent(e.target.value)}
                                        onFocus={() => setShowTypeBar(true)}
                                        placeholder="Share updates with the community..."
                                        className="w-full bg-white/5 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/30 transition-all resize-none font-medium"
                                    />
                                    {(showTypeBar || createContent) && (
                                        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="flex flex-wrap gap-2">
                                                {POST_TYPES.map(pt => (
                                                    <button
                                                        key={pt.type}
                                                        onClick={() => setCreateType(pt.type)}
                                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                                            createType === pt.type
                                                                ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                                                                : "bg-white/5 text-slate-500 border-transparent hover:text-slate-300"
                                                        }`}
                                                    >
                                                        <span>{pt.icon}</span>
                                                        {pt.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                                                <button onClick={() => { setCreateContent(""); setShowTypeBar(false); }} className="text-[9px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors">Abort</button>
                                                <button
                                                    onClick={handleCreatePost}
                                                    disabled={!createContent.trim() || createBusy}
                                                    className="px-6 py-2 bg-white text-black text-[9px] font-black uppercase tracking-[0.2em] rounded-xl hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50"
                                                >
                                                    {createBusy ? "Transmitting..." : "Send Broadcast"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* Intelligence Tabs */}
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-2">
                            {TABS.map(t => (
                                <button
                                    key={t.value}
                                    onClick={() => setTab(t.value)}
                                    className={`px-5 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border whitespace-nowrap ${
                                        tab === t.value
                                            ? "bg-white text-black border-white"
                                            : "bg-[#0a111a]/60 text-slate-500 border-white/5 hover:border-white/10 hover:text-slate-300"
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Posts Feed */}
                        <div className="space-y-6">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-32 space-y-4">
                                    <div className="w-12 h-12 border-2 border-cyan-500/20 border-t-cyan-500 rounded-full animate-spin" />
                                    <p className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.3em] animate-pulse">Loading Feed...</p>
                                </div>
                            ) : posts.length === 0 ? (
                                <div className="relative rounded-[3rem] border border-dashed border-white/10 bg-white/[0.02] py-32 text-center overflow-hidden">
                                    <div className="relative z-10 space-y-4">
                                        <div className="text-5xl opacity-20">📡</div>
                                        <p className="text-xs font-black text-slate-500 uppercase tracking-[0.3em]">No Updates Found</p>
                                        <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest">The sector is currently silent.</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {posts.map(post => (
                                        <PostCard key={post.id} post={post} meId={me?.id ?? ""} onReact={handleReact} onDelete={handleDelete} />
                                    ))}
                                    {hasMore && (
                                        <button
                                            onClick={() => fetchFeed(tab, false)}
                                            disabled={loadingMore}
                                            className="w-full py-6 bg-[#0a111a]/40 hover:bg-[#0a111a]/60 border border-white/5 rounded-[2rem] text-[10px] font-black text-slate-500 hover:text-cyan-400 uppercase tracking-[0.4em] transition-all disabled:opacity-50"
                                        >
                                            {loadingMore ? "Syncing..." : "Show More"}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* RIGHT SIDEBAR: Tactical Intel */}
                    <aside className="hidden xl:block w-72 shrink-0 space-y-6 sticky top-24 self-start max-h-[calc(100vh-120px)] overflow-y-auto no-scrollbar pb-8">
                        {/* Live Operations */}
                        {sidebarMatches.length > 0 && (
                            <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] overflow-hidden">
                                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Live Matches</h3>
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                </div>
                                <div className="p-4 space-y-3">
                                    {sidebarMatches.map(m => (
                                        <Link key={m.id} href={`/matches/${m.id}`} className="block group">
                                            <div className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-transparent group-hover:border-white/10 group-hover:bg-white/10 transition-all">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[9px] font-black text-white uppercase truncate group-hover:text-cyan-400">{m.name ?? "Match in progress"}</p>
                                                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">{m.sport?.replace("_", " ")}</p>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Tournament Radar */}
                        {sidebarTournaments.length > 0 && (
                            <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] overflow-hidden">
                                <div className="p-5 border-b border-white/5">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Tournament Radar</h3>
                                </div>
                                <div className="p-4 space-y-3">
                                    {sidebarTournaments.map(t => (
                                        <Link key={t.id} href={`/tournaments/${t.id}`} className="block group">
                                            <div className="p-3 rounded-xl bg-white/5 border border-transparent group-hover:border-white/10 group-hover:bg-white/10 transition-all">
                                                <p className="text-[9px] font-black text-white uppercase truncate group-hover:text-cyan-400">{t.name}</p>
                                                <div className="flex items-center justify-between mt-2">
                                                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{t.sport?.replace("_", " ")}</span>
                                                    <span className="text-[8px] font-black text-cyan-500 uppercase tracking-widest">{t.participant_count}/{t.max_participants} Units</span>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                                <Link href="/tournaments" className="p-3 bg-white/5 text-[9px] font-black uppercase text-center text-slate-500 hover:text-white block transition-colors border-t border-white/5">All Tournaments →</Link>
                            </section>
                        )}

                        {/* Quick Actions */}
                        <section className="bg-[#0a111a]/60 backdrop-blur-md border border-white/5 rounded-[2rem] p-6">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6">Quick Actions</h3>
                            <div className="space-y-4">
                                {[
                                    { href: "/clubs", icon: "🏙️", label: "Facilities" },
                                    { href: "/matches/new", icon: "⚡", label: "Instant Match" },
                                    { href: "/tournaments/new", icon: "🏆", label: "New Tournament" },
                                ].map(link => (
                                    <Link key={link.href} href={link.href} className="flex items-center gap-3 group">
                                        <span className="text-lg group-hover:scale-110 transition-transform">{link.icon}</span>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] group-hover:text-white transition-colors">{link.label}</span>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    </aside>

                </div>
            </main>
        </div>
    );
}

// ── Post Card Component ───────────────────────────────────────────────────────

function PostCard({ post, meId, onReact, onDelete }: { post: Post; meId: string; onReact: (id: string, r: string) => void; onDelete: (id: string) => void }) {
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentsLoaded, setCommentsLoaded] = useState(false);
    const [commentInput, setCommentInput] = useState("");
    const [commentBusy, setCommentBusy] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const toggleComments = async () => {
        if (!showComments && !commentsLoaded) {
            const token = getAccessToken();
            if (!token) return;
            const res = await fetch(`/api/feed/${post.id}/comments`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) {
                const d = await res.json();
                setComments(d.comments ?? []);
                setCommentsLoaded(true);
            }
        }
        setShowComments(!showComments);
    };

    const submitComment = async () => {
        if (!commentInput.trim()) return;
        const token = getAccessToken();
        if (!token) return;
        setCommentBusy(true);
        const res = await fetch(`/api/feed/${post.id}/comments`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ content: commentInput.trim() }),
        });
        if (res.ok) {
            const d = await res.json();
            setComments(prev => [...prev, d.comment]);
            setCommentInput("");
        }
        setCommentBusy(false);
    };

    return (
        <div className={`relative bg-[#0a111a]/60 backdrop-blur-md border rounded-[2rem] overflow-hidden transition-all duration-300 group ${post.is_pinned ? "border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]" : "border-white/5 hover:border-white/10"}`}>
            <div className="p-6 space-y-4">
                {/* Post Header */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-xl bg-white/5 border border-white/5 overflow-hidden">
                            {post.author?.avatar_url ? <img src={post.author.avatar_url} alt="Avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs font-black text-slate-500">{post.author?.first_name?.[0]?.toUpperCase()}</div>}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-black text-white uppercase italic tracking-tight">{displayName(post.author || { first_name: null, last_name: null })}</span>
                                {post.is_pinned && <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">Pinned</span>}
                                <PostTypeBadge type={post.post_type} />
                            </div>
                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">{displayName(post.author || { first_name: null, last_name: null })} • {timeAgo(post.created_at)}</p>
                        </div>
                    </div>
                    {post.author?.id === meId && (
                        <div className="relative" ref={menuRef}>
                            <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-slate-600 hover:text-white transition-colors rounded-xl hover:bg-white/5">•••</button>
                            {showMenu && (
                                <div className="absolute right-0 top-10 w-40 bg-[#0a111a] border border-white/10 rounded-2xl shadow-2xl z-20 py-1 overflow-hidden">
                                    <button onClick={() => { setShowMenu(false); onDelete(post.id); }} className="w-full text-left px-4 py-2.5 text-[10px] font-black uppercase text-rose-500 hover:bg-rose-500/10 transition-colors">Delete Post</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Post Content */}
                <div className="space-y-4">
                    {post.content && <p className="text-sm text-slate-200 font-medium leading-relaxed">{post.content}</p>}
                    {post.image_url && <img src={post.image_url} alt="Intel" className="w-full rounded-2xl object-cover max-h-96 border border-white/5" />}
                    
                    {post.post_type === "match_result" && post.meta && <MatchResultCard meta={post.meta} matchId={post.match_id} />}
                </div>

                {/* Engagement Bar */}
                <div className="flex items-center gap-4 pt-4 border-t border-white/5">
                    <button onClick={() => onReact(post.id, post.my_reaction ? post.my_reaction : "like")} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${post.my_reaction ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "bg-white/5 text-slate-500 hover:text-white"}`}>
                        <span>{post.my_reaction ? (REACTIONS.find(r => r.key === post.my_reaction)?.emoji ?? "👍") : "👍"}</span>
                        {totalReactions(post.reaction_counts)} Reactions
                    </button>
                    <button onClick={toggleComments} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest bg-white/5 text-slate-500 hover:text-white transition-all">
                        <span>💬</span> {post.comment_count} Comments
                    </button>
                </div>

                {/* Comments Section */}
                {showComments && (
                    <div className="space-y-4 pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-3">
                            {comments.map(c => (
                                <div key={c.id} className="flex gap-3">
                                    <div className="relative w-7 h-7 rounded-lg bg-white/5 border border-white/5 overflow-hidden shrink-0">
                                        {c.author?.avatar_url ? <img src={c.author.avatar_url} alt="C" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] font-black text-slate-600">{c.author?.first_name?.[0]?.toUpperCase()}</div>}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="bg-white/5 rounded-2xl px-4 py-2">
                                            <p className="text-[9px] font-black text-cyan-500 uppercase tracking-widest mb-1">{displayName(c.author)}</p>
                                            <p className="text-xs text-slate-300 font-medium">{c.content}</p>
                                        </div>
                                        <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest px-2">{timeAgo(c.created_at)}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2 pt-2">
                            <input
                                value={commentInput}
                                onChange={e => setCommentInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") submitComment(); }}
                                placeholder="Add your comment..."
                                className="flex-1 bg-white/5 border border-white/5 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-700 focus:outline-none focus:border-cyan-500/30 transition-all"
                            />
                            <button onClick={submitComment} disabled={!commentInput.trim() || commentBusy} className="px-4 py-2 bg-white text-black text-[9px] font-black uppercase tracking-widest rounded-xl disabled:opacity-50">Post</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function PostTypeBadge({ type }: { type: string }) {
    const cfg: Record<string, { label: string; color: string }> = {
        match_result:      { label: "Match Result",  color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
        tournament_update: { label: "Tournament",    color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
        open_play_invite:  { label: "Open Play",     color: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
        announcement:      { label: "Broadcast",    color: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
    };
    const c = cfg[type];
    if (!c) return null;
    return <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${c.color}`}>{c.label}</span>;
}

function MatchResultCard({ meta, matchId }: { meta: Record<string, unknown>; matchId: string | null }) {
    return (
        <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 text-center space-y-2">
                    <p className="text-[10px] font-black text-white uppercase truncate">{String(meta.player_a_name ?? meta.team_a_name ?? "Team A")}</p>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SR {String(meta.player_a_rating ?? "1500")}</p>
                </div>
                <div className="flex flex-col items-center">
                    <div className="flex items-center gap-3">
                        <span className="text-3xl font-black text-white italic">{String(meta.score_a ?? "0")}</span>
                        <span className="text-[10px] font-black text-slate-600 uppercase">vs</span>
                        <span className="text-3xl font-black text-white italic">{String(meta.score_b ?? "0")}</span>
                    </div>
                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] mt-2">{String(meta.sport ?? "").replace("_", " ")}</span>
                </div>
                <div className="flex-1 text-center space-y-2">
                    <p className="text-[10px] font-black text-white uppercase truncate">{String(meta.player_b_name ?? meta.team_b_name ?? "Team B")}</p>
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">SR {String(meta.player_b_rating ?? "1500")}</p>
                </div>
            </div>
            {matchId && <Link href={`/matches/${matchId}`} className="block text-center text-[9px] font-black text-cyan-500 uppercase tracking-[0.2em] hover:text-white transition-colors">Match Details →</Link>}
        </div>
    );
}
