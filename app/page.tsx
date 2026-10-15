import { Gate } from "@/components/auth/Gate";
import { PageBar } from "@/components/PageBar";
import { StartForm } from "@/components/StartForm";
import { currentUser } from "@/lib/auth/server";

/** Inside the Gate, so someone is signed in. */
async function Start() {
  const user = await currentUser();
  return <StartForm operatorName={user?.name ?? ""} />;
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
