import { PageBar } from "@/components/PageBar";
import { StartForm } from "@/components/StartForm";

export default function Home() {
  return (
    <>
      <PageBar title="Quality Technician workstation" />
      <main className="flex flex-1 flex-col px-8 py-8">
        <StartForm />
      </main>
    </>
  );
}
