# FlowOps — RASA Rail Demo Talk Track

> For Kader, RASA (Railways Association of Southern Africa), October 2026.
> Goal: show FlowOps is rail-credible, capture qualified contacts, and book
> follow-up meetings. Honesty is the strategy — RASA people know rail, so the
> win is being the one vendor who is straight about what the platform does and
> doesn't do.

---

## 1. The 10-second answer ("What does FlowOps do for rail?")

> "FlowOps is the coordination and intelligence layer that sits *above* the rail
> network. We don't run signalling or allocate slots — the operator does that.
> We manage the consignment end-to-end: the wagon register, the road↔rail↔port
> handoffs, and the corridor KPIs — so the cargo owner and forwarder finally see
> the whole journey in one place."

Say this word-for-word. It positions you precisely and pre-empts the "are you
trying to replace TFR's systems?" question.

---

## 2. The one-line problem (why they should care)

> "Today, the moment cargo leaves the mine, visibility fragments — road has one
> system, rail another, the port a third. The gaps between them are where dwell
> time, demurrage and disputes live. Nobody owns the handoff. That's the gap we close."

This is the pain a RASA audience feels every day. Lead with the *problem*, not
the software.

---

## 3. The demo — screen by screen (5–7 minutes)

Open app.flowop.work → **OPS → Rail & Intermodal**. Have it already logged in.

**A. The command centre (KPIs)** — start here.
- "This is a live corridor view for one operator. Active consignments, tonnage
  moved, on-time %, and — the one nobody can see today — average interchange
  dwell time."
- Point at **Avg Dwell**: "This is the number that costs money. We surface it
  because it's computed from the actual handoff timestamps, not a guess."

**B. The corridor map.**
- "These are the real SADC corridors — Copperbelt, Coal Line, Manganese, Maputo,
  Natcor. When I open a consignment its route lights up."
- **Say the honest line out loud, don't wait to be asked:** "This is corridor
  *geography* — not a live train GPS feed. We don't fake that. When an operator
  gives us a position feed, we plot it; until then, we show where the corridor
  runs, not a pretend moving dot."

**C. Open a consignment (click a row).**
- Walk the lifecycle chips: Planned → Wagons Allocated → Loading → Departed →
  In Transit → At Interchange → Arrived → Offloaded → Completed.
- "Every stage is timestamped and creates an event on the timeline — a full,
  auditable history of the consignment."

**D. The intermodal journey (the money slide).**
- Point at the ROAD → RAIL → PORT legs with dwell hours.
- "This is the whole point. Road leg, rail leg, port leg — one record, one owner
  of the handoff. The dwell hours between legs are the recovery opportunity."

**E. The wagon register.**
- "Rake-level detail — wagon number, type, tonnage, last-known siding. The
  operator's rolling stock, tied to the consignment."

---

## 4. Handling the hard questions (rehearse these)

**"Is this live train tracking?"**
> "No — and I won't pretend it is. We're not plugged into signalling. What we do
> is coordinate the consignment and show corridor position from operator or
> milestone data. The day an operator exposes a feed, we ingest it. Honesty here
> matters — a fake live map would fall apart in front of you."

**"How do you get the data — from TFR / the port?"**
> "Three ways, in order of maturity: manual milestone updates today; CSV / bulk
> import; and a live API the moment a counterparty exposes one. We're built to
> plug in — we don't require it to deliver value on day one."

**"Are you trying to replace our operating systems?"**
> "No. We sit above them. Your systems run the railway; we coordinate the cargo
> journey across road, rail and port and give the cargo owner visibility. We
> complement, we don't compete."

**"Who's using it?"**
> Be honest: "We're a South African platform live with courier and forwarding
> operators, and we've built the rail module for exactly this market. I'm here
> to find the first rail partner to shape it with real operations." (Don't
> invent customers. 'Founding partner' framing is stronger than a fake logo.)

**"What does it cost?"**
> "Rail is an add-on that works on any base plan — you don't buy a big suite to
> get it. I'd rather scope it to your operation and send you a real number." Then
> use the **Quote Machine** later to send an actual quote.

---

## 5. The close (what you want to walk away with)

Pick ONE ask per conversation:
- **Warm:** "Can I send you a 2-week pilot proposal for one corridor?"
- **Cooler:** "Can I get 15 minutes next week to show your ops team?"
- **Minimum:** "Who on your side owns cargo visibility — can you point me to them?"

Always capture: **name, company, role, one corridor/commodity they care about.**
Log it the same evening. Target from the OKR cockpit: 15 contacts, 3 follow-ups.

---

## 6. Golden rules
1. Lead with the **problem** (fragmented visibility, dwell), not the software.
2. Say the **"not live GPS"** line *before* you're asked — it builds trust.
3. Never invent a customer. "Founding rail partner" beats a fake logo.
4. One clear ask per person. Capture the contact. Follow up that night.
5. If you don't know something: "I don't know — I'll find out and come back to
   you." RASA pros respect that more than bluffing.
