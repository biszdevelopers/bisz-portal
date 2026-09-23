declare module "#auth-utils" {
  interface User {
    id: string
    name: string | null
    email: string | null
    image: string | null
  }

  interface SecureSessionData {
    basisAccessToken: string
  }
}

export {}
