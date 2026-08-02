"use client";

// The dynamic-system control. Dropping a new .xlsx UPDATES the existing
// dashboards in place: POST /datasets recomputes the full pipeline, makes
// the new file the active dataset, and router.refresh() re-renders every
// page from it. Nothing new is created and no old dashboard survives
// alongside: same views, new numbers. The copy says "update" throughout
// because "run on another extract" once read as spawning a second,
// separate analysis, which is not what happens.
//
// Styled as one hairline row rather than a large dashed drop zone. It sits
// at the top of the overview because it is the first thing a reviewer will
// want to try, and a quiet row keeps it there without competing with the
// finding underneath. The drop state is the exception: yellow, because a
// live drag target should be unmistakable, and it exists only while a file
// is over the window.

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
    setMessage(
      `Updating from ${file.name}: the full pipeline is recomputing.`,
    );
    const body = new FormData();
    body.append("file", file);
    try {
      const resp = await fetch(`${API_BASE}/datasets`, {
        method: "POST",
        body,
      });
      if (!resp.ok) {
        const detail = (await resp.json()) as { detail?: string };
        setPhase("error");
        setMessage(
          detail.detail ?? `The file was not accepted (${resp.status}).`,
        );
        return;
      }
      const data = (await resp.json()) as {
        dataset_hash: string;
        validation: { n_rows: number; identity2_ok: boolean };
      };
      setPhase("done");
      setMessage(
        `Updated: ${data.validation.n_rows.toLocaleString()} rows ` +
          `(dataset ${data.dataset_hash}). Every dashboard now shows this data.`,
      );
      router.refresh();
    } catch {
      setPhase("error");
      setMessage(
        "The API is not answering. Start it with make api, then try again.",
      );
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
      className={`border transition-colors ${
        dragging ? "border-ink bg-yellow" : "border-line bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-2.5">
        <p className="min-w-0 flex-1 text-body">
          <span className="font-semibold">Update with new data.</span>{" "}
          <span className="text-muted">
            Drop the latest <span className="font-mono text-caption">.xlsx</span>{" "}
            in the same format and these dashboards refresh from it: every
            figure, threshold and call list recomputes. The manual drop is only
            the transport. The same intake can be fed by a scheduled MIS export
            or a direct API read, which is what would make these dashboards
            live.
          </span>
        </p>
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-2 border-[1.5px] border-ink bg-ink px-4 py-1.5 text-body font-semibold text-canvas transition-colors hover:bg-yellow hover:text-ink disabled:cursor-wait"
        >
          {busy && (
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
          {busy ? "Updating" : "Choose file"}
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
          className={`border-t border-line px-4 py-2.5 text-body ${
            phase === "error" ? "font-semibold text-ink" : "text-muted"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
