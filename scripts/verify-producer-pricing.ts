import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";
import { prisma } from "../lib/prisma";
import { updateBeat } from "../lib/db";
import { beatLicensePrice } from "../lib/beat-store";
import { beatMutationSchema } from "../lib/validation";
import { beatMetadataRequiresReview } from "../lib/beat-price-policy";

async function main() {
  if (!process.env.DATABASE_URL?.includes("127.0.0.1:55462/pricing_fixture")) throw new Error("Isolated pricing fixture required.");
  const user = await prisma.user.create({ data: { name: "Pricing fixture producer", email: "pricing@example.test", googleId: "pricing-fixture", role: "PRODUCER" } });
  const beat = await prisma.beat.create({ data: { userId: user.id, title: "Pricing test", bpm: 93, genre: "Hip hop", mood: "Bold", keySignature: "D Minor", priceCents: 99900, generalPriceCents: 18000, exclusivePriceCents: 500000, status: "PUBLISHED", enabled: true } });
  assert.equal(beat.mp3PriceCents, 12000);
  const changed = await updateBeat(beat.id, { price: 249.50 }); assert.ok(changed);
  assert.equal(changed.price, 249.50); assert.equal(changed.stemPrice, 999); assert.equal(changed.generalPrice, 180);
  assert.equal(beatLicensePrice(changed, "mp3"), 249.50);
  assert.equal(beatLicensePrice(changed, "stems"), 999);
  assert.equal(beatMetadataRequiresReview(beat, { title: beat.title, bpm: beat.bpm, price: 300, generalPrice: 500 }), false);
  assert.equal(beatMetadataRequiresReview(beat, { keySignature: "G Minor" }), true);
  assert.equal(beatMutationSchema.safeParse({ price: -1 }).success, false);
  assert.equal(beatMutationSchema.safeParse({ price: 1.001 }).success, false);
  assert.equal(beatMutationSchema.safeParse({ price: 249.50, generalPrice: 0, stemPrice: 0, exclusivePrice: 0 }).success, true);
  // Exercise the actual PATCH handler against real persistence, with only the
  // Next cookie/session boundary replaced by a deterministic fixture identity.
  let actor = { id: user.id, role: "producer" };
  const filename = "app/api/producer/beats/[id]/route.ts";
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const routeModule = { exports: {} as { PATCH: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response> } };
  const actualRequire = createRequire(import.meta.url);
  vm.runInNewContext(compiled, { exports: routeModule.exports, require: (id: string) => id === "@/lib/access" ? { requireRole: async () => ({ user: actor }) } : id === "@/lib/db" ? { updateBeat } : id === "@/lib/prisma" ? { prisma } : id === "@/lib/validation" ? { beatMutationSchema } : id === "@/lib/beat-price-policy" ? { beatMetadataRequiresReview } : id === "@/lib/task-queue" ? { createAdminTaskOnce: async () => { throw new Error("Price-only updates must not request review."); } } : ["@/lib/private-storage", "@/lib/storage"].includes(id) ? {} : actualRequire(id) });
  const patch = (body: unknown) => routeModule.exports.PATCH(new Request("http://localhost/api/producer/beats/1", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: String(beat.id) }) });
  assert.equal((await patch({ price: 350, generalPrice: 200, stemPrice: 1000, exclusivePrice: 5000, title: beat.title, bpm: beat.bpm, genre: beat.genre, mood: beat.mood, keySignature: beat.keySignature, description: beat.description })).status, 200);
  const persisted = await prisma.beat.findUniqueOrThrow({ where: { id: beat.id } }); assert.equal(persisted.status, "PUBLISHED"); assert.equal(persisted.enabled, true); assert.equal(persisted.mp3PriceCents, 35000); assert.equal(persisted.priceCents, 100000);
  assert.equal((await patch({ stemPrice: 6000 })).status, 400, "Partial tier edits must validate the merged exclusive price.");
  actor = { id: user.id + 100, role: "producer" }; assert.equal((await patch({ price: 10 })).status, 403);
  console.log("PASS: migration defaults, independent MP3/WAV/stems prices, storefront/checkout quote, precision validation, owner-only PATCH, merged tier validation and published price-only edits.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
