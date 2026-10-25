declare module "#auth-utils" {
  interface User {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  }

  interface SecureSessionData {
    basisSessionId?: string;
    /** Legacy sealed-cookie tokens, migrated on the next authenticated request. */
    basisAccessToken?: string;
    basisRefreshToken?: string;
  }
}

export {};
