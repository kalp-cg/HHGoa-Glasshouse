// Route handlers called directly, OFFLINE_MODE (engine). Compared with the committed fixtures,
// which is what Antigravity builds the UI against: same answers from the API means no visual change.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateGraphView, validateProfileFacts, type ProfileFacts } from "@glasshouse/engine";
import { beforeAll, describe, expect, it } from "vitest";

const fixtures = join(import.meta.dirname, "../../../../../fixtures");
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(fixtures, name), "utf8"));
const openFacts = fixture("profile.open.json") as ProfileFacts;
const seed = openFacts.seed_wallet;

let profileGET: (r: Request) => Promise<Response>;
let graphGET: (r: Request) => Promise<Response>;
let narrativePOST: (r: Request) => Promise<Response>;

beforeAll(async () => {
  process.env.OFFLINE_MODE = "true";
  delete process.env.ANTHROPIC_API_KEY;
  ({ GET: profileGET } = await import("../profile/route"));
  ({ GET: graphGET } = await import("../graph/route"));
  ({ POST: narrativePOST } = await import("../narrative/route"));
});

const get = (fn: typeof profileGET, path: string) => fn(new Request(`http://localhost${path}`));

describe("GET /api/profile", () => {
  it.each(["open", "shield"] as const)("%s: valid ProfileFacts identical to the fixture", async (mode) => {
    const res = await get(profileGET, `/api/profile?wallet=${seed}&mode=${mode}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-glasshouse-links")).toBe("engine");
    const body = await res.json();
    expect(validateProfileFacts(body)).toEqual([]);
    expect(body).toEqual(fixture(`profile.${mode}.json`));
  });

  it("accepts upper-case hex", async () => {
    const res = await get(profileGET, `/api/profile?wallet=0x${seed.slice(2).toUpperCase()}&mode=open`);
    expect(res.status).toBe(200);
  });

  it("400 on a bad wallet or mode, 404 on an unknown wallet, always { error }", async () => {
    for (const [path, status] of [
      [`/api/profile?wallet=nope&mode=open`, 400],
      [`/api/profile?wallet=${seed}&mode=sideways`, 400],
      [`/api/profile?wallet=${seed}`, 400],
      [`/api/profile?wallet=0x${"1".repeat(40)}&mode=open`, 404],
    ] as const) {
      const res = await get(profileGET, path);
      expect(res.status).toBe(status);
      expect(typeof (await res.json()).error).toBe("string");
    }
  });
});

describe("GET /api/graph", () => {
  it.each(["open", "shield"] as const)("%s: valid GraphView identical to the fixture", async (mode) => {
    const res = await get(graphGET, `/api/graph?wallet=${seed}&mode=${mode}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(validateGraphView(body)).toEqual([]);
    expect(body).toEqual(fixture(`graph.${mode}.json`));
  });
});

describe("POST /api/narrative", () => {
  const post = (body: string) => narrativePOST(new Request("http://localhost/api/narrative", { method: "POST", body }));

  it("open: 4 sentences from the facts, 'likely' for inferences (template without a key)", async () => {
    const res = await post(JSON.stringify(openFacts));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-glasshouse-narrative")).toBe("template");
    const { text } = await res.json();
    expect(text.match(/[.!?](\s|$)/g)).toHaveLength(4);
    expect(text).toContain("238 of your agents' 238");
    expect(text).toContain("likely puts you in UTC+05:30");
    expect(text).toContain("Exchange A");
    expect(text).not.toMatch(/0x[0-9a-f]{6}/);
  });

  it("shield: says nothing can be traced and names the crowd", async () => {
    const { text } = await (await post(JSON.stringify(fixture("profile.shield.json")))).json();
    expect(text.match(/[.!?](\s|$)/g)).toHaveLength(4);
    expect(text).toContain("None of your agents' 238");
    expect(text).toContain(`any of ${(fixture("profile.shield.json") as ProfileFacts).anonymity_set} people`);
  });

  it("400 unless the body is ProfileFacts", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post(JSON.stringify({ hello: 1 }))).status).toBe(400);
  });
});
