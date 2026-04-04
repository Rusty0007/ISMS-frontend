"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NotificationModal from "@/components/NotificationModal";
import { clearAuthSession, getAccessToken, isUnauthorized } from "@/lib/auth";

const SPORTS = [
    { key: "pickleball", label: "Pickleball", emoji: "🏓", border: "border-cyan-500/40", bg: "bg-cyan-500/10", text: "text-cyan-400"},
    { key: "badminton", label: "Badminton", emoji: "🏸", border: "border-purple-500/10", bg: "bg-purple-500/10", text: "text-purple-400"},
    { key: "lawn_tennis", label: "Lawn Tennis", emoji: "🎾", border: "border-emerald-500/10", bg: "bg-emerald-500/10", text: "text-emerald-400"},
    { key: "table_tennis", label: "Table Tennis", emoji: "🏓", border: "bg-orange-500/10", bg: "bg-orange-500/10", text: "text-orange-400"},
];

const PSGC = "https://psgc.cloud/api";

export default function ProfileSetupPage() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState<{ type: "success" | "error"; title: string; message: string } | null>(null)

    const [selectedSports, setSelectedSports] = useState<string[]>([]);

    const [regions, setRegions] = useState<any[]>([]);
    const [provinces, setProvinces] = useState<any[]>([]);
    const [cities, setCities] = useState<any[]>([]);
    const [barangays, setBarangays] = useState<any[]>([]);
    const [location, setLocation] = useState({
        region_code: "", province_code: "", city_mun_code: "", barangay_code: "",
    });

    useEffect(() => {
        fetch(`${PSGC}/regions`)
        .then(r => r.json())
        .then(setRegions);
    }, []);

    function handleModalClose() {
      if (modal?.type === "success") {
        router.push("/dashboard");
      }
      setModal(null);
    }

    function toggleSport(key: string) {
        setSelectedSports(prev =>
            prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
        );
    }

    async function handleRegionChange(code: string) {
        setLocation({ region_code: code, province_code: "", city_mun_code: "", barangay_code: "" });
        setProvinces([]); setCities([]); setBarangays([]);
        if (!code) return;
        const res = await fetch(`${PSGC}/regions/${code}/provinces`);
        setProvinces(await res.json());
    }

    async function handleProvinceChange(code: string) {
        setLocation(prev => ({...prev, province_code: code, city_mun_code: "", barangay_code: ""}));
        setCities([]); setBarangays([]);
        if (!code) return;
        const res = await fetch(`${PSGC}/provinces/${code}/cities-municipalities`);
        setCities(await res.json());
    }

    async function handleCityChange(code: string) {
        setLocation(prev => ({...prev, city_mun_code: code, barangay_code: "" }));
        setBarangays([]);
        if (!code) return;
        const res = await fetch(`${PSGC}/cities-municipalities/${code}/barangays`);
        setBarangays(await res.json())
    }

    async function handleSportsNext() {
        if (selectedSports.length === 0) {
            setModal({
              type: "error",
              title: "No sport Selected",
              message: "Please select at least one sport to continue.",
            });
            return;
        }
        setLoading(true);
        const token = getAccessToken();
        if (!token) {
            router.replace("/login");
            setLoading(false);
            return;
        }
        try {
          for (const sport of selectedSports) {
            const res = await fetch ("/api/players/sports/register", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
              },
              body: JSON.stringify({ sport }),
            });
            if (isUnauthorized(res.status)) {
                clearAuthSession();
                router.replace("/login");
                return;
            }
            if (!res.ok) throw new Error("Failed to register sport.");
          }
          setStep(2);
        } catch {
          setModal({
            type: "error",
            title: "Registration Failed",
            message: "Failed to register sports. Please try again.",
          });
        } finally {
          setLoading(false);
        }
    }

    async function handleCompleteSetup() {
        if (!location.region_code || !location.province_code || !location.city_mun_code || !location.barangay_code) {
            setModal({
              type: "error",
              title: "Incomplete Location",
              message: "Please fill in all location fields before continuing.",
            });
            return;
          }
          setLoading(true);
          const token = getAccessToken();
          if (!token) {
            router.replace("/login");
            setLoading(false);
            return;
          }
          try {
            const res = await fetch("/api/players/me", {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
              },
              body: JSON.stringify({ ...location, profile_setup_complete: true }),
            });
            if (isUnauthorized(res.status)) {
              clearAuthSession();
              router.replace("/login");
              return;
            }
            if (!res.ok) {
              setModal({
                type: "error",
                title: "Save Failed",
                message: "Failed to save your location. Please try again",
              });
              return;
            }
            setModal({
              type: "success",
              title: "Profile Complete!",
              message: "Your profile has been setup successfully. Welcome to ISMS!",
            });
          } catch {
            setModal({
              type: "error",
              title: "Connection Error",
              message: "Could not connect to the server. Please try again",
            });
          } finally {
              setLoading(false)
            }
    }
      const selectClass = "bg-zinc-800 border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors disabled:opacity-40";

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4 py-12">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative z-10 w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/" className="flex justify-center">
            <Image src="/logo.png" alt="iSMS" width={160} height={56} className="h-14 w-auto" />
          </Link>
          <p className="text-zinc-500 text-sm mt-2">Let's set up your profile</p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          <div className={`flex-1 h-1 rounded-full ${step >= 1 ? "bg-cyan-500" : "bg-zinc-700"}`} />
          <div className={`flex-1 h-1 rounded-full ${step >= 2 ? "bg-cyan-500" : "bg-zinc-700"}`} />
        </div>

        <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8">
        

          {/* Step 1 — Sport Selection */}
          {step === 1 && (
            <>
              <p className="text-xs font-bold tracking-[0.3em] text-cyan-400 uppercase mb-2">Step 1 of 2</p>
              <h2 className="text-xl font-black mb-1">Which sports do you play?</h2>
              <p className="text-zinc-500 text-sm mb-6">Select at least one to continue.</p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                {SPORTS.map(sport => {
                  const selected = selectedSports.includes(sport.key);
                  return (
                    <button
                      key={sport.key}
                      onClick={() => toggleSport(sport.key)}
                      className={`border rounded-xl p-4 text-left transition-all ${
                        selected ? `${sport.border} ${sport.bg}` : "border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="text-3xl mb-2">{sport.emoji}</div>
                      <div className={`text-sm font-semibold ${selected ? sport.text : "text-zinc-300"}`}>
                        {sport.label}
                      </div>
                      {selected && <div className={`text-xs mt-1 ${sport.text}`}>✓ Selected</div>}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleSportsNext}
                disabled={loading}
                className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? "Saving..." : "Next →"}
              </button>
            </>
          )}

          {/* Step 2 — Location */}
          {step === 2 && (
            <>
              <p className="text-xs font-bold tracking-[0.3em] text-cyan-400 uppercase mb-2">Step 2 of 2</p>
              <h2 className="text-xl font-black mb-1">Where are you based?</h2>
              <p className="text-zinc-500 text-sm mb-6">Helps us find players and tournaments near you.</p>

              <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-400 tracking-widest uppercase">Region</label>
                  <select value={location.region_code} onChange={e => handleRegionChange(e.target.value)} className={selectClass}>
                    <option value="">Select region...</option>
                    {regions.map((r: any) => <option key={r.code} value={r.code}>{r.name}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-400 tracking-widest uppercase">Province</label>
                  <select value={location.province_code} onChange={e => handleProvinceChange(e.target.value)} disabled={!location.region_code} className={selectClass}>
                    <option value="">Select province...</option>
                    {provinces.map((p: any) => <option key={p.code} value={p.code}>{p.name}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-400 tracking-widest uppercase">City / Municipality</label>
                  <select value={location.city_mun_code} onChange={e => handleCityChange(e.target.value)} disabled={!location.province_code} className={selectClass}>
                    <option value="">Select city/municipality...</option>
                    {cities.map((c: any) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-400 tracking-widest uppercase">Barangay</label>
                  <select value={location.barangay_code} onChange={e => setLocation(prev => ({ ...prev, barangay_code: e.target.value }))} disabled={!location.city_mun_code} className={selectClass}>
                    <option value="">Select barangay...</option>
                    {barangays.map((b: any) => <option key={b.code} value={b.code}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 border border-white/10 text-zinc-400 font-medium py-3 rounded-lg hover:bg-white/5 transition-colors">
                  ← Back
                </button>
                <button onClick={handleCompleteSetup} disabled={loading} className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 font-bold py-3 rounded-lg transition-colors disabled:opacity-50">
                  {loading ? "Saving..." : "Complete Setup"}
                </button>
              </div>
            </>
          )}
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
