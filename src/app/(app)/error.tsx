"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle />}
      title="No pudimos cargar tu información"
      description="Revisa tu conexión e intenta nuevamente. Tus datos no se han modificado."
      action={<Button onClick={reset}>Reintentar</Button>}
    />
  );
}
