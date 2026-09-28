import type { AdminLoginState } from "@/domain/admin-users/adminUser.types";
import {
  AdminPanelPermissionLevel,
  AdminPanelRole,
  AdminUserPasswordStatus,
} from "@/lib/enums";
import { lajeApiRequest } from "./client";

export interface DedicatedAuthPermission {
  scope: string;
  level: AdminPanelPermissionLevel;
}

export interface DedicatedAuthUser {
  id: string;
  email: string | null;
  role: AdminPanelRole | null;
  profile: {
    id: string;
    name: string;
  } | null;
  permissions: DedicatedAuthPermission[];
  canAccessAdminPanel: boolean;
}

export interface DedicatedAuthSession {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  user: DedicatedAuthUser;
}

interface DataResponse<DataType> {
  data: DataType;
}

interface LoginStateResponse {
  loginIdentifier: string;
  passwordStatus: AdminUserPasswordStatus;
}

export async function resolveDedicatedLoginState(loginIdentifier: string): Promise<AdminLoginState> {
  const response = await lajeApiRequest<DataResponse<LoginStateResponse>>("/auth/login-state", {
    method: "POST",
    body: JSON.stringify({ loginIdentifier }),
  });

  return {
    auth_email: "",
    login_identifier: response.data.loginIdentifier,
    password_status: response.data.passwordStatus,
  };
}

export async function createDedicatedSession(
  loginIdentifier: string,
  password: string,
): Promise<DedicatedAuthSession> {
  const response = await lajeApiRequest<DataResponse<DedicatedAuthSession>>("/auth/sessions", {
    method: "POST",
    body: JSON.stringify({ loginIdentifier, password }),
  });

  return response.data;
}

export async function setupDedicatedPassword(
  loginIdentifier: string,
  newPassword: string,
): Promise<DedicatedAuthSession> {
  const response = await lajeApiRequest<DataResponse<DedicatedAuthSession>>(
    "/auth/password-setup",
    {
      method: "POST",
      body: JSON.stringify({ loginIdentifier, newPassword }),
    },
  );

  return response.data;
}

export async function refreshDedicatedSession(): Promise<DedicatedAuthSession> {
  const response = await lajeApiRequest<DataResponse<DedicatedAuthSession>>(
    "/auth/sessions/refresh",
    {
      method: "POST",
    },
  );

  return response.data;
}

export async function deleteDedicatedSession(accessToken: string): Promise<void> {
  await lajeApiRequest<void>(
    "/auth/sessions/current",
    {
      method: "DELETE",
    },
    accessToken,
  );
}

export async function changeDedicatedPassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await lajeApiRequest<void>(
    "/auth/password",
    {
      method: "PATCH",
      body: JSON.stringify({ currentPassword, newPassword }),
    },
    accessToken,
  );
}
