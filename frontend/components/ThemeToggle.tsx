"use client";

// The light/dark switch, in the masthead.
//
// Dark is the default: the stylesheet's own token block IS the dark theme
// and light is an override under [data-theme="light"], so a page with no
// stored preference and no JS still renders dark correctly.
//
// The <html data-theme> attribute is the single source of truth, set before
// first paint by the inline script in layout.tsx. This button reads that
// attribute rather than keeping its own copy of the state, so the label can
// never disagree with the page it is describing.
//
// useSyncExternalStore is the right hook for exactly that: state living
// outside React, in the DOM. It also solves hydration cleanly, because the
// server snapshot is the dark default while the client snapshot reads the
// real attribute, and React reconciles the two after hydration instead of
// warning about a mismatch. (An effect calling setState would do the same
// job worse, and is a lint error here.)

import { useSyncExternalStore } from "react";

const KEY = "wgb-theme";

let listeners: (() => void)[] = [];

function subscribe(cb: () => void) {
  listeners = [...listeners, cb];
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

const isLight = () => document.documentElement.dataset.theme === "light";
/** Server and pre-hydration snapshot: dark, the default. */
const isLightOnServer = () => false;

export default function ThemeToggle() {
  const light = useSyncExternalStore(subscribe, isLight, isLightOnServer);

  function toggle() {
    const next = light ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode or a blocked store: the theme still applies to this
      // page, it just will not be remembered. Not worth surfacing.
    }
    listeners.forEach((l) => l());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={light}
      title={light ? "Switch to dark" : "Switch to light"}
      className="inline-flex items-center gap-1.5 border border-white/30 px-2.5 py-1 text-micro font-bold uppercase tracking-[0.09em] text-white transition-colors hover:border-yellow hover:text-yellow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow"
    >
      {/* Decorative: the word beside it is the accessible label. */}
      <svg aria-hidden viewBox="0 0 16 16" className="size-3.5">
        {light ? (
          <>
            <circle
              cx="8"
              cy="8"
              r="3.25"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M12.8 3.2l-1.4 1.4M4.6 11.4l-1.4 1.4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </>
        ) : (
          <path
            d="M13.2 10.4A5.6 5.6 0 0 1 5.6 2.8a5.6 5.6 0 1 0 7.6 7.6Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {light ? "Light" : "Dark"}
    </button>
  );
}
