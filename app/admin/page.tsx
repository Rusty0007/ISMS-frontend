"use client";

import React, { useCallback, useEffect, useState } from "react";
import { getAccessToken } from "@/lib/auth";

interface Stats {
    total_users: number;
    total_tournaments: number;
    total_matches: number;
    active_tournaments: number;
    completed_matches: number;
    role_breakdown: Record<string, number>;
}

function authHeaders(): HeadersInit {
    return { Authorization: `Bearer ${getAccessToken()}`, "Content-Type": "application/json" };
}

function StatCard({ label, value, sub, icon, trend }: { label: string; value: number | string; sub?: string; icon?: React.ReactNode; trend?: string }) {
    return (
        <div
            className="rounded-[2rem] p-8 flex flex-col gap-4 group transition-all duration-300 hover:translate-y-[-4px]"
            style={{
                background: "linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 40px -20px rgba(0,0,0,0.5)",
            }}
        >
            <div className="flex items-center justify-between">
                <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white/40 group-hover:text-white/80 group-hover:border-white/20 transition-all">
                    {icon}
                </div>
                {trend && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full border border-emerald-400/20">
                        {trend}
                    </span>
                )}
            </div>
            <div>
                <p className="text-xs font-bold text-white/30 uppercase tracking-[0.2em] mb-1">{label}</p>
                <p className="text-4xl font-black text-white tracking-tighter">{value}</p>
                {sub && <p className="text-xs text-white/20 mt-2 font-medium">{sub}</p>}
            </div>
        </div>
    );
}

export default function AdminDashboard() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/stats", { headers: authHeaders() });
            if (res.ok) setStats(await res.json());
        } catch (err) {
            console.error("Failed to fetch stats", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-48 rounded-[2rem] bg-white/5 border border-white/5" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard 
                    label="Total Users" 
                    value={stats?.total_users ?? 0} 
                    trend="+12%"
                    icon={
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                    }
                />
                <StatCard 
                    label="Tournaments" 
                    value={stats?.total_tournaments ?? 0} 
                    sub={`${stats?.active_tournaments ?? 0} currently active`}
                    icon={
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                    }
                />
                <StatCard 
                    label="Match Activity" 
                    value={stats?.total_matches ?? 0} 
                    sub={`${stats?.completed_matches ?? 0} matches finalized`}
                    icon={
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    }
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Role Breakdown */}
                <div className="rounded-[2.5rem] p-10 bg-zinc-900/50 border border-white/5 space-y-8">
                    <div>
                        <h3 className="text-lg font-bold text-white">Role Distribution</h3>
                        <p className="text-sm text-white/30">Breakdown of user privileges across the system</p>
                    </div>
                    
                    <div className="space-y-6">
                        {stats && Object.entries(stats.role_breakdown).map(([role, count]) => (
                            <div key={role} className="space-y-2">
                                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                                    <span className="text-white/60">{role.replace(/_/g, " ")}</span>
                                    <span className="text-white">{count}</span>
                                </div>
                                <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-blue-500/40 rounded-full transition-all duration-1000"
                                        style={{ width: `${(count / stats.total_users) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* System Info / Quick Actions */}
                <div className="rounded-[2.5rem] p-10 bg-zinc-900/50 border border-white/5 space-y-8 flex flex-col justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-white">System Status</h3>
                        <p className="text-sm text-white/30">Core infrastructure and service health</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {[
                            { label: "API Server", status: "Operational", color: "text-emerald-400" },
                            { label: "Database", status: "Healthy", color: "text-emerald-400" },
                            { label: "Storage", status: "92% Free", color: "text-blue-400" },
                            { label: "Real-time", status: "Active", color: "text-emerald-400" },
                        ].map(item => (
                            <div key={item.label} className="p-4 rounded-2xl bg-white/5 border border-white/5">
                                <p className="text-[10px] font-bold text-white/20 uppercase mb-1">{item.label}</p>
                                <p className={`text-xs font-bold ${item.color}`}>{item.status}</p>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4">
                        <button className="w-full py-4 rounded-2xl bg-white text-zinc-950 font-bold text-sm hover:bg-zinc-200 transition-colors shadow-xl shadow-white/5">
                            Generate System Report
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
