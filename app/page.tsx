import { Gate } from "@/components/auth/Gate";
import { PageBar } from "@/components/PageBar";
import { StartForm } from "@/components/StartForm";

export default function Home() {
  return (
    <Gate area="check" next="/">
      <PageBar title="Quality Technician workstation" current="start" />
      <main className="flex flex-1 flex-col px-8 py-8">
        <StartForm />
      </main>
    </Gate>
  );
}
