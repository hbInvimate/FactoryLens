import { Gate } from "@/components/auth/Gate";
import { PageBar } from "@/components/PageBar";
import { StartForm } from "@/components/StartForm";
import { currentUser } from "@/lib/auth/server";
import { activeRevision } from "@/lib/server/sop";

/** Inside the Gate, so someone is signed in. */
async function Start() {
  const [user, rev] = await Promise.all([currentUser(), activeRevision()]);
  // A new check starts on the Active revision (lib/sop.ts when the database has none).
  return <StartForm operatorName={user?.name ?? ""} sop={{ id: rev.id, label: rev.label }} />;
}

export default function Home() {
  return (
    <Gate area="check" next="/">
      <PageBar title="Quality Technician workstation" current="start" />
      <main className="flex flex-1 flex-col px-8 py-8">
        <Start />
      </main>
    </Gate>
  );
}
