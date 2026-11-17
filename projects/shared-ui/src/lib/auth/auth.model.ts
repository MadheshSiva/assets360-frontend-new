/** Sign-up form data, sent to POST /api/auth/register. */
export interface RegisterData {
  fullName: string;
  userName: string;
  email: string;
  contactNo: string;
  password: string;
  /** roleId of one of the roles from GET /api/auth/roles. */
  userRoleId: string;
}

/** A role offered on the sign-up page. */
export interface SignupRole {
  roleId: string;
  roleName: string;
  description: string;
}

export interface LoginData {
  userName: string;
  password: string;
}

/** The signed-in user. */
export interface AuthUser {
  userName: string;
  email: string;
  roleName: string;
  id?: string;
  userId?: string;
  userRoleId?: string;
  clientId?: string | null;
  tenantId?: string | null;
}

/**
 * POST /api/auth/login: the password is right and a second step follows.
 * method 'totp': enter the authenticator app code (with loginToken); setupRequired adds a QR code to scan first.
 * method 'email': enter the code emailed to maskedEmail.
 */
export interface LoginResponse {
  twoFactorRequired: boolean;
  method: 'totp' | 'email';
  message: string;
  otpExpiresInSeconds: number;
  maskedEmail?: string | null;
  loginToken?: string | null;
  setupRequired?: boolean;
  /** data: URI of the QR code image. */
  qrCodeImage?: string | null;
  manualEntryKey?: string | null;
}

/** POST /api/auth/verify-totp and /verify-otp: the session tokens. */
export interface AuthTokenResponse {
  message: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  tokenType: string;
  user: {
    id: string;
    userId: string;
    userName: string;
    email: string;
    roleName: string;
    userRoleId: string;
    clientId: string | null;
    tenantId: string | null;
  };
}

export interface RegisterResponse {
  message: string;
  userName: string;
  email: string;
}
