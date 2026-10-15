import { SignInPage } from "@/components/auth/SignInPage";

export const metadata = { title: "FactoryLens AI: Quality Technician sign-in" };

export default function CheckSignIn(props: PageProps<"/signin">) {
  return <SignInPage area="check" searchParams={props.searchParams} />;
}
