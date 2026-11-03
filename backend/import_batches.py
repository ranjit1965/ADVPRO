"""Imports the BatchMaster table now, from BATCH_IMPORT_PATH in .env (same as the monthly automatic import).

The backend already does this by itself once a month. Run this by hand, or from Windows Task
Scheduler, when the batches are needed sooner:   python import_batches.py
"""
import json

from app import seed
from app.routers.batch_import import run_auto_import

if __name__ == "__main__":
    seed.run()
    summary = run_auto_import(force=True)
    if summary is None:
        from app import db  # noqa: PLC0415

        raise SystemExit("Import failed: " + str((db.db.settings.find_one({"_id": "batchImport"}) or {}).get("lastAutoError")))
    print(json.dumps({k: summary[k] for k in ("path", "rowsRead", "batches", "created", "updated", "assigned", "faculty", "status")}, indent=2))
    if summary["unmatched"]:
        print("Short names not matched to an employee:", ", ".join(u["shortName"] for u in summary["unmatched"]))
