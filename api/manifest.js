/*
 * Manifest do app de férias de cada pessoa: a página de início é o link
 * pessoal (/ferie/<token>), para o ícone na tela do celular abrir direto
 * os pedidos dela. Só monta o JSON; não consulta o banco.
 */

export function ferieManifest(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ""))) return null;
  return {
    id: `/ferie/${token}`,
    name: "OM Service · Officine Mattio",
    short_name: "OM Service",
    description: "Ferie e agenda, spedizioni e ritiri, assistenza e garanzie.",
    start_url: `/ferie/${token}`,
    scope: "/ferie/",
    display: "standalone",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    lang: "it",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

export default function handler(req, res) {
  const m = ferieManifest(req.query?.t);
  if (!m) return res.status(404).json({ error: "not_found" });
  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.status(200).send(JSON.stringify(m));
}
