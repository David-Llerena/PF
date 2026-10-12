import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

function supabaseOrigins(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    if (url) {
      const { host, protocol } = new URL(url);
      const ws = protocol === "https:" ? "wss:" : "ws:";
      return `${protocol}//${host} ${ws}//${host}`;
    }
  } catch {
    // URL inválida: se usa el comodín de Supabase
  }
  return "https://*.supabase.co wss://*.supabase.co";
}

/**
 * Content-Security-Policy: solo recursos propios y la API de Supabase.
 * Next.js requiere 'unsafe-inline' en scripts sin nonces; 'unsafe-eval' solo en desarrollo.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins()}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Las páginas con datos financieros no deben quedar en cachés compartidas.
        source: "/((?!_next/static|icons|manifest.webmanifest).*)",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
