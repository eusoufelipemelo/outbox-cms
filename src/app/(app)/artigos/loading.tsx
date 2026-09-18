import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div role="status" className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      Carregando
    </div>
  );
}
