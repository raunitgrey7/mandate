import { body, handle, json, requireOwner } from "@/lib/http";
import { compileMandate } from "@/lib/policy/compile";
import { PolicySchema } from "@/lib/policy/schema";
import { getActiveMandate, getWallet, listMandates, saveMandate } from "@/lib/store";
import { appendLedger } from "@/lib/ledger";

export const maxDuration = 60;

export async function GET() {
  return handle(async () => {
    await getWallet();
    return json({ active: await getActiveMandate(), history: await listMandates() });
  });
}

/** Compile prose to a policy without saving (preview). */
export async function POST(req: Request) {
  return handle(async () => {
    requireOwner(req);
    const { text } = await body<{ text: string }>(req);
    if (!text?.trim()) return json({ error: "Mandate text is empty" }, { status: 400 });
    const t0 = Date.now();
    const result = await compileMandate(text.trim());
    return json({ ...result, ms: Date.now() - t0 });
  });
}

/** Save a compiled mandate as the new active version. */
export async function PUT(req: Request) {
  return handle(async () => {
    requireOwner(req);
    const { text, policy, compiledBy } = await body<{ text: string; policy: unknown; compiledBy?: string }>(req);
    const parsed = PolicySchema.safeParse(policy);
    if (!parsed.success || !text?.trim()) return json({ error: "Invalid policy", issues: parsed.success ? [] : parsed.error.issues }, { status: 400 });
    await getWallet();
    const mandate = await saveMandate(text.trim(), parsed.data, compiledBy ?? "llm");
    await appendLedger({ type: "mandate.activated", payload: { mandateId: mandate.id, version: mandate.version, compiledBy: mandate.compiledBy, text: mandate.sourceText } });
    return json({ mandate });
  });
}
