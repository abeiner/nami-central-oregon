# Sponsorship assistant

The staff assistant connects an MCP client to the same sponsorship records and program content as the staff dashboard. Start with a monthly check-in, inspect a specific sponsor, or prepare renewal outreach. Use the dashboard for personal contact details, printable invoices, and addressable email drafts.

## Connect a client

Ask your administrator for the deployment URL and staff key. Set `NAMI_MCP_TOKEN` to the staff key in the shell that starts your client. For the Claude Code and PowerShell commands, set `NAMI_MCP_URL` to the URL ending in `/api/mcp`. Use HTTPS for deployments and share the key with authorized staff only. For a local run, use the loopback URL printed by the API server and append `/api/mcp`.

Use `x-admin-key` for the Azure Static Web Apps deployment. You can use the same header locally.

### Codex CLI

Add this entry to `~/.codex/config.toml`, replacing any existing `[mcp_servers.nami]` entry. Set `url` to your actual MCP URL. `env_http_headers` reads the key at runtime.

```toml
[mcp_servers.nami]
url = "https://your-deployment.example/api/mcp"
env_http_headers = { "x-admin-key" = "NAMI_MCP_TOKEN" }
```

Run `codex mcp list`, then start `codex` and open `/mcp` to check the connection. See the [Codex MCP guide](https://developers.openai.com/codex/mcp).

### Claude Code

From the directory where you use Claude Code, register the URL with a literal environment reference. The single quotes keep PowerShell or Bash from expanding the key while registering the server.

```powershell
claude mcp add --transport http --scope local nami $env:NAMI_MCP_URL --header 'x-admin-key: ${NAMI_MCP_TOKEN}'
claude mcp list
claude
```

Open `/mcp` inside Claude Code to check the connection and discover available capabilities. See the [Claude Code MCP guide](https://code.claude.com/docs/en/mcp).

For Bash or Zsh, replace `$env:NAMI_MCP_URL` with `"$NAMI_MCP_URL"`. Keep the single quotes around the Claude header.

### Other clients

Use Streamable HTTP at the same URL and send `x-admin-key: <staff key>` on each call. The local API also accepts `Authorization: Bearer <staff key>` when you connect directly to its loopback port. POST requests use `Content-Type: application/json` and `Accept: application/json, text/event-stream`. The endpoint returns JSON and handles notifications with an empty HTTP 202 response. Clients that require interactive OAuth, an SSE-only connection, or a browser `Origin` header need a different connection setup. See the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

For a connection check in PowerShell, initialize the endpoint without writing any data.

```powershell
$init = @{
  jsonrpc = '2.0'
  id = 1
  method = 'initialize'
  params = @{
    protocolVersion = '2025-11-25'
    capabilities = @{}
    clientInfo = @{ name = 'staff-check'; version = '1.0.0' }
  }
}
Invoke-RestMethod -Uri $env:NAMI_MCP_URL -Method Post -ContentType 'application/json' `
  -Headers @{ 'x-admin-key' = $env:NAMI_MCP_TOKEN; Accept = 'application/json, text/event-stream' } `
  -Body ($init | ConvertTo-Json -Depth 5)
```

## Run a check-in

The server publishes the `monthly-check-in`, `sponsor-onboarding`, and `renewals` prompts. If your client shows tools without prompts, paste a request like this into the assistant.

> Give me the monthly sponsorship check-in. Show overdue items first, then the three most urgent actions for the next 30 days. Add the 90-day renewal outlook and prior commitment value. Ask me before making any changes.

| Ask the assistant to | Tools |
| --- | --- |
| Review open work and its due dates | `whats_due`, `list_sponsors`, `get_sponsor` |
| Add an organization to the prospect list | `add_prospect` |
| Preview or record template usage | `list_email_templates`, `draft_email`, `log_email` |
| Record money received or a benefit delivered | `mark_paid`, `complete_benefit` |
| Plan upcoming annual renewals | `renewal_report` |
| Read or update public copy or annual tier prices | `get_program_content`, `update_program_content` |

Review the exact operation before approving a write. For a payment, provide a receipt, check, or accounting reference and record it only after receipt. For a price change, review the current and proposed amount. The published price applies to new commitments. `log_email` records template usage in the activity history. Send the actual message from the staff mail client.

Keep real names, email addresses, phone numbers, payment account details, and other personal information out of assistant conversations. Sponsor lookups return organization-level details and the email preview omits private personalization and invoice links. Use fictional records when demonstrating the assistant.
