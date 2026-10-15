"use client";
export default function Error({ reset }: { reset: () => void }) { return <main style={{ padding: 40 }}><h1>Team Workspace is unavailable</h1><p>Your changes may not have saved. Retry to refresh the workspace.</p><button onClick={reset}>Try again</button></main>; }
