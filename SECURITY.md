# Security notes

## Authorization model

Realtime Database access is role-based. Competitors may write only their own
presence, intent, split, and docket-proposal records. PO state writes require a
short-lived controller lease tied to the caller's verified Firebase UID. Room
creation, PO acquisition, release, and deletion are performed by authenticated
server endpoints using the Admin SDK.

Never deploy `database.rules.json` before deploying the matching browser client
and API endpoints. The previous client does not acquire controller leases.

## Dependency audit

As of 2026-09-10, `npm audit --omit=dev` reports two moderate findings from
`uuid@9.0.1`, pulled in through `gaxios@6.7.1` by the current
`firebase-admin@14.4.0` release. The affected uuid APIs accept caller-provided
output buffers; ParliPro does not call those APIs. Forcing uuid 11 through an
npm override would exceed gaxios's declared major-version range, so this
transitive advisory is being monitored rather than overridden unsafely.

Re-run the audit whenever Firebase Admin is upgraded and remove this exception
as soon as its dependency tree contains `uuid >= 11.1.1`.
