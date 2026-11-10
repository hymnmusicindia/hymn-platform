/** Only an explicitly requested, acceptable Markdown representation wins. */
export function prefersMarkdown(accept: string | null) {
  const types = (accept || "").toLowerCase().split(",").map(part => {
    const [type, ...parameters] = part.trim().split(";");
    const q = parameters.map(value => value.trim()).find(value => value.startsWith("q="));
    const quality = q ? Number(q.slice(2)) : 1;
    return { type, quality: Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0 };
  });
  const markdown = types.find(type => type.type === "text/markdown")?.quality || 0;
  const html = types.find(type => type.type === "text/html")?.quality ?? types.find(type => type.type === "text/*")?.quality ?? types.find(type => type.type === "*/*")?.quality ?? 0;
  return markdown > 0 && markdown >= html;
}
