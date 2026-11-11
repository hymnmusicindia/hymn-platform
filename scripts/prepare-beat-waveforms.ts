import { prisma } from "../lib/prisma";
import { prepareBeatWaveforms } from "../lib/beat-waveform";

// Bounded, resumable backfill; never load the complete catalogue into memory.
async function main() {
  const args = process.argv.slice(2);
  const number = (name: string, fallback: number) => {
    const index = args.indexOf(name);
    const value = index < 0 ? fallback : Number(args[index + 1]);
    if (!Number.isSafeInteger(value) || value < 0) throw Error(`Invalid ${name}`);
    return value;
  };
  const afterId = number("--after-id", 0), limit = Math.max(1, Math.min(1000, number("--limit", 25)));
  const beats = await prisma.beat.findMany({
    where: { id: { gt: afterId }, enabled: true, status: { in: ["PUBLISHED", "EXCLUSIVE_RESERVED"] }, user: { status: "ACTIVE" } },
    select: { id: true }, orderBy: { id: "asc" }, take: limit
  });
  for (const beat of beats) {
    const sources = await prepareBeatWaveforms(beat.id);
    console.log(JSON.stringify({ beatId: beat.id, sources }));
  }
  console.log(JSON.stringify({ processed: beats.length, nextAfterId: beats.at(-1)?.id ?? afterId, limit }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
