import { paypal, toMoney } from "./client";

export type PayoutBatch = {
  batch_header: { payout_batch_id: string; batch_status: string };
};

/**
 * Agent-initiated payout: Mandate pays a human (contractor, dog walker, tutor)
 * from the merchant balance when an agent marks a job complete and the policy
 * allows it.
 */
export async function sendPayout(args: {
  intentId: string;
  recipientEmail: string;
  amountCents: number;
  currency: string;
  note: string;
  agentName: string;
}) {
  return paypal<PayoutBatch>({
    method: "POST",
    path: "/v1/payments/payouts",
    requestId: `payout-${args.intentId}`,
    body: {
      sender_batch_header: {
        sender_batch_id: `mandate-${args.intentId}`,
        email_subject: `You have a payment from ${args.agentName} (via Mandate)`,
        email_message: args.note.slice(0, 1000),
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: { value: toMoney(args.amountCents), currency: args.currency },
          receiver: args.recipientEmail,
          note: args.note.slice(0, 4000),
          sender_item_id: args.intentId,
        },
      ],
    },
  });
}

export async function getPayoutBatch(id: string) {
  return paypal<PayoutBatch & { items?: { transaction_status: string }[] }>({
    method: "GET",
    path: `/v1/payments/payouts/${id}`,
  });
}
