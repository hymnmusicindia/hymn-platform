import Link from "next/link";
import { publicPageMetadata } from "@/lib/seo";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { mcpProtocolVersion, publicAgentTools } from "@/lib/public-agent-tools";

export const metadata = publicPageMetadata("Public Agent Tools", "Read HYMN Music's public business, service and pricing information through Markdown, WebMCP or MCP.", "/agents");
export default function AgentsPage() {
  const origin = getPublicAppUrl();
  return <main className="shell max-w-4xl py-12"><h1 className="text-3xl font-semibold">Public agent tools</h1>
    <p className="mt-4 leading-7">HYMN exposes public business details, services and distribution pricing. These tools do not access accounts, private uploads, payments, Team OS, Admin OS or calendars, and cannot book meetings or send messages.</p>
    <ul className="mt-6 list-disc space-y-3 pl-5"><li><Link className="underline" href="/llms.txt">Agent index (llms.txt)</Link></li><li><Link className="underline" href="/index.md">Homepage Markdown</Link>, also served for <code>Accept: text/markdown</code> on the homepage.</li><li><Link className="underline" href="/.well-known/mcp/server-card.json">MCP server card</Link></li></ul>
    <h2 className="mt-8 text-xl font-semibold">MCP connection</h2><p className="mt-3 break-all leading-7">Endpoint: <code>{origin}/mcp</code>. Streamable HTTP with JSON responses; protocol {mcpProtocolVersion}. Stateless, read-only, no authentication required. GET returns 405 because no SSE subscription is offered.</p>
    <p className="mt-3 leading-7">Send JSON-RPC 2.0 requests by POST with Content-Type: application/json and Accept: application/json, text/event-stream. Initialize with protocolVersion, clientInfo and capabilities, then use tools/list or tools/call. Browser-origin requests must come from HYMN&apos;s configured public origin; non-browser clients can omit Origin.</p>
    <pre className="mt-4 overflow-x-auto rounded-xl border border-[var(--border)] p-4 text-xs">{JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: mcpProtocolVersion, capabilities: {}, clientInfo: { name: "example-client", version: "1.0.0" } } }, null, 2)}</pre>
    <ul className="mt-6 space-y-4">{publicAgentTools.map(tool => <li key={tool.name}><code>{tool.name}</code><p className="mt-1 text-sm leading-7 text-[var(--text-muted)]">{tool.description}</p></li>)}</ul>
    <h2 className="mt-8 text-xl font-semibold">Browser tools</h2><p className="mt-3 leading-7">Public pages register the same tools when the browser supports WebMCP. HYMN detects document.modelContext first and supports the earlier navigator.modelContext experiment. Browsers without WebMCP continue to work normally.</p>
    <p className="mt-6 text-sm leading-7">Content-use preferences are published in <Link className="underline" href="/robots.txt">robots.txt</Link>. Licensed music and artwork remain subject to their rights holders&apos; permissions.</p>
  </main>;
}
