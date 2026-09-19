import type { Metadata } from "next";
import { noticeFor } from "@/lib/auth-errors";
import { FormAlert } from "../_components/form-alert";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/esqueci-senha">) {
  const { erro } = await searchParams;
  const notice = noticeFor(erro);
  return <ForgotForm notice={notice ? <FormAlert message={notice} /> : null} />;
}
