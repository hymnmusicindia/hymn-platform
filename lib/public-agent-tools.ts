import { publicBusiness, publicServices } from "./public-business";
import { distributionPricing } from "./public-agent-content";

const emptySchema = { type: "object", properties: {}, additionalProperties: false };
export const publicAgentTools = [
  { name: "hymn_get_business_info", description: "Read HYMN Music's public phone, email, official profiles and contact page. No account data.", inputSchema: emptySchema },
  { name: "hymn_list_services", description: "List HYMN's public music distribution, beat licensing, studio and artist services with links.", inputSchema: emptySchema },
  { name: "hymn_get_distribution_pricing", description: "Read distribution prices in INR and optionally estimate the one-time base price for 1–100 tracks. Add-ons cost extra; this does not create a checkout or purchase.", inputSchema: { type: "object", properties: { trackCount: { type: "integer", minimum: 1, maximum: 100, description: "Number of tracks for a one-time base-price estimate. Defaults to 1." } }, additionalProperties: false } },
].map(tool => ({ ...tool, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

export function executePublicAgentTool(name: string, input: unknown, origin: string) {
  const tool = publicAgentTools.find(item => item.name === name);
  if (!tool) throw new Error("Unknown public tool.");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Arguments must be an object.");
  const args = input as Record<string, unknown>;
  const allowed = name === "hymn_get_distribution_pricing" ? ["trackCount"] : [];
  if (Object.keys(args).some(key => !allowed.includes(key))) throw new Error("Unexpected argument.");
  if (args.trackCount !== undefined && (typeof args.trackCount !== "number" || !Number.isInteger(args.trackCount) || args.trackCount < 1 || args.trackCount > 100)) throw new Error("trackCount must be an integer from 1 to 100.");
  const data = name === "hymn_get_business_info" ? { ...publicBusiness, url: origin, contactUrl: `${origin}/contact` }
    : name === "hymn_list_services" ? { services: publicServices.map(service => ({ ...service, url: `${origin}${service.path}` })) }
    : { ...distributionPricing(args.trackCount as number | undefined), pricingUrl: `${origin}/pricing` };
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], isError: false };
}

export const mcpProtocolVersion = "2025-06-18";
export const publicMcpServerInfo = { name: "hymn-public-information", title: "HYMN Music public information", version: "1.0.0" };
export const publicMcpCapabilities = { tools: { listChanged: false } };
export function publicMcpServerCard(origin: string) {
  return { "$schema": "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json", version: "1.0", protocolVersion: mcpProtocolVersion,
    serverInfo: publicMcpServerInfo, description: "Public, read-only HYMN Music business, service and distribution-pricing information.",
    documentationUrl: `${origin}/agents`, iconUrl: `${origin}/icon-512.png`, transport: { type: "streamable-http", endpoint: `${origin}/mcp` },
    capabilities: publicMcpCapabilities, authentication: { required: false }, tools: publicAgentTools,
    instructions: "Public information only. No account access, booking, purchases, uploads, calendar changes or messages." };
}
