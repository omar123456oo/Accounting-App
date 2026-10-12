export type UserType = 'staff' | 'client';

export interface AuthUser {
  id: string;
  name: string;
  type: UserType;
  permissions: string[];
}

export interface LoginResponse {
  user: AuthUser;
}

/** Laravel-style validation error body (HTTP 422). */
export interface ValidationErrorBody {
  message?: string;
  errors?: Record<string, string[]>;
}

export interface RegisterRequest {
  officeName: string;
  name: string;
  email: string;
  password: string;
  passwordConfirmation: string;
}

export interface RegisterResponse {
  /** When true the owner must confirm the e-mail address before signing in. */
  emailVerificationRequired: boolean;
}
