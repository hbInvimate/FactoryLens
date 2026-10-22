import { SignInPage } from "@/components/auth/SignInPage";

export const metadata = { title: "FactoryLens AI: Supervisor sign-in" };

export default function SupervisorSignIn(props: PageProps<"/supervisor/signin">) {
  return <SignInPage area="supervisor" searchParams={props.searchParams} />;
}
