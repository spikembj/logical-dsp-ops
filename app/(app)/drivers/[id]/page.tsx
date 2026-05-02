import { notFound } from "next/navigation";
import { getDriverById } from "@/lib/queries/drivers";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DriverProfilePage({ params }: Props) {
  const { id } = await params;
  const driver = await getDriverById(id);
  if (!driver) notFound();

  const fields: { label: string; value: React.ReactNode }[] = [
    { label: "Full name", value: driver.full_name },
    {
      label: "Transporter ID",
      value: driver.transporter_id ? (
        <span className="font-mono text-xs break-all">
          {driver.transporter_id}
        </span>
      ) : (
        <span className="text-muted-foreground italic">
          Not set — populated by next scorecard import
        </span>
      ),
    },
    {
      label: "Hire date",
      value: driver.hire_date ?? (
        <span className="text-muted-foreground">—</span>
      ),
    },
    {
      label: "Status",
      value: <span className="capitalize">{driver.status}</span>,
    },
    {
      label: "Approved vehicles",
      value:
        driver.approved_vehicle_types.length === 0 ? (
          <span className="text-muted-foreground">None set</span>
        ) : (
          driver.approved_vehicle_types
            .map((v) => v.replace("_", " ").toUpperCase())
            .join(", ")
        ),
    },
    {
      label: "Notes",
      value: driver.notes ?? <span className="text-muted-foreground">—</span>,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription className="text-xs">
          Read-only for now. Editing ships in build order step&nbsp;7 (admin
          → drivers).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-y-3 gap-x-4 text-sm">
          {fields.map((f) => (
            <div key={f.label} className="contents">
              <dt className="text-muted-foreground">{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
