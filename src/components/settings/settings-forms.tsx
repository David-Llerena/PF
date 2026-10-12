"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Field, Input } from "@/components/ui/primitives";
import { clearDemoData, loadDemoData, saveCategory, setCategoryActive, updateProfile } from "@/actions/settings";
import { ACCOUNT_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ActionResult, Category, CategoryKind } from "@/lib/types";

function useActionToast() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Listo");
        after?.();
        router.refresh();
      } else toast.error(res.error);
    });
  return { pending, run };
}

export function ProfileForm({ fullName }: { fullName: string }) {
  const [name, setName] = useState(fullName);
  const { pending, run } = useActionToast();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateProfile({ full_name: name }));
      }}
    >
      <Field label="Nombre" htmlFor="full_name" className="flex-1">
        <Input id="full_name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button type="submit" loading={pending} disabled={name === fullName}>
        Guardar
      </Button>
    </form>
  );
}

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [tab, setTab] = useState<CategoryKind>("expense");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const { run } = useActionToast();
  const list = categories.filter((c) => c.kind === tab);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "h-8 rounded-lg px-4 text-sm font-medium text-muted-foreground",
                tab === k && "bg-card text-foreground shadow-sm",
              )}
            >
              {k === "expense" ? "Gastos" : "Ingresos"}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Categoría
        </Button>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <li
            key={c.id}
            className={cn("flex items-center gap-3 rounded-xl border px-3 py-2", !c.is_active && "opacity-50")}
          >
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
            <span className="flex-1 truncate text-sm">{c.name}</span>
            {!c.is_active && <Badge>Inactiva</Badge>}
            <button
              type="button"
              aria-label={`Editar ${c.name}`}
              onClick={() => setEditing(c)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => run(() => setCategoryActive({ id: c.id }, !c.is_active))}
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {c.is_active ? "Desactivar" : "Activar"}
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={editing === "new" ? "Nueva categoría" : "Editar categoría"}>
            <CategoryForm
              category={editing === "new" ? undefined : editing}
              kind={tab}
              onDone={() => setEditing(null)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function CategoryForm({ category, kind, onDone }: { category?: Category; kind: CategoryKind; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? ACCOUNT_COLORS[0]);
  const { pending, run } = useActionToast();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveCategory({ id: category?.id, name, kind: category?.kind ?? kind, color }), onDone);
      }}
    >
      <Field label="Nombre" htmlFor="cat-name">
        <Input id="cat-name" value={name} maxLength={40} required onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className={cn("size-8 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-ring")}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </fieldset>
      <Button type="submit" loading={pending} disabled={!name.trim()}>
        Guardar
      </Button>
    </form>
  );
}

export function DemoDataCard({ loaded }: { loaded: boolean }) {
  const { pending, run } = useActionToast();
  const [confirm, setConfirm] = useState(false);

  return loaded ? (
    <>
      <Button variant="outline" onClick={() => setConfirm(true)} loading={pending}>
        <Trash2 /> Borrar datos de demostración
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="¿Borrar los datos de demostración?"
        description="Se eliminarán únicamente las cuentas y movimientos marcados como Demo. Tus datos reales no se tocan."
        confirmLabel="Borrar demo"
        onConfirm={() => run(() => clearDemoData())}
      />
    </>
  ) : (
    <Button variant="secondary" onClick={() => run(() => loadDemoData())} loading={pending}>
      <Sparkles /> Cargar datos de demostración
    </Button>
  );
}
