# Resource Guide launch plan

Start by inviting local businesses to support the printed and digital Resource Guide. A specific offer gives the Regional Director a reason to reach out and gives businesses a clear next step. Sponsors can explore other causes and opportunities, request a conversation, or sign a standard commitment without creating an account.

| Timing | Regional Director action | Ready when |
| --- | --- | --- |
| Week 0 · prepare | Confirm the edition, approval deadlines, placements and prices. Test a personal proposal link, the sponsor PDF, an inquiry and a standard commitment. | The director can send the offer and recognize an inquiry or signed commitment in the staff view. |
| Week 1 · invite | Choose 8 to 12 businesses with an existing relationship or permission to reach out via a warm introduction. Pick one suggested level for each. Approach presenting candidates in sequence. Send each contact a personal proposal link and the current sponsor PDF. | The director has recorded the introduction, proposed level and follow-up date for each invitation. |
| Week 2 · follow up | Reply once in the original thread after seven days. Pause outreach when someone declines or asks to stop. Review actual inquiries and signed commitments in the staff view, then check placement availability before confirming recognition. | Each response has a next action. Each limited placement is available, reserved with a deadline, or paid and confirmed. |
| Day 30 · review | Read the last 30 days in `/admin/conversions` and compare the funnel with your outreach notes. Ask responsive businesses what helped them decide. | The director can decide whether to revise the invitation, change the featured offer or invite another small group. |
| Artwork cutoff · close | Send the designer the list of paid public credits. Keep private sponsorships in the approved record. Check the business name, logo, link and placement against the agreement. | The director has approved the print and digital proofs. |
| Publication · fulfill | Check the printed and digital credits, send the published link, and tick completed benefits with proof on each sponsor record. Assess what to offer in the next cycle. | Revenue, recognition and staff time can be reported from the ledger and benefit records. |

## Keep the offer simple

- Presenting Sponsor · $5,000 · one cover and web placement.
- Supporting Sponsor · $2,500 · four sponsor-page logo placements across print and digital.
- Friend of the Guide · $500 · business name on the guide sponsor page.
- Confirm whether Leadership and Custom annual partners’ included Supporting-level recognition uses the same inventory. Count those placements before offering the remaining space to project sponsors.
- Record placement reservations and expiry dates before sending a live invoice. Keep a waitlist when a level fills and confirm availability before promising a credit.
- Use one round of sponsor artwork review. Offer annual or directory options during follow-up only when the business asks for a longer commitment.

## Start the first outreach list

Use businesses the director already knows, referrals where the contact has agreed to an introduction, and previous community relationships where sponsorship is a relevant next conversation. Record the business, who introduced it, a brief reason the offer fits, the suggested level and next follow-up date. Open the prospect record and copy its personal proposal link. Send it in an individual email with the [current sponsor PDF](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/api/guide.pdf). Keep notes and personal contact details out of the link.

Keep outreach follow-ups in Monday.com if that is where the director already works. Record gifts and receipts in Little Green Light or the approved accounting workflow as appropriate. Use the microsite for proposals, submitted inquiries and commitments, and conversion counts. This pilot starts from the first small batch of prospects and requires no database migration or integration.

Share the standalone sponsor link directly in outreach. When NAMI has website access, its WordPress site can link to the same address. Verify the Adams directory destination with the directory owner before publishing a directory link. For an approved Little Green Light payment form, enter its HTTPS address in the staff program editor and reconcile each payment in the accounting workflow.

## Check the first 30 days

Open `/admin/conversions` after signing in to staff access. Review visits, builder starts, submitted inquiries and signed commitments for the last 30 days. Use each count to answer a different question. Visits show whether people reach the microsite. Builder starts show whether people begin exploring a proposal. Inquiries are submitted requests for a conversation. Signed commitments are accepted standard agreements and are tracked separately from payment received.

Review the numbers once a week alongside replies and paid invoices. If visits lead to few builder starts, check that the personal link opens the suggested offer and that the email gives a specific reason to click. If starts lead to few submissions, ask a responsive contact what they needed to make a decision. The view tracks conversions. For sponsor impact updates, use the director’s existing newsletter or a brief email with published program facts and fulfilled recognition.

## Prepare to accept commitments

Verify contact details, sponsor terms and approved payment instructions. Test staff access and the sponsor flow with a fictional commitment and a sample asset. Flag the test in the review notes so it does not count toward pilot results. Use the organization’s approved email and accounting workflow for sponsor correspondence, private payment arrangements and receipts.

After publication, review cash received, open placements, credits delivered on time and director hours alongside the first 30 days of acquisition results.

## Keep the public materials in sync

Publish approved pricing, capacity, descriptions and benefit copy in the staff program editor. The public download at `/api/guide.pdf` uses the published catalog. After each edit, open the live download, spot-check the changed offer and use that link when sharing the current guide. Keep selection IDs stable for existing commitments and update the dollar amounts and capacity in this launch document when the approved offer changes.

The [static edition](../web/public/downloads/sponsor-guide.pdf) archives the launch catalog and serves as the bundled default. Maintain that edition through [the repository catalog](../web/public/content.json) when preparing a new release. From the repository root, install ReportLab and regenerate the archive.

```powershell
python -m pip install reportlab
python scripts/build-guide.py
```

The archive script writes `web/public/downloads/sponsor-guide.pdf`. Use `--site-url` with the approved public domain. Check the archive’s builder link and QR code before distribution. Replace the cover image when approved guide photography is available.
