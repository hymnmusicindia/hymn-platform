"use client";

import { useEffect, useState } from "react";
import { Bell, BellRing, LoaderCircle } from "lucide-react";

function decodeKey(value: string) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export function TeamPushControl() {
  const [state, setState] = useState<"loading" | "enabled" | "disabled" | "unsupported" | "busy" | "error">("loading");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported"); return;
    }
    try {
      const response = await fetch("/api/team/push", { cache: "no-store" });
      if (!response.ok) throw new Error("Notification settings are unavailable.");
      const data = await response.json();
      setState(data.subscribed ? "enabled" : "disabled");
      if (!data.enabled) setMessage("Push notifications need server setup.");
    } catch { setState("error"); setMessage("Could not load notification settings."); }
  };
  useEffect(() => { void refresh(); }, []);

  const enable = async () => {
    setState("busy"); setMessage("");
    try {
      const settings = await fetch("/api/team/push", { cache: "no-store" }).then(response => response.json());
      if (!settings.enabled || !settings.publicKey) throw new Error("Push notifications are not configured on the server yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in Android settings to receive team updates.");
      const registration = await navigator.serviceWorker.register("/team-sw.js", { scope: "/" });
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(settings.publicKey) });
      const saved = await fetch("/api/team/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      if (!saved.ok) throw new Error((await saved.json()).error || "Could not enable notifications.");
      setState("enabled"); setMessage("This device will receive team alerts.");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Could not enable notifications."); }
  };
  const disable = async () => {
    setState("busy"); setMessage("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/team/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
        await subscription.unsubscribe();
      }
      setState("disabled"); setMessage("Notifications are off for this device.");
    } catch { setState("error"); setMessage("Could not disable notifications."); }
  };

  return <div className="team-push-control">
    <button type="button" onClick={() => state === "enabled" ? void disable() : void enable()} disabled={state === "loading" || state === "busy" || state === "unsupported"} aria-label={state === "enabled" ? "Turn off notifications on this device" : "Turn on team notifications on this device"} title={state === "enabled" ? "Notifications on" : "Turn on team notifications"}>
      {state === "busy" || state === "loading" ? <LoaderCircle size={17} className="team-push-spin" /> : state === "enabled" ? <BellRing size={17} /> : <Bell size={17} />}
      <span>{state === "enabled" ? "Alerts on" : state === "busy" || state === "loading" ? "Loading" : "Turn on alerts"}</span>
    </button>
    {message ? <small role="status">{message}</small> : null}
  </div>;
}
