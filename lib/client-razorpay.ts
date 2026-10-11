export function loadBioRazorpay(): Promise<void> {
  return new Promise((resolve,reject)=>{
    if (window.Razorpay) return resolve();
    const existing=document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    const script=existing || document.createElement("script");
    const timeout=window.setTimeout(()=>{script.remove();reject(new Error("Payment checkout timed out. Try again."));},15000);
    script.addEventListener("load",()=>{clearTimeout(timeout);resolve();},{once:true});
    script.addEventListener("error",()=>{clearTimeout(timeout);script.remove();reject(new Error("Payment checkout could not load. Try again."));},{once:true});
    if (!existing) {script.src="https://checkout.razorpay.com/v1/checkout.js";script.async=true;document.body.appendChild(script);}
  });
}
