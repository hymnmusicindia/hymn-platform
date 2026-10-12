const checkoutScript = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<void> | null = null;

export function loadBioRazorpay(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser checkout is unavailable."));
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${checkoutScript}"]`);
    const script = existing || document.createElement("script");
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const onLoad = () => finish(window.Razorpay ? undefined : new Error("Payment checkout could not initialize. Try again."));
    const onError = () => finish(new Error("Payment checkout could not load. Check your connection and try again."));
    const timeout = window.setTimeout(() => finish(new Error("Payment checkout timed out. Try again.")), 15000);
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) { script.src = checkoutScript; script.async = true; document.body.appendChild(script); }
  });
  const attempt = loading;
  void attempt.then(() => { loading = null; }, () => { loading = null; });
  return attempt;
}
