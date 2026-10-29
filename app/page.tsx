import { Gate } from "@/components/auth/Gate";
import { TechShell } from "@/components/tasks/TechShell";
import { StartForm } from "@/components/StartForm";
import { currentUser } from "@/lib/auth/server";
import { activeRevision } from "@/lib/server/sop";
import { bannerFor } from "@/lib/server/sopActivate";
import { SopBanner } from "@/components/SopBanner";
import { LastChecks, UpNext } from "@/components/tasks/StartCards";

/** Inside the Gate, so someone is signed in. */
async function Start() {
  const [user, rev] = await Promise.all([currentUser(), activeRevision()]);
  const banner = user ? await bannerFor(user.id) : null;
  // A new check starts on the Active revision (lib/sop.ts when the database has none).
  return (
    <div className="flex flex-col gap-6">
      {banner && <SopBanner {...banner} />}
      <StartForm operatorName={user?.name ?? ""} sop={{ id: rev.id, label: rev.label }} />
      {user && (
        <div className="mx-auto grid w-full max-w-[880px] gap-6 md:grid-cols-2">
          <UpNext user={user} sop={{ id: rev.id, label: rev.label }} />
          <LastChecks user={user} />
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Gate area="check" next="/">
      <TechShell>
        <main className="flex flex-1 flex-col px-8 py-8">
          <Start />
        </main>
      </TechShell>
    </Gate>
  );
}
