// Next.js loads .env from apps/web; the repo keeps one .env at its root. Load it for local
// runs (existing variables win). On Vercel the variables come from project settings.
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const offlineMode = () => process.env.OFFLINE_MODE === "true";
