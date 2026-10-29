"use client";
// Loads the demo person's profile and graph for both modes, from the live API or (with ?fixtures=1)
// from the committed fixtures. Both modes are fetched up front so the switch flips instantly.
import { useEffect, useState } from "react";
import type { GraphView, ProfileFacts } from "@glasshouse/engine";
import openProfile from "../../../../fixtures/profile.open.json";

export type Mode = "open" | "shield";
export interface ModeData { profile: ProfileFacts; graph: GraphView }
export type DemoData = Record<Mode, ModeData>;

export const DEMO_WALLET = openProfile.seed_wallet;

async function fromFixtures(): Promise<DemoData> {
  const [po, ps, go, gs] = await Promise.all([
    import("../../../../fixtures/profile.open.json"),
    import("../../../../fixtures/profile.shield.json"),
    import("../../../../fixtures/graph.open.json"),
    import("../../../../fixtures/graph.shield.json"),
  ]);
  return {
    open: { profile: po.default as ProfileFacts, graph: go.default as GraphView },
    shield: { profile: ps.default as ProfileFacts, graph: gs.default as GraphView },
  };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body as T;
}

async function fromApi(): Promise<DemoData> {
  const load = async (mode: Mode): Promise<ModeData> => {
    const q = `wallet=${DEMO_WALLET}&mode=${mode}`;
    const [profile, graph] = await Promise.all([
      getJson<ProfileFacts>(`/api/profile?${q}`),
      getJson<GraphView>(`/api/graph?${q}`),
    ]);
    return { profile, graph };
  };
  const [open, shield] = await Promise.all([load("open"), load("shield")]);
  return { open, shield };
}

export type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: DemoData; source: "api" | "fixtures" };

export function useDemoData(): Load {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  useEffect(() => {
    const useFixtures = new URLSearchParams(window.location.search).get("fixtures") === "1";
    let alive = true;
    (useFixtures ? fromFixtures() : fromApi())
      .then((data) => alive && setLoad({ state: "ready", data, source: useFixtures ? "fixtures" : "api" }))
      .catch((err: unknown) => alive && setLoad({ state: "error", message: err instanceof Error ? err.message : String(err) }));
    return () => {
      alive = false;
    };
  }, []);
  return load;
}

// One write-up per profile per visit: flipping the switch back and forth does not ask again.
const written = new WeakMap<ProfileFacts, string>();

export function useNarrative(profile: ProfileFacts | undefined): string | null {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!profile) return;
    const known = written.get(profile);
    if (known !== undefined) return setText(known);
    let alive = true;
    setText(null);
    fetch("/api/narrative", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profile) })
      .then((r) => r.json())
      .then((b: { text?: string }) => {
        if (b.text) written.set(profile, b.text);
        if (alive) setText(b.text ?? "");
      })
      .catch(() => alive && setText(""));
    return () => {
      alive = false;
    };
  }, [profile]);
  return text;
}
