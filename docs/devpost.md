# Devpost submission copy

**Project name:** Mandate

**Tagline:** A governed PayPal wallet for AI agents. Write the rules in English; agents spend inside them.

## Inspiration

Agents can already shop. Nobody will hand them the card. Every agentic-commerce demo ends at the same wall: a human still has to type the payment in, because there is no safe way to let software spend from your wallet. We wanted the missing layer between "my agent found the right thing" and "it is paid", one that a parent, a freelancer or a small business owner would actually trust.

## What it does

Mandate turns a PayPal wallet into something an AI agent can hold without holding your credentials.

* **You write a mandate in plain English.** "Up to $400 a month. Groceries up to $120 per order. Anything over $75, ask me. Never alcohol. The ops agent can pay the dog walker up to $40 a visit." An LLM compiles it into a policy and shows you, sentence by sentence, how it read your words.
* **You link PayPal once.** Vault v3 stores a PayPal wallet (MERCHANT usage, buyer-absent) or a card. Agents never see it; they get an API key to Mandate.
* **Any agent asks Mandate to pay.** Mandate is an MCP server (and a REST API), so Claude Desktop, Claude Code, Cursor, an OpenAI agent or a Vercel AI SDK agent can call `request_purchase` or `request_payout`.
* **Every request is reviewed twice.** An LLM reads the cart against the mandate (is "groceries" actually whisky? does the reason fit?) and can only escalate or re-categorise. Then a deterministic engine enforces the numbers: block lists, per-agent scope, hard caps, approval thresholds, rolling budgets, hours, new-merchant rules. The model never relaxes a rule.
* **Money moves or it does not.** Within policy: PayPal Orders v2 against the vault id, captured in seconds. Exception: a one-tap approval on your phone, then the same path. Violation: denied, with the reason, and nothing leaves the wallet. People get paid through PayPal Payouts. Refunds are one click.
* **Everything is receipted.** A SHA-256 hash-chained ledger links intent → decision → PayPal order / capture / payout / refund ids, with verified webhook events pinned in. AG Grid makes it filterable and exportable; the chain verifies live on the page.
* **An owner copilot** sits on the official PayPal Agent Toolkit: refunds, invoices, disputes, shipment tracking, subscriptions and transaction search in chat, next to Mandate's own approve / deny / refund actions.

## How we built it

Next.js 16 and TypeScript. PayPal REST APIs called directly for the money paths: Vault v3 setup tokens and payment tokens (PayPal wallet and card), Orders v2 with `payment_source.*.vault_id`, Payments v2 refunds, Payouts v1, and webhook signature verification. The PayPal Agent Toolkit (`@paypal/agent-toolkit/ai-sdk`) powers the owner copilot. Vercel AI SDK v7 handles structured output (the mandate compiler and the intent reviewer), tool calling (the playground agents) and streaming; the demo model is Gemini 2.5 Flash, and any provider works. The MCP server uses `mcp-handler` on the MCP SDK v2. Drizzle ORM runs on Neon Postgres when hosted and on embedded PGlite locally, so judges can run the repo with no database setup. AG Grid renders the ledger. Deployed on Vercel.

## Challenges we ran into

* Agent-initiated payments need the buyer absent, which rules out the normal approve-then-capture order flow. Vault v3 with `usage_type: MERCHANT` was the answer, and we added a server-side card vault so the demo never depends on a sandbox login.
* Letting a model near money without letting it override policy. The architecture is the answer: the LLM produces category, risk and an escalation flag; code owns every number and list.
* Making the audit trail trustworthy: Postgres reorders JSONB keys, which broke our hash chain until we canonicalised the hashed payload.
* Running the official Agent Toolkit (built for AI SDK v4) inside an AI SDK v7 app took a small adapter.

## Accomplishments that we're proud of

Four real LLM agents sharing one wallet live, with four different outcomes in under a minute, every one of them backed by a PayPal sandbox transaction id. A prose-to-policy compiler that explains itself. A decision model where the human stays in control without being in the loop for every purchase.

## What we learned

PayPal's Vault and Orders APIs already contain everything agentic commerce needs on the money side; what is missing is the governance layer, and that layer is mostly about who is allowed to decide what. Judges, parents and finance teams all ask the same first question: "what stops it?"

## What's next for Mandate

Multi-owner wallets (families, teams) with per-member mandates; merchant allow-lists learned from history; PayPal disputes opened from the ledger when a paid request never ships; mandate templates for common agent roles; and production vault approval for live PayPal wallets.

## Built with

paypal, paypal-agent-toolkit, paypal-vault, paypal-orders-api, paypal-payouts, paypal-webhooks, next.js, typescript, vercel-ai-sdk, gemini, model-context-protocol, mcp, neon, postgres, pglite, drizzle, ag-grid, vercel, tailwind, zod

## Links

* Live demo: https://mandate-taupe.vercel.app
* Repo: https://github.com/raunitgrey7/mandate
* Video: (YouTube)
