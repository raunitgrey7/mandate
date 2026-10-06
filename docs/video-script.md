# Demo video script (target 2:40)

| t | Screen | Voice |
| --- | --- | --- |
| 0:00 | Title card: "Mandate. A governed PayPal wallet for AI agents." | Agents can already shop. Nobody will hand them the card. Mandate is the missing layer: a PayPal wallet that an AI agent can hold without holding your credentials. |
| 0:12 | Mandate page, prose on the left | You write the rules in English. Four hundred dollars a month. Groceries up to a hundred and twenty per order. Anything over seventy-five, ask me. Never alcohol. The ops agent can pay the dog walker. |
| 0:28 | Click Compile; policy preview fills, rationale lines | An LLM compiles that into a policy and shows, sentence by sentence, how it read your words. Numbers and block lists become code-enforced rules. |
| 0:42 | Wallet page: linked card / PayPal vault | You link PayPal once through Vault. Agents never see it. Each agent gets an API key to Mandate, over MCP or REST. |
| 0:55 | Playground, four scenario cards, press Run | Here are four real agents sharing one wallet. Watch what happens. |
| 1:02 | Transcript: Pantry pays, capture id appears | Pantry restocks groceries. Inside the mandate, so PayPal captures it in seconds against the vaulted wallet. There is the capture id. |
| 1:14 | Transcript: Travel needs_human | Travel books a one-forty-two dollar train. Over the threshold, so it waits for me. |
| 1:22 | Transcript: Growth denied, reclassified as alcohol | Growth tries to expense a bottle of whisky as a client gift. The reviewer reads the cart, calls it alcohol, and the mandate blocks it. Nothing leaves the wallet. |
| 1:36 | Transcript: Ops payout paid, payout batch id | Ops pays the dog walker through PayPal Payouts. Allowed recipient, within the cap, paid. |
| 1:46 | Approvals page on a phone-width window; tap Approve; status flips to Paid | The exception lands on my phone. One tap, and the same PayPal path pays the train. |
| 2:00 | Ledger: AG Grid, filter, chain badge "intact" | Every decision is receipted: intent, policy result, risk score, PayPal order, capture, payout, refund, webhook, all in a hash-chained ledger that verifies on the page. Built on AG Grid, exportable. |
| 2:14 | Copilot: "Refund the most recent grocery purchase" → refund id | And an owner copilot on the official PayPal Agent Toolkit handles refunds, invoices, disputes and tracking in chat. |
| 2:26 | Architecture slide | PayPal Vault, Orders, Payouts, refunds and webhooks on the money side. Gemini through the Vercel AI SDK on the judgment side. The model can escalate; it can never relax a rule. |
| 2:36 | End card: URL + repo | Mandate. Give your agents a budget, not your password. |
