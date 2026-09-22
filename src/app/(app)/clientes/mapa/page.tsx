import { redirect } from "next/navigation";

// Endereço antigo do mapa: agora ele é uma seção própria do menu.
export default function OldMapPage() {
  redirect("/mapa");
}
