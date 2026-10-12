import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        <SearchX className="size-6" />
      </span>
      <h1 className="text-xl font-semibold">No encontramos esta página</h1>
      <p className="max-w-xs text-sm text-muted-foreground">El enlace no existe o el registro no te pertenece.</p>
      <Button asChild>
        <Link href="/">Volver al inicio</Link>
      </Button>
    </main>
  );
}
