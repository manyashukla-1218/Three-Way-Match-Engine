# Three-Way Match Engine

A full-stack procurement reconciliation app. Users upload Purchase Order (PO),
Goods Receipt Note (GRN), and Invoice documents (PDF/image); the backend
extracts structured data via the Gemini API, resolves line items against a
SKU Master catalogue, stores everything in MongoDB, and performs a three-way
match that recomputes fresh on every read. The frontend surfaces the PO and
its linked GRNs/Invoices across tabs, with file preview, an item grid, and
mismatched cells highlighted.

```
Three-Way Match Engine/
├── backend/     Node.js + Express + MongoDB + Gemini
├── frontend/    Next.js (App Router) + Tailwind
└── README.md    (this file)
```

---

## Setup

### Backend

```bash
cd backend
cp .env.example .env       # fill in GEMINI_API_KEY and MONGODB_URI
npm install
npm run seed                # inserts sample SkuMaster records matching the sample PO
npm start                   # listens on PORT (default 4000)
```

### Frontend

```bash
cd frontend
cp .env.example .env.local  # set NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                  # listens on http://localhost:3000
```

Run both at the same time (two terminals) for the app to work end to end.

---

## Auth

`POST /auth/login` accepts any JSON body and returns a static token:

```json
{ "token": "dev-static-token" }
```

Send it back on every other route as `Authorization: Bearer <token>`. The
token value is whatever `AUTH_TOKEN` is set to in `backend/.env` — routes
return `401` if the header is missing or the token doesn't match.

---

## API summary

| Method | Route | Notes |
|---|---|---|
| POST | `/auth/login` | returns `{ token }` |
| POST | `/documents/upload` | multipart: `file`, `documentType` (`po`/`grn`/`invoice`) |
| GET | `/documents/:id` | fetch one document (searches PO/GRN/Invoice collections) |
| GET | `/documents/:id/file` | streams the original uploaded file |
| GET | `/documents?type=&poNumber=` | filtered list |
| GET | `/match/:poNumber` | fresh three-way match computation, never cached |
| GET | `/summary/:poNumber` | ledger-style reshaping of the same computation |
| POST/GET/PATCH/DELETE | `/masters/sku[/:id]` | SKU Master CRUD |

---

## Parsing pipeline (`POST /documents/upload`)

1. File saved to `backend/uploads` with a unique name.
2. Sent to Gemini (`gemini-3.6-flash`) with a document-type-specific prompt
   requesting strict JSON. Code fences are stripped defensively before parsing.
3. Parsed JSON is validated against the minimum required fields. On failure
   (bad JSON or missing fields), one retry is made with a stricter prompt. If
   that also fails, the request returns `422` and **nothing is persisted**.
4. Master resolution runs on every item (`services/masterResolution.js`):
   match `itemCode` against `SkuMaster.skuErpCode`, then `SkuMaster.eanCode`,
   case-insensitive and trimmed, with a fallback to just the leading token of
   `itemCode` (handles cases where Gemini captures trailing text — e.g. a
   brand name printed next to the code in the PDF table — as part of the
   code itself). Unresolved items are never dropped — they're saved with
   `skuMaster: null` and an `unmapped_master_sku` warning.
5. Duplication check (`services/dedupeCheck.js`) flags but never blocks
   saving — a duplicate PO/GRN/Invoice is still persisted as a new document.
6. The document is saved regardless of whether a matching PO already exists,
   so out-of-order uploads (GRN or Invoice before its PO) always succeed.
7. A `MatchAudit` entry is appended for the `poNumber`.
8. The response returns the saved document plus any warnings.

---

## Matching engine (`services/matchingEngine.js`)

Pure read-time computation — `GET /match/:poNumber` and `GET /summary/:poNumber`
both call `computeMatch(poNumber)` fresh, with no caching layer anywhere.

- If the PO doesn't exist, or there are zero GRNs, or zero Invoices linked to
  that `poNumber`, the result is `insufficient_documents` (a missing document
  type is never treated as zero quantity).
- Otherwise every item is aggregated by resolved `SkuMaster._id` (falling back
  to normalised `itemCode` when unresolved) across **all** GRNs and **all**
  Invoices for the PO, and evaluated against the spec's reason codes:
  `grn_qty_exceeds_po_qty`, `invoice_qty_exceeds_grn_qty`,
  `invoice_qty_exceeds_po_qty`, `invoice_date_after_po_date`, `duplicate_po`,
  `duplicate_document`, `item_missing_in_po`, `price_mismatch` /
  `mrp_mismatch` (skipped entirely when the master rate is missing, zero, or
  negative — no divide-by-zero), `unmapped_master_sku`.
- Status precedence: `mismatch` > `partially_matched` > `matched`.

**Item matching key:** resolved `SkuMaster._id` is used as the primary key
across PO/GRN/Invoice, since raw `itemCode` strings differ across documents
for the same physical product (e.g. a numeric ERP code on the PO/GRN vs. a
different code format on the Invoice). When an item can't be resolved, its
normalised `itemCode` is used as a fallback key instead of being dropped, and
it's flagged `unmapped_master_sku` so it stays visible.

**Out-of-order handling:** GRN/Invoice documents store `poNumber` as a plain
string field, not a foreign-key reference — so an Invoice can be uploaded
before its PO exists, is still persisted, and gets picked up automatically
once the PO or missing SKU Master record is later added, since the match is
always recomputed from whatever is currently in the database.

**Duplicate handling:** a second PO/GRN/Invoice with a number that already
exists is still saved as a separate document (never overwritten or
rejected) and flagged (`duplicate_po` / `duplicate_document`) both at upload
time and independently re-derived at read time.

---

## Frontend architecture

- **Next.js (App Router)** + **Tailwind CSS**, per the required stack.
- **TanStack Query** for all server state (documents, match, summary, SKU
  masters) — chosen over Redux Toolkit because the backend is the single
  source of truth here (every match/summary read is recomputed fresh, never
  client-cached long-term), so a caching/invalidation-first library fits
  better than a manually-managed global store. Local UI-only state (active
  tab, modal open/closed) uses plain React state.
- Auth token is kept in React context (not localStorage) and attached via a
  shared fetch wrapper as `Authorization: Bearer <token>` on every request.
- App shell: left icon rail, top tabs (Purchase Order / Fulfillment /
  Delivery / Summary) with live count badges, sub-tab pills for multiple
  GRNs/Invoices under Fulfillment/Delivery.

---

## A couple of intentional deviations from the literal schema wording

The brief describes `PurchaseOrder.poNumber` as "unique, required" and asks for
compound-unique indexes on `{poNumber, grnNumber}` / `{poNumber, invoiceNumber}`
for GRN/Invoice — but the duplication-check section explicitly requires that a
second PO/GRN/Invoice with the same number **must still be saved** (flagged,
never rejected). A hard unique index would throw on that exact case, so:

- `PurchaseOrder.poNumber` has a plain (non-unique) index.
- `Grn`/`Invoice` have non-unique compound indexes on `{poNumber, grnNumber}` /
  `{poNumber, invoiceNumber}`.
- Duplicate detection is done in application code (`dedupeCheck.js`) before
  persistence, and the matching engine independently re-derives
  `duplicate_po` / `duplicate_document` at read time by counting documents,
  so the flag is always fresh even if two uploads race each other.

This preserves the literal intent ("duplicates are still saved and flagged")
over the literal keyword ("unique"), since the two conflict as written.

---

## File structure

```
backend/
  config/db.js                  Mongo connection
  models/                       Mongoose schemas
  middleware/auth.js             Bearer token check
  middleware/upload.js           Multer disk storage config
  services/parseDocument.js      Gemini call + JSON validation + retry-once
  services/masterResolution.js   SKU matching (skuErpCode -> eanCode -> leading-token fallback)
  services/dedupeCheck.js        Duplicate PO/GRN/Invoice detection
  services/matchingEngine.js     Pure fresh-every-read three-way match
  controllers/                   Route handlers, call services in sequence
  routes/                        Express routers
  seed.js                        Inserts sample SkuMaster records
  server.js                      App entry point + centralised error handler

frontend/
  app/                           Next.js App Router pages
  components/                    UI components (shell, tabs, item grid, forms)
  lib/                           Fetch wrapper, TanStack Query hooks
```

No plugin/engine abstraction on the backend — controllers call the services
directly in a plain, sequential, readable order, as called for in the brief.

---

## Error handling

- `400` bad input (missing fields, bad file type, invalid ObjectId)
- `401` missing/invalid bearer token
- `404` not found
- `422` Gemini extraction/validation failure (after the one retry)
- `500` unexpected errors — stack traces and the Gemini API key are never
  included in any response body, only logged server-side.

---

## Assumptions & tradeoffs

- Local disk storage for uploaded files is used (no cloud blob storage), per
  the assignment's stated assumptions.
- Auth is a static bearer token, per the assignment's stated assumptions —
  no real identity provider.
- Seed data covers a subset of the sample PO's items (enough to demonstrate
  both resolved and `unmapped_master_sku` items in the same document, which
  is closer to a realistic partial-master-data scenario than seeding every
  single line item).

## Known limitations / what I'd improve with more time

- UOM conversion is out of scope (per the brief) — quantities are compared
  assuming already-comparable units.
- No automated test suite yet; testing was done manually via Postman against
  the sample PO/GRN/Invoice documents.
- Real (non-visual) upload progress reflecting actual backend pipeline state
  (uploading → parsing → mapping → matched) is a bonus item not yet implemented.

## AI tools used

Claude (Anthropic) was used throughout — for scaffolding the Express/Mongoose
backend, debugging the master-resolution fallback logic, and for the
Next.js/Tailwind frontend. All logic, including the matching engine and the
duplicate/out-of-order handling described above, was reviewed and can be
explained, debugged, and modified directly.
