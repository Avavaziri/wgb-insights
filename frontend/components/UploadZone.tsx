"use client";

// The dynamic-system control: drop a new .xlsx of the same schema and every
// page refreshes from the recomputed results. POSTs to /datasets, shows the
// validation verdict, then refreshes all server components.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

type Phase = "idle" | "uploading" | "done" | "error";

export default function UploadZone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setPhase("uploading");
    setMessage(`Running the full pipeline on ${file.name}. Every module recomputes.`);
    const body = new FormData();
    body.append("file", file);
    try {
      const resp = await fetch(`${API_BASE}/datasets`, { method: "POST", body });
      if (!resp.ok) {
        const detail = (await resp.json()) as { detail?: string };
        setPhase("error");
        setMessage(detail.detail ?? `The file was not accepted (${resp.status}).`);
        return;
      }
      const data = (await resp.json()) as {
        dataset_hash: string;
        validation: { n_rows: number; identity2_ok: boolean };
      };
      setPhase("done");
      setMessage(
        `Loaded ${data.validation.n_rows.toLocaleString()} rows ` +
          `(dataset ${data.dataset_hash}). Every page now reads from it.`,
      );
      router.refresh();
    } catch {
      setPhase("error");
      setMessage("The API is not answering. Start it with make api, then try again.");
    }
  }

  const busy = phase === "uploading";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files[0];
        if (f) void upload(f);
      }}
      className={`border-[1.5px] border-dashed p-4 transition-colors ${
        dragging ? "border-ink bg-yellow" : "border-line bg-white"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">
            Drop an <span className="font-mono text-[13px]">.xlsx</span> of the
            same shape here
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Every statistic, chart, threshold and call list is recomputed from
            the file. Nothing on this site is hardcoded.
          </p>
        </div>
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 border-[1.5px] border-ink bg-yellow px-4 py-2 text-[13.5px] font-semibold text-ink hover:bg-ink hover:text-white disabled:cursor-wait"
        >
          {busy && (
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {busy ? "Recomputing" : "Choose file"}
        </button>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </div>
      {message && (
        <p
          aria-live="polite"
          className={`mt-3 border-t border-line pt-3 text-[12.5px] ${
            phase === "error" ? "font-semibold text-ink" : "text-muted"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
