import { executePublicAgentTool, mcpProtocolVersion, publicAgentTools, publicMcpCapabilities, publicMcpServerInfo } from "@/lib/public-agent-tools";
import { getPublicAppUrl } from "@/lib/public-app-url";

const maximumBodyBytes = 16_384;
function headers() { return { "Access-Control-Allow-Origin": getPublicAppUrl(), "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version", "Cache-Control": "no-store", "Vary": "Origin" }; }
function validOrigin(request: Request) { const origin = request.headers.get("origin"); return origin === null || origin === getPublicAppUrl(); }
function error(id: unknown, code: number, message: string, status = 200) { return Response.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status, headers: headers() }); }

export function GET(request: Request) { return validOrigin(request) ? new Response(null, { status: 405, headers: { ...headers(), Allow: "POST, OPTIONS" } }) : error(null, -32600, "Origin is not allowed.", 403); }
export function OPTIONS(request: Request) { return validOrigin(request) ? new Response(null, { status: 204, headers: headers() }) : error(null, -32600, "Origin is not allowed.", 403); }

export async function POST(request: Request) {
  if (!validOrigin(request)) return error(null, -32600, "Origin is not allowed.", 403);
  if (request.headers.get("mcp-protocol-version") && request.headers.get("mcp-protocol-version") !== mcpProtocolVersion) return error(null, -32600, "Unsupported protocol version.", 400);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return error(null, -32600, "Content-Type must be application/json.", 415);
  const accept = request.headers.get("accept") || "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) return error(null, -32600, "Accept must include application/json and text/event-stream.", 406);
  if (Number(request.headers.get("content-length")) > maximumBodyBytes) return error(null, -32600, "Request too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return error(null, -32700, "JSON body required.", 400);
  let text = "", size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > maximumBodyBytes) { await reader.cancel(); return error(null, -32600, "Request too large.", 413); } text += decoder.decode(part.value, { stream: true }); }
    text += decoder.decode();
  } catch { return error(null, -32700, "Unable to read request.", 400); }
  let message: Record<string, unknown>;
  try { message = JSON.parse(text); } catch { return error(null, -32700, "Invalid JSON.", 400); }
  if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0") return error(null, -32600, "Expected a single JSON-RPC 2.0 message.", 400);
  const hasId = Object.hasOwn(message, "id");
  if (hasId && typeof message.id !== "string" && !(typeof message.id === "number" && Number.isFinite(message.id))) return error(null, -32600, "Invalid request id.", 400);
  if (typeof message.method !== "string") {
    if (hasId && (Object.hasOwn(message, "result") || Object.hasOwn(message, "error"))) return new Response(null, { status: 202, headers: headers() });
    return error(null, -32600, "Method required.", 400);
  }
  if (message.params !== undefined && (!message.params || typeof message.params !== "object" || Array.isArray(message.params))) return error(message.id, -32602, "Parameters must be an object.", 400);
  if (!hasId) return new Response(null, { status: 202, headers: headers() });
  const params = (message.params || {}) as Record<string, unknown>;
  let result: unknown;
  switch (message.method) {
    case "initialize":
      if (typeof params.protocolVersion !== "string" || !params.clientInfo || typeof params.clientInfo !== "object" || Array.isArray(params.clientInfo) || typeof (params.clientInfo as Record<string, unknown>).name !== "string" || typeof (params.clientInfo as Record<string, unknown>).version !== "string" || !params.capabilities || typeof params.capabilities !== "object" || Array.isArray(params.capabilities)) return error(message.id, -32602, "Initialization requires protocolVersion, clientInfo (name and version), and capabilities.");
      result = { protocolVersion: mcpProtocolVersion, capabilities: publicMcpCapabilities, serverInfo: publicMcpServerInfo, instructions: "Read-only public information. No accounts, bookings or transactions." }; break;
    case "ping": result = {}; break;
    case "tools/list": result = { tools: publicAgentTools }; break;
    case "tools/call":
      if (typeof params.name !== "string" || !publicAgentTools.some(tool => tool.name === params.name)) return error(message.id, -32602, "Unknown public tool.");
      try { result = executePublicAgentTool(params.name, params.arguments === undefined ? {} : params.arguments, getPublicAppUrl()); }
      catch (cause) { return error(message.id, -32602, cause instanceof Error ? cause.message : "Invalid tool arguments."); }
      break;
    default: return error(message.id, -32601, "Method not found.");
  }
  return Response.json({ jsonrpc: "2.0", id: message.id, result }, { headers: headers() });
}
