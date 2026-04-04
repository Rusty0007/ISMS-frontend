"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";

const MENU_ITEMS = [
    { label: "Dashboard", href: "/admin", icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
        </svg>
    )},
    { label: "Users", href: "/admin/users", icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
    )},
    { label: "Tournaments", href: "/admin/tournaments", icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
    )},
    { label: "Audit Logs", href: "/admin/audit", icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
    )},
    { label: "Settings", href: "/admin/settings", icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    )},
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        const roles: string[] = JSON.parse(sessionStorage.getItem("roles") ?? "[]");
        if (!roles.includes("system_admin")) {
            router.replace("/dashboard");
        } else {
            setAuthorized(true);
        }
    }, [router]);

    if (!authorized) return null;

    return (
        <div className="flex min-h-screen bg-zinc-950 text-white">
            {/* Sidebar */}
            <aside className="w-64 border-r border-white/5 bg-zinc-900/50 backdrop-blur-xl flex flex-col sticky top-0 h-screen">
                <div className="p-6">
                    <Link href="/dashboard" className="flex items-center gap-3">
                        <Image src="/logo.png" alt="ISMS" width={100} height={32} className="h-8 w-auto" />
                        <span className="text-[10px] font-bold bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded border border-red-500/20 uppercase tracking-wider">Admin</span>
                    </Link>
                </div>

                <nav className="flex-1 px-4 space-y-1">
                    {MENU_ITEMS.map((item) => {
                        const active = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                                    active
                                        ? "bg-white/10 text-white shadow-lg shadow-black/20"
                                        : "text-white/40 hover:text-white/70 hover:bg-white/5"
                                }`}
                            >
                                <span className={`${active ? "text-white" : "text-white/30 group-hover:text-white/50"}`}>
                                    {item.icon}
                                </span>
                                <span className="text-sm font-medium">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-white/5">
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 transition-all"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span className="text-sm font-medium">Exit Admin</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col">
                <header className="h-16 border-b border-white/5 bg-zinc-950/50 backdrop-blur-md flex items-center justify-between px-8 sticky top-0 z-10">
                    <h2 className="text-sm font-semibold text-white/70 uppercase tracking-widest">
                        {MENU_ITEMS.find(i => i.href === pathname)?.label || "Administration"}
                    </h2>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-xs font-bold text-white">{sessionStorage.getItem("username")}</p>
                            <p className="text-[10px] text-white/30">System Administrator</p>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center overflow-hidden">
                            <span className="text-xs font-bold text-white/50">{(sessionStorage.getItem("username") || "A")[0].toUpperCase()}</span>
                        </div>
                    </div>
                </header>
                <div className="flex-1 p-8 overflow-y-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
