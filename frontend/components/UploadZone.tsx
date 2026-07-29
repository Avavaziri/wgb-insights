"use client";

// The dynamic-system control: drop a new .xlsx of the same schema and
// every page refreshes from the recomputed results. POSTs to /datasets,
// shows the validation verdict, then refreshes all server components.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

type Phase = "idle" | "uploading" | "done" | "error";

export default function UploadZone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  async function upload(file: File) {
    setPhase("uploading");
    setMessage(`Running full pipeline on ${file.name} — every module recomputes…`);
    const body = new FormData();
    body.append("file", file);
    try {
      const resp = await fetch(`${API_BASE}/datasets`, { method: "POST", body });
      if (!resp.ok) {
        const detail = (await resp.json()) as { detail?: string };
        setPhase("error");
        setMessage(detail.detail ?? `Upload failed (${resp.status})`);
        return;
      }
      const data = (await resp.json()) as {
        dataset_hash: string;
        validation: { n_rows: number; identity2_ok: boolean };
      };
      setPhase("done");
      setMessage(
        `Loaded ${data.validation.n_rows.toLocaleString()} rows ` +
          `(dataset ${data.dataset_hash}). All pages refreshed.`,
      );
      router.refresh();
    } catch {
      setPhase("error");
      setMessage("API unreachable — start it with `make api`.");
    }
  }

  return (
    <div
      className={`border-4 border-dashed p-6 text-center transition-colors ${
        phase === "error" ? "border-black bg-neutral-100" : "border-black"
      }`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) void upload(f);
      }}
    >
      <p className="font-black uppercase tracking-wide">
        Drop a new .xlsx here — same schema, every result refreshes
      </p>
      <button
        className="mt-3 border-2 border-black bg-[#FFE600] px-4 py-2 font-bold hover:bg-black hover:text-[#FFE600]"
        onClick={() => input.current?.click()}
        disabled={phase === "uploading"}
      >
        {phase === "uploading" ? "Recomputing…" : "Choose file"}
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
      {message && (
        <p className={`mt-3 text-sm ${phase === "error" ? "font-bold" : "text-neutral-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
