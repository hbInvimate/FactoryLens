import { SignInPage } from "@/components/auth/SignInPage";

export const metadata = { title: "FactoryLens AI: Process engineer sign-in" };

export default function DashboardSignIn(props: PageProps<"/dashboard/signin">) {
  return <SignInPage area="dashboard" searchParams={props.searchParams} />;
}
