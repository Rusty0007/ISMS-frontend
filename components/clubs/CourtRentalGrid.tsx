"use client";

import { useMemo } from "react";

interface CourtSlot {
    start:        string;
    end:          string;
    is_available: boolean;
    booking_id:   string | null;
}

interface CourtAvailability {
    court_id:       string;
    court_name:     string;
    sport:          string | null;
    surface:        string | null;
    is_indoor:      boolean | null;
    price_per_hour: number | null;
    slots:          CourtSlot[];
}

interface Props {
    availability: CourtAvailability[];
    selectedDate: string;
    onBookSlot: (courtId: string, courtName: string, slot: CourtSlot) => void;
    bookedSlots: Set<string>;
}

export default function CourtRentalGrid({ availability, selectedDate, onBookSlot, bookedSlots }: Props) {
    // Generate hours from 6 AM to 11 PM (Last slot starts at 10 PM)
    const hours = useMemo(() => {
        const h = [];
        for (let i = 6; i <= 22; i++) {
            h.push(i);
        }
        return h;
    }, []);

    const now = new Date();

    const formatHourRange = (h: number) => {
        const ampm = (hr: number) => (hr >= 12 ? "PM" : "AM");
        const display = (hr: number) => hr % 12 || 12;
        
        const start = h;
        const end = h + 1;
        
        return `${display(start)}${ampm(start)} - ${display(end)}${ampm(end)}`;
    };

    return (
        <div className="w-full space-y-6">
            <div className="overflow-x-auto rounded-[2.5rem] border border-white/5 bg-[#0a111a]/60 backdrop-blur-xl shadow-2xl">
                <table className="w-full border-collapse min-w-[800px] table-fixed">
                    <thead>
                        <tr className="border-b border-white/5">
                            <th className="sticky left-0 z-30 bg-[#0a111a] p-6 text-left border-r border-white/5 w-48">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500">SCHEDULING</span>
                                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">{selectedDate}</p>
                                </div>
                            </th>
                            {availability.map(court => (
                                <th key={court.court_id} className="p-6 border-r border-white/5 bg-white/[0.01]">
                                    <div className="space-y-2">
                                        <p className="text-sm font-black text-white uppercase italic tracking-tight truncate">@{court.court_name}</p>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest italic">
                                                {court.sport?.replace(/_/g, ' ') || 'MULTI-SPORT'}
                                            </span>
                                            {court.price_per_hour && (
                                                <span className="text-[9px] font-black text-cyan-400">
                                                    ₱{court.price_per_hour}/HR
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {hours.map(h => {
                            const rangeLabel = formatHourRange(h);
                            
                            return (
                                <tr key={h} className="border-b border-white/5 group hover:bg-white/[0.01] transition-colors">
                                    <td className="sticky left-0 z-20 bg-[#0a111a] p-5 border-r border-white/5 group-hover:bg-[#0f1722] transition-colors font-black text-[10px] text-slate-400 uppercase tracking-tighter">
                                        {rangeLabel}
                                    </td>
                                    
                                    {availability.map(court => {
                                        const slotStartStr = `${selectedDate}T${String(h).padStart(2, '0')}:00:00`;
                                        const slotDate = new Date(slotStartStr);
                                        const isPast = slotDate < now;
                                        
                                        // Find matching slot in availability data
                                        const slot = court.slots.find(s => {
                                            const sDate = new Date(s.start);
                                            return sDate.getHours() === h;
                                        });

                                        const isPending = bookedSlots.has(slot?.start + court.court_id);
                                        const isBooked = slot && !slot.is_available && !isPending;
                                        const isVacant = slot && slot.is_available && !isPending && !isPast;

                                        let statusLabel = "OPEN";
                                        let cellClass = "p-3 border-r border-white/5 relative min-h-[100px] transition-all ";
                                        let textClass = "text-[10px] font-black uppercase tracking-widest ";

                                        if (isPast) {
                                            cellClass += "bg-black/40 cursor-not-allowed opacity-40";
                                            statusLabel = "PAST";
                                            textClass += "text-slate-700";
                                        } else if (isBooked) {
                                            cellClass += "bg-rose-500/10 cursor-not-allowed";
                                            statusLabel = "BOOKED";
                                            textClass += "text-rose-500";
                                        } else if (isPending) {
                                            cellClass += "bg-amber-500/10 animate-pulse";
                                            statusLabel = "QUEUED";
                                            textClass += "text-amber-500";
                                        } else if (isVacant) {
                                            cellClass += "hover:bg-cyan-500/10 cursor-pointer group/cell";
                                            statusLabel = "AVAILABLE";
                                            textClass += "text-emerald-500";
                                        } else {
                                            cellClass += "bg-white/[0.02] cursor-not-allowed";
                                            statusLabel = "OFFLINE";
                                            textClass += "text-slate-800";
                                        }

                                        return (
                                            <td 
                                                key={court.court_id + h} 
                                                className={cellClass}
                                                onClick={() => {
                                                    if (isVacant && slot) onBookSlot(court.court_id, court.court_name, slot);
                                                }}
                                            >
                                                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 py-2">
                                                    {/* Tactical Cell Labels */}
                                                    <div className="flex flex-col items-center opacity-40 group-hover/cell:opacity-100 transition-opacity">
                                                        <span className="text-[7px] font-black text-slate-500 uppercase tracking-tighter leading-none">
                                                            {court.court_name}
                                                        </span>
                                                        <span className="text-[7px] font-bold text-slate-600 uppercase tracking-tighter mt-0.5">
                                                            {rangeLabel}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className={textClass}>{statusLabel}</span>
                                                        <div className={`h-1 w-8 rounded-full ${
                                                            isVacant ? "bg-emerald-500/30" : 
                                                            isBooked ? "bg-rose-500/30" : 
                                                            isPending ? "bg-amber-500/30" : "bg-white/5"
                                                        }`} />
                                                    </div>

                                                    {isVacant && (
                                                        <span className="text-[8px] font-black text-cyan-400 opacity-0 group-hover/cell:opacity-100 transition-all translate-y-2 group-hover/cell:translate-y-0 uppercase tracking-widest italic">
                                                            DEPLOY →
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="p-8 rounded-[2rem] border border-white/5 bg-[#0a111a]/40 backdrop-blur-md flex flex-wrap items-center justify-between gap-8 shadow-xl">
                <div className="flex flex-wrap gap-8">
                    <LegendItem color="bg-emerald-500/20" label="OPEN FOR BOOKING" dot="bg-emerald-500" />
                    <LegendItem color="bg-rose-500/20" label="ALREADY BOOKED" dot="bg-rose-500" />
                    <LegendItem color="bg-amber-500/20" label="PENDING APPROVAL" dot="bg-amber-500" />
                    <LegendItem color="bg-black/40" label="PAST SLOT" dot="bg-slate-700" />
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
                    <span className="text-xl">💡</span>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">
                        Select an <span className="text-emerald-400">OPEN</span> slot to initialize deployment protocol.
                    </p>
                </div>
            </div>
        </div>
    );
}

function LegendItem({ color, label, dot }: { color: string; label: string; dot: string }) {
    return (
        <div className="flex items-center gap-3">
            <div className={`w-4 h-4 rounded-md ${color} border border-white/10 flex items-center justify-center`}>
                <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            </div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
        </div>
    );
}
