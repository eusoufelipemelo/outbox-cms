import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/panel";

export default function ArticleNotFound() {
  return (
    <EmptyState
      title="Artigo não encontrado"
      description="Ele pode ter sido excluído ou o endereço está incorreto."
      action={
        <Link href="/artigos" className={buttonClass("secondary", "md")}>
          Voltar para Artigos
        </Link>
      }
    />
  );
}
