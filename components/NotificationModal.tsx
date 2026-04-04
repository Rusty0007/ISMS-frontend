"use client";

import React from "react";

type NotificationType = "success" | "error";

interface NotificationModalProps {
    type: NotificationType;
        title: string;
        message: string;
        onClose: () => void;
}

export default function NotificationModal({
    type,
    title,
    message,
    onClose,
}: NotificationModalProps) {
    const isSuccess = type === "success"


      return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Clicking the backdrop closes the modal */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-sm bg-zinc-900 border border-white/10 rounded-2xl p-8 flex flex-col items-center gap-5 shadow-2xl">
        {/* Icon circle — green for success, red for error */}
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isSuccess
              ? "bg-green-500/15 border border-green-500/30"
              : "bg-red-500/15 border border-red-500/30"
          }`}
        >
          {isSuccess ? (
            // Checkmark SVG
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            // X SVG
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>

        {/* Title and message */}
        <div className="text-center flex flex-col gap-1.5">
          <h3 className={`text-lg font-bold ${isSuccess ? "text-green-400" : "text-red-400"}`}>
            {title}
          </h3>
          <p className="text-sm text-zinc-400">{message}</p>
        </div>

        {/* Button */}
        <button
          onClick={onClose}
          className={`w-full py-3 rounded-lg font-bold text-sm transition-colors ${
            isSuccess
              ? "bg-green-500 hover:bg-green-400 text-zinc-950"
              : "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
          }`}
        >
          {isSuccess ? "Continue" : "Try Again"}
        </button>
      </div>
    </div>
  );
}