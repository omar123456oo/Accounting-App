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
