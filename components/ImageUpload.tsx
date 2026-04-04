"use client";

import { useRef, useState } from "react";
import { getAccessToken } from "@/lib/auth";

interface ImageUploadProps {
    currentUrl:       string | null;
    uploadEndpoint:   string;
    onSuccess:        (url: string) => void;
    shape?:           "circle" | "rect";
    size?:            "sm" | "md" | "lg";
    placeholder?:     string;
    label?:           string;
    /** Recommended dimensions shown beneath the upload zone, e.g. "1200 × 400 px" */
    recommendedSize?: string;
}

const SIZE_CLASSES: Record<string, string> = {
    sm:  "w-10 h-10 text-xl",
    md:  "w-16 h-16 text-2xl",
    lg:  "w-24 h-24 text-4xl",
};

const RECT_SIZE_CLASSES: Record<string, string> = {
    sm:  "w-32 h-16 text-xl",
    md:  "w-48 h-24 text-2xl",
    lg:  "w-full h-32 text-4xl",
};

export default function ImageUpload({
    currentUrl,
    uploadEndpoint,
    onSuccess,
    shape           = "rect",
    size            = "md",
    placeholder     = "",
    label,
    recommendedSize,
}: ImageUploadProps) {
    const inputRef               = useRef<HTMLInputElement>(null);
    const [loading, setLoading]  = useState(false);
    const [error,   setError]    = useState<string | null>(null);

    const isCircle   = shape === "circle";
    const shapeClass = isCircle ? "rounded-full" : "rounded-2xl";
    const sizeClass  = isCircle ? SIZE_CLASSES[size] : RECT_SIZE_CLASSES[size];

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        const token = getAccessToken();
        if (!token) { setError("Not authenticated."); return; }

        setLoading(true);
        setError(null);

        try {
            const form = new FormData();
            form.append("file", file);

            const res = await fetch(uploadEndpoint, {
                method:  "POST",
                headers: { Authorization: `Bearer ${token}` },
                body:    form,
            });

            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.detail ?? "Upload failed.");
            }

            const data = await res.json();
            onSuccess(data.url);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Upload failed.");
        } finally {
            setLoading(false);
            // reset so the same file can be re-selected
            if (inputRef.current) inputRef.current.value = "";
        }
    }

    return (
        <div className="flex flex-col items-center gap-2">
            {label && (
                <span className="text-xs text-zinc-500 font-semibold uppercase tracking-widest">
                    {label}
                </span>
            )}

            <div
                className={`relative group ${sizeClass} ${shapeClass} overflow-hidden bg-zinc-800 border border-white/10 flex items-center justify-center cursor-pointer`}
                onClick={() => !loading && inputRef.current?.click()}
            >
                {/* Image or placeholder */}
                {currentUrl ? (
                    <img
                        src={currentUrl}
                        alt={label ?? "image"}
                        className={`w-full h-full object-cover ${shapeClass}`}
                    />
                ) : (
                    <span className="select-none">{placeholder}</span>
                )}

                {/* Hover overlay */}
                <div className={`absolute inset-0 ${shapeClass} bg-black/60 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity px-2`}>
                    {loading ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <>
                            <span className="text-xs text-white font-semibold text-center leading-tight">
                                {currentUrl ? "Change Photo" : "Upload Photo"}
                            </span>
                            {recommendedSize && (
                                <span className="text-[10px] text-white/60 text-center leading-tight">
                                    {recommendedSize}
                                </span>
                            )}
                            <span className="text-[10px] text-white/50 text-center leading-tight">
                                JPG · PNG · WebP · max 5 MB
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* Size / format hint shown below the zone */}
            {(recommendedSize || label) && (
                <div className="flex flex-col items-center gap-0.5">
                    {recommendedSize && (
                        <p className="text-[11px] text-zinc-500 text-center leading-tight">
                            {recommendedSize}
                        </p>
                    )}
                    <p className="text-[10px] text-zinc-600 text-center">
                        JPG · PNG · WebP &nbsp;·&nbsp; max 5 MB
                    </p>
                </div>
            )}

            {error && (
                <p className="text-xs text-red-400 max-w-[12rem] text-center">{error}</p>
            )}

            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileChange}
            />
        </div>
    );
}
