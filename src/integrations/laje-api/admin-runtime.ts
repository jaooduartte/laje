import type { AdminActionLog, AdminProfile, AdminUser } from "@/lib/types";
import {
  AdminPanelPermissionLevel,
  AdminPanelRole,
  AdminPanelTab,
  AdminUserPasswordStatus,
} from "@/lib/enums";
import { lajeApiRequest } from "./client";

interface DataResponse<T> {
  data: T;
}

interface AdminDirectoryApiUser {
  userId: string;
  name: string;
  email: string | null;
  loginIdentifier: string;
  passwordStatus: AdminUserPasswordStatus;
  role: AdminPanelRole | null;
  profileId: string | null;
  profileName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
}

interface AdminDirectoryApiProfile {
  profileId: string;
  profileName: string;
  isSystem: boolean;
  permissions: Record<string, AdminPanelPermissionLevel>;
  createdAt: string;
  updatedAt: string;
}

interface AdminLogApiRow {
  id: string;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: AdminPanelRole | null;
  actionType: AdminActionLog["action_type"];
  resourceTable: string;
  recordId: string | null;
  description: string | null;
  oldData: Record<string, unknown> | null;
  newData: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export async function fetchAdminDirectoryFromApi(): Promise<{
  users: AdminUser[];
  profiles: AdminProfile[];
}> {
  const response = await lajeApiRequest<
    DataResponse<{
      users: AdminDirectoryApiUser[];
      profiles: AdminDirectoryApiProfile[];
    }>
  >("/admin-runtime/users");

  return {
    users: response.data.users.map((user) => ({
      user_id: user.userId,
      name: user.name,
      email: user.email,
      login_identifier: user.loginIdentifier,
      password_status: user.passwordStatus,
      role: user.role,
      profile_id: user.profileId,
      profile_name: user.profileName,
      created_at: user.createdAt,
      last_sign_in_at: user.lastSignInAt,
    })),
    profiles: response.data.profiles.map((profile) => ({
      profile_id: profile.profileId,
      profile_name: profile.profileName,
      is_system: profile.isSystem,
      permissions: profile.permissions as Record<AdminPanelTab, AdminPanelPermissionLevel>,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    })),
  };
}

export async function fetchAdminLogsFromApi(input: {
  page: number;
  pageSize: number;
  userId?: string | null;
  actionType?: AdminActionLog["action_type"] | null;
  search?: string | null;
}): Promise<{ logs: AdminActionLog[]; totalCount: number }> {
  const search = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });
  if (input.userId) search.set("userId", input.userId);
  if (input.actionType) search.set("actionType", input.actionType);
  if (input.search?.trim()) search.set("search", input.search.trim());

  const response = await lajeApiRequest<
    DataResponse<{
      logs: AdminLogApiRow[];
      totalCount: number;
    }>
  >(`/admin-runtime/logs?${search.toString()}`);

  return {
    logs: response.data.logs.map((log) => ({
      id: log.id,
      actor_user_id: log.actorUserId,
      actor_name: log.actorName,
      actor_email: log.actorEmail,
      actor_role: log.actorRole,
      action_type: log.actionType,
      resource_table: log.resourceTable,
      record_id: log.recordId,
      description: log.description,
      old_data: log.oldData,
      new_data: log.newData,
      metadata: log.metadata,
      created_at: log.createdAt,
    })),
    totalCount: response.data.totalCount,
  };
}
