import type { SourceEmbed } from "@/lib/contracts";

// Sandboxed player built from ids we validated — provider embed_html is never
// rendered (XSS surface). youtube-nocookie keeps tracking down.
const EMBED_SRC: Record<SourceEmbed["provider"], (id: string) => string> = {
  tiktok: (id) => `https://www.tiktok.com/embed/v2/${encodeURIComponent(id)}`,
  youtube: (id) => `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`,
};

export default function SourceVideo({ embed }: { embed: SourceEmbed }) {
  const portrait = embed.provider === "tiktok";
  return (
    <iframe
      src={EMBED_SRC[embed.provider](embed.video_id)}
      sandbox="allow-scripts allow-same-origin allow-popups"
      allow="encrypted-media; picture-in-picture"
      style={{
        border: "1px solid #eee",
        borderRadius: 8,
        width: portrait ? 325 : "100%",
        height: portrait ? 575 : 400,
        maxWidth: "100%",
      }}
      title="Source video"
    />
  );
}
