# Director’s desk

Open the [practice desk](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/admin?demo=1) to try the workflow with fictional sponsors. Practice changes stay in your browser. To use the shared desk, open [staff sign-in](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/admin) in a fresh tab and enter your staff key. The hosted preview issues sample invoices.

## From first contact to renewal

| What you need to do | Where to do it |
| --- | --- |
| Find a business or add a lead | Open **Sponsors** to see prospects and active partners. Use **Add prospect** for a business you want to approach. When a business selects **Ask about this partnership first**, its inquiry appears as a **Prospect** without an invoice. |
| Review a signed commitment | Open the sponsor’s record and select **Open invoice**. Check the selections, amount and due date. Share the private invoice link with the sponsor’s billing contact. |
| Record a payment | Match the payment to the invoice in NAMI’s bank statement or accounting system, then select **Record payment** in the sponsor’s record. |
| Deliver a promised benefit | Under **Promised benefits**, check the sponsor’s recognition preference and how they want their name to appear. Once you deliver the benefit, add the publication link or issue date to the notes and select **Mark delivered**. |
| Review reminders and renewals | Start with **This week** for follow-ups, overdue invoices and upcoming tasks. Use **Calendar** for benefit deadlines and annual renewal dates. Send a renewal invitation and obtain a new agreement for the next term. |
| Send a prepared email | In **Emails** or the sponsor’s record, choose an invitation, invoice, reminder, welcome, impact update or renewal template. Review the recipient and wording, select **Open in my mail app**, and send the message from NAMI’s mailbox. The desk records when the draft was prepared. |

## Pilot the Resource Guide

1. Confirm available placements, prices, the artwork deadline and who approves the final proof.
2. Invite 8–12 businesses you know. Send each one a personal proposal link, a suggested level and the [current sponsor guide](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/api/guide.pdf). Follow up once after seven days.
3. Before printing, check each public credit against the payment record, recognition preference and approved name. After publication, record the benefits delivered. At day 30, open **Microsite results** to see how many visits led to inquiries and signed commitments.

The [staff playbook](staff-playbook.md) includes sample emails. The [Resource Guide launch plan](resource-guide-launch.md) gives the director a week-by-week schedule.

## Before accepting real sponsors

- **Regional Director** — Approve the prices, terms, deadlines, recognition wording and payment instructions. Assign someone to reconcile payments and send sponsor emails.
- **Deployment owner** — Configure a clean private production store, the public site address, a production staff key and approved payment instructions. Rehearse the full workflow in a separate test workspace. Switch production to `SPONSOR_DEMO=0` after sign-off. [Production settings and handoff](../README.md#before-the-first-real-sponsor)
- **During the pilot** — Staff can reconcile payments manually, send prepared emails from NAMI’s mailbox and review reminders in the desk. Scheduled email reminders, automatic email delivery and payment-provider confirmations each need a separate integration.
