import { Order, Release, User } from "@/lib/types";

export function DashboardPanels({ user, releases, orders }: { user: User; releases: Release[]; orders: Order[] }) {
  return (
    <div className="grid gap-8">
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Referral credits", value: `Rs ${user.referralCredits}` },
          { label: "Releases in system", value: String(releases.length) },
          { label: "Verified purchases", value: String(orders.filter((order) => order.paymentStatus === "paid").length) }
        ].map((card) => (
          <div key={card.label} className="metric-card">
            <p className="text-sm" style={{ color: "var(--text-soft)" }}>{card.label}</p>
            <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text)" }}>{card.value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="surface-card p-6">
          <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>My Releases</h2>
          <div className="mt-5 space-y-4">
            {releases.map((release) => (
              <div key={release.id} className="surface-list-item p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text)" }}>{release.trackName}</p>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>{release.artistName} / {release.releaseType.toUpperCase()}</p>
                  </div>
                  <span className="status-pill status-pill-active">
                    {release.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {release.platforms.map((platform) => (
                    <span key={platform} className="chip">
                      {platform}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface-card p-6">
          <h2 className="text-xl font-semibold" style={{ color: "var(--text)" }}>Purchased Beats</h2>
          <div className="mt-5 space-y-4 text-sm" style={{ color: "var(--text-muted)" }}>
            {orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <p className="font-semibold" style={{ color: "var(--text)" }}>No beat purchases yet</p>
                <p className="mt-2">Verified Razorpay orders will appear here with license tiers and payment IDs.</p>
              </div>
            ) : null}
            {orders.map((order) => (
              <div key={order.id} className="surface-list-item p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>Order #{order.id}</p>
                  <span className="status-pill status-pill-active">
                    {order.paymentStatus}
                  </span>
                </div>
                <p className="mt-2" style={{ color: "var(--text-soft)" }}>Razorpay order: {order.razorpayOrderId}</p>
                <div className="mt-4 space-y-2">
                  {order.items.map((item, index) => (
                    <div key={`${order.id}-${item.beatId}-${index}`} className="flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <span>Beat #{item.beatId} / {item.licenseType}</span>
                      <span style={{ color: "var(--text)" }}>Rs {item.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
