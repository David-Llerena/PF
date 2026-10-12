"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuickAdd } from "@/components/forms/quick-add";
import type { MovementKind } from "@/components/forms/movement-form";

export function NewMovementButton({ kind, label = "Nuevo" }: { kind?: MovementKind; label?: string }) {
  const { open } = useQuickAdd();
  return (
    <Button onClick={() => open({ kind })} className="hidden md:inline-flex">
      <Plus /> {label}
    </Button>
  );
}
