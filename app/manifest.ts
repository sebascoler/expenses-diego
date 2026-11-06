import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gastos Diego",
    short_name: "Gastos",
    description: "Rendición mensual de gastos",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f766e",
    lang: "es-AR",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
