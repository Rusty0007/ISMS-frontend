"use client";

import React from "react";

export default function SettingsAdminPage() {
    return (
        <div className="space-y-10">
            <div className="max-w-4xl space-y-8">
                <section className="space-y-4">
                    <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest">General Configuration</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-4 opacity-50 cursor-not-allowed">
                            <div>
                                <p className="text-sm font-bold text-white">System Name</p>
                                <p className="text-xs text-white/30">Display name for the platform</p>
                            </div>
                            <input disabled value="ISMS Professional" className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2 text-sm text-white/50" />
                        </div>
                        <div className="p-6 rounded-2xl bg-white/5 border border-white/5 space-y-4 opacity-50 cursor-not-allowed">
                            <div>
                                <p className="text-sm font-bold text-white">Maintenance Mode</p>
                                <p className="text-xs text-white/30">Restrict access to admins only</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-6 bg-zinc-800 rounded-full p-1 transition-all">
                                    <div className="w-4 h-4 bg-zinc-600 rounded-full" />
                                </div>
                                <span className="text-xs text-white/30 font-bold uppercase">Disabled</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="space-y-4">
                    <h3 className="text-sm font-bold text-white/40 uppercase tracking-widest">Security & Authentication</h3>
                    <div className="p-6 rounded-[2rem] bg-zinc-900/50 border border-white/5 space-y-6">
                        <div className="flex items-center justify-between py-4 border-b border-white/5">
                            <div>
                                <p className="text-sm font-bold text-white">Two-Factor Authentication</p>
                                <p className="text-xs text-white/30">Enforce 2FA for all administrative accounts</p>
                            </div>
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-400/10 px-2 py-1 rounded-full border border-blue-400/20 uppercase tracking-wider">Required</span>
                        </div>
                        <div className="flex items-center justify-between py-4 border-b border-white/5">
                            <div>
                                <p className="text-sm font-bold text-white">Session Timeout</p>
                                <p className="text-xs text-white/30">Automatically log out inactive users</p>
                            </div>
                            <span className="text-xs text-white/70 font-mono">24 Hours</span>
                        </div>
                        <div className="flex items-center justify-between py-4">
                            <div>
                                <p className="text-sm font-bold text-white">Registration Control</p>
                                <p className="text-xs text-white/30">Allow new users to create accounts</p>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full border border-emerald-400/20 uppercase tracking-wider">Open</span>
                        </div>
                    </div>
                </section>

                <div className="pt-6">
                    <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-4">
                        <svg className="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-xs text-blue-300/80 leading-relaxed">
                            Global settings are currently managed via environment variables and database seeds. Interactive configuration will be available in a future update.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
