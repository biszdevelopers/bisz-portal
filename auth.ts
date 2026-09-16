import NextAuth, { type DefaultSession } from "next-auth"

import { BASIS_PORTAL_SCOPE, basisAuthIssuer, basisPortalAudience, requiredEnvironment } from "@/lib/basis-auth"

interface BasisProfile {
  sub: string
  name?: string
  email?: string
  email_verified?: boolean
  picture?: string
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string
    } & DefaultSession["user"]
  }
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 9 * 60,
  },
  providers: [
    {
      id: "basis-auth",
      name: "DevConnect",
      type: "oidc",
      issuer: basisAuthIssuer(),
      clientId: requiredEnvironment("BASIS_AUTH_CLIENT_ID"),
      clientSecret: requiredEnvironment("BASIS_AUTH_CLIENT_SECRET"),
      client: {
        token_endpoint_auth_method: "client_secret_basic",
      },
      authorization: {
        params: {
          scope: `openid profile email ${BASIS_PORTAL_SCOPE}`,
          resource: basisPortalAudience(),
        },
      },
      checks: ["pkce", "state", "nonce"],
      profile(profile: BasisProfile) {
        return {
          id: profile.sub,
          name: profile.name ?? profile.email ?? profile.sub,
          email: profile.email,
          image: profile.picture,
        }
      },
    },
  ],
  callbacks: {
    jwt({ token, profile, account }) {
      if (profile?.sub) token.basisUserId = profile.sub
      if (account?.access_token) token.basisAccessToken = account.access_token
      return token
    },
    session({ session, token }) {
      session.user.id = typeof token.basisUserId === "string" ? token.basisUserId : token.sub ?? ""
      return session
    },
  },
})
