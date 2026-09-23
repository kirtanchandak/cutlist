"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { supabase } from "../lib/supabase";
import clsx from "clsx";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) return;

    setStatus("loading");
    
    try {
      const { error } = await supabase.from("waitlist").insert([{ email }]);
      if (error && error.code !== "23505") { // Ignore unique violation
        throw error;
      }
      track("waitlist_join");
      setStatus("success");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  return (
    <footer className="border-t border-[var(--ln)] bg-[var(--sf)] py-6 px-7 mt-auto">
      <div className="max-w-[1240px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Text Section */}
        <div className="text-center md:text-left">
          <h4 className="text-sm font-bold text-[var(--ink)] mb-1">
            Want unlimited clips for a flat fee?
          </h4>
          <p className="text-xs text-[var(--mu)] max-w-lg">
            We're building a native Mac/Windows app. Bring your own OpenRouter key and run JEV unlimited for fractions of a cent. Join the waitlist for the lifetime deal.
          </p>
        </div>

        {/* Form Section */}
        <div className="w-full md:w-auto">
          {status === "success" ? (
            <div className="py-2 px-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium text-xs text-center">
              You're on the list!
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-sm mx-auto md:mx-0">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
                disabled={status === "loading"}
                className="flex-1 bg-[var(--bg)] border border-[var(--ln)] rounded-lg px-3 py-2 text-xs text-[var(--ink)] placeholder:text-[var(--mu)] focus:outline-none focus:border-[var(--ac)] transition-colors"
              />
              <button
                type="submit"
                disabled={status === "loading" || !email}
                className={clsx(
                  "px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap",
                  status === "loading" || !email
                    ? "bg-[var(--ln)] text-[var(--mu)] cursor-not-allowed"
                    : "bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--ac)] hover:text-[var(--acink)]"
                )}
              >
                Join Waitlist
              </button>
            </form>
          )}
          {status === "error" && (
            <p className="text-[10px] text-red-500 mt-1 text-center md:text-left">Failed to join. Try again.</p>
          )}
        </div>
        
      </div>
    </footer>
  );
}
