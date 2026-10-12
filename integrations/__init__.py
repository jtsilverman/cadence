"""Personal health-data sync for Cadence.

Garmin Connect and MyFitnessPal ship as Python libraries. This package
fetches the owner's own account and hands a JSON bundle to
``scripts/ingest-external.ts``, which maps it onto the event log.
"""
