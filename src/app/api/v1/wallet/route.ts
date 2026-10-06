import { handle, json } from "@/lib/http";
import { getWallet } from "@/lib/store";
import { env } from "@/lib/env";
import { modelInfo } from "@/lib/ai/model";
import { dbKind } from "@/lib/db";

export async function GET() {
  return handle(async () => {
    const w = await getWallet();
    return json({
      wallet: { ...w, paymentTokenId: w.paymentTokenId ? `${w.paymentTokenId.slice(0, 4)}…${w.paymentTokenId.slice(-4)}` : null },
      testCard: { number: "4111 1111 1111 1111", expiry: "2030-12", name: "Household Owner" },
      config: { paypal: env.paypal.configured, paypalEnv: env.paypal.env, ai: modelInfo(), db: dbKind(), webhook: Boolean(env.paypal.webhookId) },
    });
  });
}
