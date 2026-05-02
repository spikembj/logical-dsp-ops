export default function DriverSafetyEventsPage() {
  return (
    <div className="rounded-md border p-6 text-sm text-muted-foreground">
      Filterable event list (default: last 30 days, impacting only) ships in
      build order step&nbsp;5 (Netradyne import). Until then, no events exist
      for any driver.
    </div>
  );
}
