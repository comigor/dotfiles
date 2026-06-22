# Adding a NEW public root domain (Cloudflare DNS + Pangolin)

Worked task: user bought `vvorms.com` (already in their Cloudflare account) and
wanted it wired to the existing `vvorms` app, which already serves on
`vvorms.borges.dev` via Pangolin. This splits into TWO halves: DNS (fully
doable from here via the Cloudflare API) and Pangolin org-domain registration
(needs admin access this host does NOT have).

## Topology facts (this homelab)

- **All public hostnames route through Pangolin on oracle.** Every
  `*.borges.dev` public record is a grey-cloud (DNS-only) `CNAME ->
  oracle.borges.dev`; `oracle.borges.dev` is an `A` record to
  **`144.22.246.72`**. Pangolin terminates TLS itself (Let's Encrypt), so
  records are NOT Cloudflare-proxied (orange cloud OFF).
- `newt` (the tunnel client, in `oracle_core`/`core.yaml`) watches Docker
  labels on brick/bee/oracle and registers resources with the Pangolin control
  plane at `https://pangolin.borges.dev`. The control plane itself is NOT in
  the `comigor/cloud` GitOps repo — it's a separately-administered service.
- Per-resource routing = Docker labels (see umbrella SKILL.md "Public routing").

## Cloudflare credentials (in Komodo variables)

- `CF_API_TOKEN` == `CLOUDFLARE_API_TOKEN` (same value; `is_secret`). Scoped to
  edit DNS across all zones in the account.
- `CF_ACCOUNT_ID`, `CF_ZONE_ID` (the borges.dev zone), `DNS_DOMAIN=borges.dev`.
- Fetch via `call("read","GetVariable",{"name":"CF_API_TOKEN"})["value"]`.

The token works against the standard CF v4 API:
`Authorization: Bearer <token>`, base `https://api.cloudflare.com/client/v4`.
- `GET /user/tokens/verify` — sanity check (status active).
- `GET /zones?per_page=50` — list zones; find the new domain's zone id.
- `GET /zones/{zid}/dns_records?per_page=100` — inspect existing records.
- `POST /zones/{zid}/dns_records` body
  `{"type":"A","name":"<name>","content":"<ip>","proxied":false,"ttl":1}`.

## DNS half (DO THIS — fully scriptable)

For a Pangolin **OSS** build the only supported new-domain type is **wildcard**,
which wants **A records to the Pangolin server IP**, not CNAMEs. So for a fresh
apex like `vvorms.com`, create both:

```
A  vvorms.com    -> 144.22.246.72   proxied=false ttl=1
A  *.vvorms.com  -> 144.22.246.72   proxied=false ttl=1
```

(Matches how borges.dev points at oracle; grey cloud so Pangolin does TLS.)
Verified working: both records created cleanly on zone
`7a9cf779840b9b26ce7c16cb9adb2ec2` (vvorms.com).

## Pangolin half (BLOCKED without admin access)

Pangolin requires the domain to be **pre-registered + verified as an org
domain** before any resource's `full-domain=<host>` label will bind to it
(`getDomainForSiteResource` throws if no matching verified domain exists).

- OSS build => domain `type: wildcard`, `baseDomain: vvorms.com` => needs the
  A records above. (NS-delegation and single-CNAME types are SaaS-only.)
- TLS is auto-issued by Pangolin once the domain verifies.
- API endpoint: `PUT /org/:orgId/domain` (`createOrgDomain`), or dashboard
  Org -> Domains -> Add Domain (`CreateDomainForm`).

**Access gap hit this session (all three blocked):**
- Pangolin management API returns **401** unauth; NO admin/integration API key
  is stored in Komodo. The only Pangolin vars are `*_PANGOLIN_NEWT_ID/SECRET`
  (tunnel-client creds — they do NOT grant management API access).
- **No SSH to oracle** from this host (only `bee` has a key; `igor@144.22.246.72`
  => Permission denied (publickey)). Can't edit Pangolin config on the box.
- Dashboard `pangolin.borges.dev` needs an interactive login we don't have.

**To unblock, ask the user for ONE of:**
1. Create a Pangolin API integration key in the dashboard and store it as a
   Komodo var (e.g. `PANGOLIN_API_KEY`) — then register the domain + wire the
   resource fully via API.
2. Register the domain themselves (Org -> Domains -> Add -> Wildcard,
   base=vvorms.com); then the agent just flips the stack's
   `full-domain` label (or adds a second resource label set) and redeploys.

Once registered: edit the app's compose labels (delegate to opencode-http) to
point `pangolin.public-resources.<name>.full-domain=<newdomain>` (or add a
second `public-resources.<name2>.*` block to serve BOTH the old and new host),
then RunSync + DeployStack.

## Fast interim option (offer it)

If the user wants the domain LIVE immediately while Pangolin access is sorted,
add a **Cloudflare Redirect Rule** (or a proxied record + Bulk Redirect)
`vvorms.com -> vvorms.borges.dev`. 30-second change, no Pangolin needed. User
is impatient — proactively offer this rather than leaving the domain dark.
