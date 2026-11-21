# NAMI Central Oregon partnerships

## What is delivered

- **Live site:** https://red-mushroom-0bde5a81e.3.azurestaticapps.net
- **Code:** private repository `abeiner/nami-central-oregon`, branch `main`

| # | Deliverable | Status | Where |
| --- | --- | --- | --- |
| 1 | Sponsor site | Live | [Sponsor site](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/) |
| 2 | Sponsor presentation | Live, 5-page PDF | [Sponsor guide (PDF)](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/api/guide.pdf) · [bundled copy](web/public/downloads/sponsor-guide.pdf) |
| 3 | Sign-up and payment | Live, by invoice; sample invoices while the site is in preview | [Partnership builder](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/partner) |
| 4 | Internal management | Live | [Staff sign-in](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/admin) (staff key) · [Sample desk](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/admin?demo=1) (fictional sponsors) |
| 5 | Instructions and launch plan | In this repository | [Staff playbook](docs/staff-playbook.md) · [Resource Guide launch plan](docs/resource-guide-launch.md) · [Director’s desk guide](docs/director-desk.md) · [Assistant setup](docs/assistant.md) |

For a production launch, start with the [GitHub and Azure operations runbook](docs/production-operations.md). It covers ownership, releases, staff passcode rotation and recovery. See also the [Azure budget](#production-infrastructure-and-budget) and [go-live checklist](#before-the-first-real-sponsor).

**Director’s desk** · [Staff sign-in](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/admin) · [Try the desk with fictional sponsors](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/admin?demo=1)

Open **This week** for reminders and **Sponsors** for inquiries, invoices, payments and promised benefits. Staff verify funds in the accounting system, record the payment, and send prepared messages from NAMI’s mailbox. The hosted site currently issues sample invoices. [Staff instructions and email templates](docs/staff-playbook.md) · [Resource Guide launch plan](docs/resource-guide-launch.md) · [Director’s desk and production checklist](docs/director-desk.md)

[Try Pass the Guide](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/launch/) or [explore all partnerships](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/). Use fictional business and contact information in the public demonstration.

**Pass the Guide** lets a visitor choose a fictional sponsor, see its invoice, work through the director’s checklist, and review the resulting recognition. The demo uses the same catalog, invoicing, and fulfillment rules as sponsor intake. Its preview endpoint does not create a staff record.

The partnership builder records a signed commitment, the prices and terms at signing, recognition preferences and a printable invoice. The staff desk tracks prospects, verified offline payments, benefits, email drafts and renewals. The public demo issues sample invoices and accepts no money. Staff send reviewed messages through their organization’s mailbox.

The sponsor homepage lets businesses match a cause and budget to specific opportunities. A business can also ask about any package without creating an account, signing an agreement, or requesting an invoice. The director’s **Microsite results** page shows the last 30 days of measured visits, cause exploration, builder starts, inquiries, and commitments. The app uses a random visit identifier and stores a hash and fixed event categories. It excludes browser-only practice activity. The conversion rate counts visits with a saved submission once, including visits with more than one submission.

## Run locally

Requires Node.js 22 and npm. From the repository root run:

~~~powershell
npm ci --prefix api
npm ci --prefix web
npm run build --prefix web
npm start --prefix api
~~~

Open http://localhost:7071 or http://localhost:7071/launch/. The local staff key is generated in the ignored file .local/state/staff-key on first start. Local records survive server restarts. For frontend editing, start the API as above, then run npm run dev --prefix web in another terminal. The Vite proxy uses port 7071.

## Director’s materials

- [Sponsor guide](web/public/downloads/sponsor-guide.pdf)
- [Staff playbook and email templates](docs/staff-playbook.md)
- [Resource Guide launch plan](docs/resource-guide-launch.md)
- [Assistant setup and monthly check-in](docs/assistant.md)

## Production infrastructure and budget

**Budget $12/month ($144/year) for the public launch.** For a small sponsorship program in Azure West US 2, the example below comes to about **$9.11/month** before tax or credits. It uses one Azure Static Web App for the sponsor site, staff desk and managed HTTP API, plus one private Blob Storage account for sponsor records, logos and program content.

| Option | Estimated monthly Azure cost | When to use it |
| --- | ---: | --- |
| Free hosting + storage | $0.11 | Lowest-cost pilot. Free hosting has no uptime agreement. Azure can stop serving the site if the subscription exceeds its 100 GB monthly bandwidth allowance. |
| Standard hosting + storage | $9.11 | Recommended for real sponsor outreach. The $9/month hosting plan includes an uptime agreement and can serve traffic above the allowance for an additional charge. |

**What the estimate buys.** The November 2026 USD example assumes 1 GB of Hot, locally redundant block blobs, including retained copies ($0.0184/month), 10,000 writes ($0.05) and 100,000 reads ($0.04). Both options assume site traffic and managed API usage stay within the subscription’s included allowances. Higher usage, longer retention or a different region can change the bill. [West US 2 hosting rate](https://prices.azure.com/api/retail/prices?$filter=armRegionName%20eq%20%27westus2%27%20and%20productName%20eq%20%27Static%20Web%20Apps%27%20and%20meterName%20eq%20%27Standard%20App%27) · [West US 2 storage rates](https://prices.azure.com/api/retail/prices?$filter=armRegionName%20eq%20%27westus2%27%20and%20productName%20eq%20%27General%20Block%20Blob%20v2%27%20and%20skuName%20eq%20%27Hot%20LRS%27) · [Hosting limits](https://azure.microsoft.com/en-us/pricing/details/app-service/static/) · [Functions allowances](https://azure.microsoft.com/en-us/pricing/details/functions/)

**What to set up**

1. In an organization-owned Azure subscription, create a production resource group with one Static Web App and one Standard general-purpose v2 storage account. Use the Hot tier with locally redundant storage (LRS). Create the private `sponsorship` container and disable anonymous blob access. Deploy this repository’s frontend and managed API to the production app, then connect it to the new store using the [go-live checklist](#before-the-first-real-sponsor).
2. Use a subdomain of NAMI’s existing domain and its existing DNS provider. Azure supplies and renews the HTTPS certificate. The pilot uses NAMI’s mailbox and accounting process. The estimate excludes staff time, new domain registration and any payment processor fees. [Domain and certificate details](https://learn.microsoft.com/en-us/azure/static-web-apps/faq)
3. Enable blob and container soft delete, start with seven days of retention, and test restoring a record before outreach. Set a monthly cost alert at $12 for the production resource group and review the first bill. An alert emails the owner and spending can continue above the threshold. [Storage recovery options](https://learn.microsoft.com/en-us/azure/storage/blobs/data-protection-overview) · [Azure cost alerts](https://learn.microsoft.com/en-us/azure/storage/common/storage-plan-manage-costs)

**Possible nonprofit savings.** Microsoft offers eligible nonprofits a renewable $2,000 annual Azure credit. If NAMI is approved and deploys under the grant subscription, the credit could cover the full hosting estimate. Budget at retail until the organization confirms its available credit. [Microsoft nonprofit grant FAQ](https://www.microsoft.com/en-us/nonprofits/faq)

## Staff handoff

One private Azure Blob container named sponsorship holds signed records, the program catalog override, and deduplicated logo files. The small program ledger is updated with conditional writes. This keeps limited placements, payments, audit entries, and benefits consistent during simultaneous staff or sponsor updates. A repeated submission with the same idempotency key returns the existing invoice.

To practice with fictional records, open the [sample desk](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/admin?demo=1). For shared sponsor records, open [staff sign-in](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/admin) in a fresh tab and enter your staff key.

Keep the staff key in the organization’s password manager. Follow the [staff passcode rotation procedure](docs/production-operations.md#3-rotate-the-staff-passcode) when access changes. PUBLIC_ORIGIN sets the scheme and host on private invoice links. SPONSOR_BLOB is the dedicated storage connection string. SPONSOR_DEMO=1 enables fictional fixtures and sample invoices. Keep these secrets outside the web build.

The bundled catalog lives in web/public/content.json. Saving the staff content editor publishes an override for the site, API and [live sponsor PDF](https://red-mushroom-0bde5a81e.3.azurestaticapps.net/api/guide.pdf). Existing agreements keep the terms, prices and fulfillment dates accepted at signing. The release workflow also regenerates the bundled PDF for offline use.

### Before the first real sponsor

1. **Regional Director** — Approve the Resource Guide prices, available placements, artwork deadline, recognition wording and invoice terms. Confirm who will reconcile payments and send email from NAMI’s mailbox.
2. **Deployment owner** — Point `SPONSOR_BLOB` at a clean production storage account with a private container named `sponsorship`. Set `PUBLIC_ORIGIN` to the live HTTPS address, give authorized staff a production `ADMIN_KEY`, and set `PAYMENT_INSTRUCTIONS` to the approved remittance instructions. If NAMI accepts online payments through an existing provider, staff can enter its approved HTTPS form under **Program content**.
3. **Together** — Rehearse one inquiry and one commitment with fictional data in a separate test workspace. Check the invoice amount and due date, record a verified test payment, prepare a welcome email and complete one benefit. Once approved, set `SPONSOR_DEMO=0` before the production app first accesses its clean store. Confirm the production health response reports `demo: false` before sending the first invitation.

The manual-payment and staff-email workflow can run the pilot. Automatic payment reconciliation, outgoing email, and scheduled reminders outside the desk would each require a separate integration.

