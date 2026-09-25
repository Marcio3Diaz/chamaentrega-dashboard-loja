# Local MySQL shadow environment

This Docker environment exists only for migration validation on a developer machine.

## Windows PowerShell

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\database\mysql\setup-local.ps1
```

It starts MySQL on **127.0.0.1:3307** and applies the migration files in the correct order.

Development URL:

```text
mysql://chamaentrega:chamaentrega-dev@127.0.0.1:3307/chamaentrega?ssl=false
```

Then create `services/chamaentrega-api/.env` from its example and use that URL.

To stop the container:

```powershell
powershell -ExecutionPolicy Bypass -File .\database\mysql\stop-local.ps1
```

To destroy the local database completely, run Docker Compose with `down -v`. Do not do that if the local shadow data is needed for comparison.

The passwords in this compose file are intentionally local development credentials and must never be reused in production.
