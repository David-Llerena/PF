import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { ServiceWorkerRegister } from "@/components/layout/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Finanzas", template: "%s · Finanzas" },
  description: "Administra tus cuentas, ingresos, gastos y obligaciones en un solo lugar.",
  applicationName: "Finanzas",
  appleWebApp: { capable: true, title: "Finanzas", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0c14" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-EC" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} min-h-dvh antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
