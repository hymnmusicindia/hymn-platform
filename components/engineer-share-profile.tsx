"use client";
import { useState } from "react";
import { Link2 } from "lucide-react";
export function EngineerShareProfile() {
  const [message, setMessage] = useState("Copy profile link");
  return <button type="button" className="btn-outline" onClick={async () => { try { await navigator.clipboard.writeText(window.location.origin + window.location.pathname); setMessage("Link copied"); } catch { setMessage("Copy the link from your address bar"); } }}><Link2 size={16}/><span aria-live="polite">{message}</span></button>;
}
