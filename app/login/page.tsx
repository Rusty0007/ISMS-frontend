"use client";

import React, { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import NotificationModal from "@/components/NotificationModal";
import { setAccessToken } from "@/lib/auth";

const REASON_BANNERS: Record<string, { color: string; icon: string; title: string; body: string }> = {
    kicked: {
        color: "border-red-500/30 bg-red-500/10",
        icon: "⚠️",
        title: "Session terminated",
        body: "Your session was ended because another login was detected on your account. Both sessions have been signed out for security. Please sign in again.",
    },
    expired: {
        color: "border-yellow-500/30 bg-yellow-500/10",
        icon: "🕐",
        title: "Session expired",
        body: "Your session has expired. Please sign in again.",
    },
};

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reason = searchParams.get("reason") ?? "";

    const [form, setForm] = useState({ email: "", password: "" });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState<{ type: "success" | "error"; title: string; message: string } | null>(null);

    useEffect(() => {
        if (reason) {
            const url = new URL(window.location.href);
            url.searchParams.delete("reason");
            window.history.replaceState({}, "", url.toString());
        }
    }, [reason]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setForm({ ...form, [e.target.name]: e.target.value });
    }

    function handleModalClose() {
        if (modal?.type === "success") router.push("/dashboard");
        setModal(null);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) {
                setModal({ type: "error", title: "Login Failed", message: data.detail || "Invalid credentials. Please try again." });
                return;
            }
            setAccessToken(data.access_token);
            sessionStorage.setItem("username", data.username);
            sessionStorage.setItem("roles", JSON.stringify(data.roles));
            if (data.session_replaced) sessionStorage.setItem("session_replaced", "1");
            router.replace(data.profile_setup_complete ? "/dashboard" : "/profile/setup");
        } catch {
            setModal({ type: "error", title: "Connection Error", message: "Could not connect to the server. Please try again." });
        } finally {
            setLoading(false);
        }
    }

    const banner = REASON_BANNERS[reason] ?? null;

    return (
        <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
            {/* Full-screen background */}
            <div className="absolute inset-0 z-0">
                <Image
                    src="/sports/sports-hero.png"
                    alt="Sports background"
                    fill
                    className="object-cover"
                    priority
                />
                <div className="absolute inset-0 bg-[#030711]/80 backdrop-blur-[2px]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.1),transparent_50%)]" />
            </div>

            {/* Main Layout Card */}
            <div 
                className="relative z-10 w-full max-w-4xl flex flex-col md:flex-row rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_32px_128px_rgba(0,0,0,0.8)]"
                style={{
                    background: "rgba(3, 7, 17, 0.7)",
                    backdropFilter: "blur(40px)",
                    WebkitBackdropFilter: "blur(40px)",
                }}
            >
                {/* Left Side: Brand/Logo Section */}
                <div className="relative w-full md:w-[45%] p-12 flex flex-col items-center justify-center text-center bg-gradient-to-br from-blue-600/10 via-transparent to-transparent border-b md:border-b-0 md:border-r border-white/5">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(59,130,246,0.05),transparent_70%)]" />
                    
                    <Link href="/" className="relative group transition-transform hover:scale-105 active:scale-95">
                        <div className="absolute -inset-8 bg-blue-500/20 blur-[60px] opacity-50 group-hover:opacity-80 transition-opacity" />
                        <Image 
                            src="/logo.png" 
                            alt="iSMS" 
                            width={320} 
                            height={112} 
                            className="relative h-24 md:h-28 w-auto drop-shadow-[0_0_30px_rgba(59,130,246,0.3)]" 
                            priority
                        />
                    </Link>
                    
                    <div className="mt-12 relative">
                        <h2 className="text-2xl font-black tracking-tight text-white mb-2 uppercase">Welcome Back</h2>
                        <p className="text-zinc-500 text-sm font-medium leading-relaxed max-w-[200px] mx-auto uppercase tracking-widest text-[10px]">
                            Intelligent Sports<br />Management System
                        </p>
                    </div>
                </div>

                {/* Right Side: Form Section */}
                <div className="flex-1 p-8 md:p-12 lg:p-16">
                    {/* Redirect-reason banner */}
                    {banner && (
                        <div className={`mb-8 flex gap-3 px-5 py-4 rounded-2xl border text-sm animate-in fade-in slide-in-from-top-4 duration-500 ${banner.color}`}>
                            <span className="text-lg leading-snug">{banner.icon}</span>
                            <div>
                                <p className="font-bold text-white mb-0.5">{banner.title}</p>
                                <p className="text-white/50 leading-snug text-xs">{banner.body}</p>
                            </div>
                        </div>
                    )}

                    <div className="mb-8">
                        <h1 className="text-3xl font-black tracking-tighter text-white mb-2">SIGN IN</h1>
                        <p className="text-zinc-500 text-sm">Enter your credentials to access your dashboard.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                        {/* Email */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-zinc-500 tracking-[0.2em] uppercase flex items-center gap-2">
                                <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                </svg>
                                Email Address
                            </label>
                            <input
                                type="email"
                                name="email"
                                autoComplete="username"
                                value={form.email}
                                onChange={handleChange}
                                required
                                placeholder="name@example.com"
                                className="rounded-2xl px-5 py-4 text-sm text-white bg-white/5 border border-white/10 placeholder-white/10 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-all duration-300"
                            />
                        </div>

                        {/* Password */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-zinc-500 tracking-[0.2em] uppercase flex items-center gap-2">
                                <svg className="w-3 h-3 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    autoComplete="current-password"
                                    value={form.password}
                                    onChange={handleChange}
                                    required
                                    placeholder="••••••••"
                                    className="w-full rounded-2xl px-5 py-4 pr-12 text-sm text-white bg-white/5 border border-white/10 placeholder-white/10 focus:outline-none focus:border-blue-500/50 focus:bg-white/[0.08] transition-all duration-300"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-white transition-colors"
                                >
                                    {showPassword ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7s4-7 9-7a9.97 9.97 0 015.39 1.58M15 12a3 3 0 11-4.243-4.243M3 3l18 18" />
                                        </svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative overflow-hidden rounded-2xl py-4 font-black text-xs tracking-[0.2em] uppercase transition-all duration-300 disabled:opacity-50"
                            style={{
                                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                                boxShadow: "0 10px 40px -10px rgba(37,99,235,0.5)",
                                color: "#fff",
                            }}
                        >
                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                            <span className="relative flex items-center justify-center gap-3">
                                {loading ? (
                                    <>
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                        </svg>
                                        Authenticating...
                                    </>
                                ) : "Sign In Account"}
                            </span>
                        </button>

                        <div className="text-center">
                            <p className="text-xs text-zinc-500 font-medium">
                                Don&apos;t have an account?{" "}
                                <Link href="/register" className="text-blue-500 hover:text-blue-400 transition-colors font-black uppercase tracking-tighter ml-1">
                                    Register Now
                                </Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>

            {modal && (
                <NotificationModal
                    type={modal.type}
                    title={modal.title}
                    message={modal.message}
                    onClose={handleModalClose}
                />
            )}
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={null}>
            <LoginContent />
        </Suspense>
    );
}
