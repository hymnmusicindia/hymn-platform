"use client";
import { Fragment } from "react";
// A deliberately small, escaped Markdown renderer. Never uses innerHTML or
// accepts arbitrary HTML, script URLs, remote embeds or confidential AI calls.
export function TeamRichText({ value }: { value: string }) {
  return <div>{value.split("\n").map((line, n) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
    const content = parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
      return link ? <a key={i} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a> : <Fragment key={i}>{part}</Fragment>;
    });
    return line.startsWith("- ") ? <p key={n}>• {content}</p> : <p key={n}>{content}</p>;
  })}</div>;
}
