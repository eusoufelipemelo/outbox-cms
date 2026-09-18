"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Label, Select } from "@/components/ui/field";

export type PickerSite = { id: string; name: string; url: string; clientName: string };

/** Seleciona o site (`?site=<id>`) cujos códigos de integração são exibidos. */
export function SitePicker({ sites, value, keep = {} }: { sites: PickerSite[]; value: string; keep?: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const groups = new Map<string, PickerSite[]>();
  for (const s of sites) groups.set(s.clientName, [...(groups.get(s.clientName) ?? []), s]);

  function onChange(id: string) {
    const params = new URLSearchParams(keep);
    params.set("site", id);
    startTransition(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }));
  }

  return (
    <div className="w-full max-w-md space-y-1.5">
      <Label htmlFor="integration-site">Site</Label>
      <Select
        id="integration-site"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-busy={pending || undefined}
        className={pending ? "opacity-70" : undefined}
      >
        {[...groups.entries()].map(([client, list]) => (
          <optgroup key={client} label={client}>
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </div>
  );
}
