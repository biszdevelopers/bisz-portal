import { auth, signIn } from "@/auth"
import { CurrentUser } from "@/components/current-user"
import { Button } from "@/components/ui/button"

export default async function OverviewPage() {
  const session = await auth()
  const user = session?.user

  if (!user) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Hello, Guest</h1>
        <p className="text-sm text-muted-foreground">Sign in through DevConnect to load your Basis profile.</p>
        <form
          action={async () => {
            "use server"
            await signIn("basis-auth", { redirectTo: "/" })
          }}
        >
          <Button type="submit">Sign in with DevConnect</Button>
        </form>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <CurrentUser />
    </section>
  )
}
