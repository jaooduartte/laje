import type { AdminUserPasswordStatus } from "@/lib/enums";

export interface AdminCreateUserFormValues {
  name: string;
  login_identifier: string;
  profile_id: string;
}

export interface AdminUserNameFormValues {
  target_user_id: string;
  name: string;
}

export interface AdminUserLoginIdentifierFormValues {
  target_user_id: string;
  login_identifier: string;
}

export interface AdminUserPasswordFormValues {
  target_user_id: string;
  new_password: string;
}

export interface AdminUserPasswordSetupFormValues {
  login_identifier: string;
  new_password: string;
  confirm_password: string;
}

export interface AdminLoginState {
  auth_email: string;
  login_identifier: string;
  password_status: AdminUserPasswordStatus;
}
