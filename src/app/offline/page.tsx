import { WifiOff } from "lucide-react";
import { BrandMark } from "@/components/layout/brand";

export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandMark className="size-12" />
      <WifiOff className="size-6 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Sin conexión</h1>
      <p className="max-w-xs text-sm text-muted-foreground">
        Tus datos financieros no se guardan en el dispositivo por seguridad. Conéctate a internet para verlos y
        registrar movimientos.
      </p>
    </main>
  );
}
