// Cópia de segurança do rascunho no navegador. Usada quando o CMS é atualizado com a aba aberta:
// o editor guarda o texto, recarrega a página na versão nova e restaura o que não tinha sido salvo.

const PREFIX = "outbox-draft-backup:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Backup<T> = { at: number; draft: T };

export function backupKey(postId: string | null): string {
  return PREFIX + (postId ?? "novo");
}

export function saveDraftBackup<T>(postId: string | null, draft: T) {
  try {
    localStorage.setItem(backupKey(postId), JSON.stringify({ at: Date.now(), draft } satisfies Backup<T>));
  } catch {
    // sem espaço ou navegação privada: segue sem cópia
  }
}

/** Devolve a cópia (e apaga) se for mais nova que a versão salva no servidor. */
export function takeDraftBackup<T>(postId: string | null, serverUpdatedAt: string | null | undefined): T | null {
  try {
    const raw = localStorage.getItem(backupKey(postId));
    if (!raw) return null;
    localStorage.removeItem(backupKey(postId));
    const b = JSON.parse(raw) as Backup<T>;
    if (!b?.draft || Date.now() - b.at > MAX_AGE_MS) return null;
    if (serverUpdatedAt && Date.parse(serverUpdatedAt) > b.at) return null;
    return b.draft;
  } catch {
    return null;
  }
}
