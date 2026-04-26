"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NotificationModal from "@/components/NotificationModal";

export default function RegisterPage() {
    const router = useRouter();
    const [form, setForm] = useState({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
    });
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState<{type: "success" | "error"; title: string; message: string } | null>(null);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setForm({...form, [e.target.name]: e.target.value});
    }

    function handleModalClose() {
        if (modal?.type === "success") router.push("/login");
        setModal(null);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json"},
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) {
                setModal({ type: "error", title: "Registration Failed", message: data.detail || "Something went wrong. Please try again." });
                return;
            }
            setModal({ type: "success", title: "Account Created!", message: "Your account has been successfully created. You can now sign in." });
        } catch {
            setModal({ type: "error", title: "Connection Error", message: "Could not connect to the server. Please try again." });
        } finally {
            setLoading(false);
        }
    }

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
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(6,182,212,0.1),transparent_50%)]" />
            </div>

            {/* Main Layout Card */}
            <div 
                className="relative z-10 w-full max-w-5xl flex flex-col md:flex-row rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_32px_128px_rgba(0,0,0,0.8)]"
                style={{
                    background: "rgba(3, 7, 17, 0.7)",
                    backdropFilter: "blur(40px)",
                    WebkitBackdropFilter: "blur(40px)",
                }}
            >
                {/* Left Side: Brand/Logo Section */}
                <div className="relative w-full md:w-[40%] p-12 flex flex-col items-center justify-center text-center bg-gradient-to-br from-cyan-600/10 via-transparent to-transparent border-b md:border-b-0 md:border-r border-white/5">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(6,182,212,0.05),transparent_70%)]" />
                    
                    <Link href="/" className="relative group transition-transform hover:scale-105 active:scale-95">
                        <div className="absolute -inset-8 bg-cyan-500/20 blur-[60px] opacity-50 group-hover:opacity-80 transition-opacity" />
                        <Image 
                            src="/logo.png" 
                            alt="iSMS" 
                            width={320} 
                            height={112} 
                            className="relative h-24 md:h-28 w-auto drop-shadow-[0_0_30px_rgba(6,182,212,0.3)]" 
                            priority
                        />
                    </Link>
                    
                    <div className="mt-12 relative">
                        <h2 className="text-2xl font-black tracking-tight text-white mb-2 uppercase text-nowrap">Join the Community</h2>
                        <p className="text-zinc-500 text-sm font-medium leading-relaxed max-w-[200px] mx-auto uppercase tracking-widest text-[10px]">
                            Integrated Sports<br />Management System
                        </p>
                    </div>
                </div>

                {/* Right Side: Form Section */}
                <div className="flex-1 p-8 md:p-12">
                    <div className="mb-8">
                        <h1 className="text-3xl font-black tracking-tighter text-white mb-2">CREATE ACCOUNT</h1>
                        <p className="text-zinc-500 text-sm">Fill in your details to start your professional career.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        {/* First + Last Name */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex flex-col gap-2 flex-1">
                                <label className="text-[10px] font-black text-zinc-500 tracking-[0.2em] uppercase flex items-center gap-2">
                                    <svg className="w-3 h-3 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                    First Name
                                </label>
                                <input
                                    type="text"
                                    name="first_name"
                                    value={form.first_name}
                                    onChange={handleChange}
                                    required
                                    placeholder="Ann"
                                    className="rounded-2xl px-5 py-3 text-sm text-white bg-white/5 border border-white/10 placeholder-white/10 focus:outline-none focus:border-cyan-500/50 focus:bg-white/[0.08] transition-all duration-300 w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-2 flex-1">
                                <label className="text-[10px] font-black text-zinc-500 tracking-[0.2em] uppercase">
                                    Last Name
                                </label>
                                <input
                                    type="text"
                                    name="last_name"
                                    value={form.last_name}
                                    onChange={handleChange}
                                    required
                                    placeholder="Santos"
                                    className="rounded-2xl px-5 py-3 text-sm text-white bg-white/5 border border-white/10 placeholder-white/10 focus:outline-none focus:border-cyan-500/50 focus:bg-white/[0.08] transition-all duration-300 w-full"
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-zinc-500 tracking-[0.2em] uppercase flex items-center gap-2">
                                <svg className="w-3 h-3 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                                </svg>
                                Email Address
                            </label>
                            <input
                                type="email"
                                name="email"
                                value={form.email}
                                onChange={handleChange}
                                required
                                placeholder="you@example.com"
                                className="rounded-2xl px-5 py-3 text-sm text-white bg-white/5 border border-white/10 placeholder-white/10 focus:outline-none focus:border-cyan-500/50 focus:bg-white/[0.08] transition-all duration-300 w-full"
                            />
                        </div>

                        {/* Password */}
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-zinc-500 tracking-[0.2em] uppercase flex items-center gap-2">
                                <svg className="w-3 h-3 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                                Password
                            </label>
                            <input
                                type="password"
                                name="password"
                                value={form.password}
                                onChange={handleChange}
                                required
                                placeholder="••••••••"
                                className="rounded-2xl px-5 py-3 text-sm text-white bg-white/5 border border-white/10 placeholder-white/10 focus:outline-none focus:border-cyan-500/50 focus:bg-white/[0.08] transition-all duration-300 w-full"
                            />
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative overflow-hidden rounded-2xl py-4 mt-2 font-black text-xs tracking-[0.2em] uppercase transition-all duration-300 disabled:opacity-50"
                            style={{
                                background: "linear-gradient(135deg, #0891b2 0%, #0e7490 100%)",
                                boxShadow: "0 10px 40px -10px rgba(6,182,212,0.5)",
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
                                        Creating Account...
                                    </>
                                ) : "Register Account"}
                            </span>
                        </button>

                        <div className="text-center">
                            <p className="text-xs text-zinc-500 font-medium">
                                Already have an account?{" "}
                                <Link href="/login" className="text-cyan-500 hover:text-cyan-400 transition-colors font-black uppercase tracking-tighter ml-1">
                                    Sign In Now
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
