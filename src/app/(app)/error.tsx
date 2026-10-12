"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/primitives";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle />}
      title="No pudimos cargar tu información"
      description="Revisa tu conexión e intenta nuevamente. Tus datos no se han modificado."
      action={
        <div className="flex flex-col items-center gap-2">
          <Button onClick={reset}>Reintentar</Button>
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Código de error: <span className="font-mono">{error.digest}</span>
            </p>
          )}
        </div>
      }
    />
  );
}
