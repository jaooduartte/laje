import type { Database } from "@/integrations/supabase/types";
import { isAdminUserPasswordStatus } from "@/lib/adminUsers";
import { AdminPanelRole, AdminUserPasswordStatus } from "@/lib/enums";
import type { AdminUser, CurrentAdminAccount } from "@/lib/types";
import type {
  AdminCreateUserFormValues,
  AdminLoginState,
  AdminUserNameFormValues,
  AdminUserLoginIdentifierFormValues,
  AdminUserPasswordFormValues,
  AdminUserPasswordSetupFormValues,
} from "@/domain/admin-users/adminUser.types";

type ListAdminUsersRow = Database["public"]["Functions"]["list_admin_users"]["Returns"][number];
type ResolveAdminLoginStateRow = Database["public"]["Functions"]["resolve_admin_login_state"]["Returns"][number];
type GetCurrentAdminAccountRow = Database["public"]["Functions"]["get_current_admin_account"]["Returns"][number];

function isAdminPanelRole(value: string | null): value is AdminPanelRole {
  return value == AdminPanelRole.ADMIN || value == AdminPanelRole.EVENTOS || value == AdminPanelRole.MESA;
}

function resolveNormalizedLoginIdentifier(login_identifier: string): string {
  return login_identifier.trim().toLowerCase();
}

function resolveNormalizedAdminUserName(name: string): string {
  return name.trim();
}

export class AdminUserDTO {
  private readonly admin_user_row: ListAdminUsersRow;

  constructor(admin_user_row: ListAdminUsersRow) {
    this.admin_user_row = admin_user_row;
  }

  static fromResponse(admin_user_row: ListAdminUsersRow): AdminUserDTO {
    return new AdminUserDTO(admin_user_row);
  }

  bindToRead(): AdminUser {
    const normalized_role =
      this.admin_user_row.role && isAdminPanelRole(this.admin_user_row.role) ? this.admin_user_row.role : null;
    const normalized_password_status = isAdminUserPasswordStatus(this.admin_user_row.password_status)
      ? this.admin_user_row.password_status
      : AdminUserPasswordStatus.PENDING;
    const normalized_login_identifier =
      typeof this.admin_user_row.login_identifier == "string" && this.admin_user_row.login_identifier.trim().length > 0
        ? this.admin_user_row.login_identifier
        : this.admin_user_row.email ?? "";
    const normalized_name =
      typeof this.admin_user_row.name == "string" && this.admin_user_row.name.trim().length > 0
        ? this.admin_user_row.name.trim()
        : normalized_login_identifier;

    return {
      user_id: this.admin_user_row.user_id,
      name: normalized_name,
      email: this.admin_user_row.email,
      login_identifier: normalized_login_identifier,
      password_status: normalized_password_status,
      role: normalized_role,
      profile_id: this.admin_user_row.profile_id ?? null,
      profile_name: this.admin_user_row.profile_name ?? null,
      created_at: this.admin_user_row.created_at,
      last_sign_in_at: this.admin_user_row.last_sign_in_at,
    };
  }
}

export class CurrentAdminAccountDTO {
  private readonly current_admin_account_row: GetCurrentAdminAccountRow;

  constructor(current_admin_account_row: GetCurrentAdminAccountRow) {
    this.current_admin_account_row = current_admin_account_row;
  }

  static fromResponse(current_admin_account_row: GetCurrentAdminAccountRow): CurrentAdminAccountDTO {
    return new CurrentAdminAccountDTO(current_admin_account_row);
  }

  bindToRead(): CurrentAdminAccount {
    const normalized_password_status = isAdminUserPasswordStatus(this.current_admin_account_row.password_status)
      ? this.current_admin_account_row.password_status
      : AdminUserPasswordStatus.PENDING;
    const normalized_login_identifier =
      typeof this.current_admin_account_row.login_identifier == "string" &&
      this.current_admin_account_row.login_identifier.trim().length > 0
        ? this.current_admin_account_row.login_identifier
        : this.current_admin_account_row.email ?? "";
    const normalized_name =
      typeof this.current_admin_account_row.name == "string" && this.current_admin_account_row.name.trim().length > 0
        ? this.current_admin_account_row.name.trim()
        : normalized_login_identifier;

    return {
      user_id: this.current_admin_account_row.user_id,
      name: normalized_name,
      email: this.current_admin_account_row.email,
      login_identifier: normalized_login_identifier,
      password_status: normalized_password_status,
      profile_id: this.current_admin_account_row.profile_id ?? null,
      profile_name: this.current_admin_account_row.profile_name ?? null,
    };
  }
}

export class AdminLoginStateDTO {
  private readonly login_state_row: ResolveAdminLoginStateRow;

  constructor(login_state_row: ResolveAdminLoginStateRow) {
    this.login_state_row = login_state_row;
  }

  static fromResponse(login_state_row: ResolveAdminLoginStateRow): AdminLoginStateDTO {
    return new AdminLoginStateDTO(login_state_row);
  }

  bindToRead(): AdminLoginState {
    const normalized_password_status = isAdminUserPasswordStatus(this.login_state_row.password_status)
      ? this.login_state_row.password_status
      : AdminUserPasswordStatus.PENDING;
    const normalized_login_identifier =
      typeof this.login_state_row.login_identifier == "string" && this.login_state_row.login_identifier.trim().length > 0
        ? this.login_state_row.login_identifier
        : this.login_state_row.auth_email;

    return {
      auth_email: this.login_state_row.auth_email,
      login_identifier: normalized_login_identifier,
      password_status: normalized_password_status,
    };
  }
}

export class AdminCreateUserDTO {
  private readonly form_values: AdminCreateUserFormValues;

  constructor(form_values: AdminCreateUserFormValues) {
    this.form_values = form_values;
  }

  static fromFormValues(form_values: AdminCreateUserFormValues): AdminCreateUserDTO {
    return new AdminCreateUserDTO(form_values);
  }

  bindToSave(): Database["public"]["Functions"]["create_admin_user_with_access"]["Args"] {
    const normalized_name = resolveNormalizedAdminUserName(this.form_values.name);
    const normalized_login_identifier = resolveNormalizedLoginIdentifier(this.form_values.login_identifier);
    const normalized_profile_id = this.form_values.profile_id.trim();

    if (normalized_name.length < 3) {
      throw new Error("Informe um nome com ao menos 3 caracteres.");
    }

    if (!normalized_login_identifier) {
      throw new Error("Informe um login válido.");
    }

    if (normalized_login_identifier.includes(" ")) {
      throw new Error("O login não pode conter espaços.");
    }

    if (!normalized_profile_id) {
      throw new Error("Selecione um perfil administrativo.");
    }

    return {
      _login_identifier: normalized_login_identifier,
      _name: normalized_name,
      _password: null,
      _profile_id: normalized_profile_id,
      _role: null,
    };
  }
}

export class AdminUserNameSaveDTO {
  private readonly form_values: AdminUserNameFormValues;

  constructor(form_values: AdminUserNameFormValues) {
    this.form_values = form_values;
  }

  static fromFormValues(form_values: AdminUserNameFormValues): AdminUserNameSaveDTO {
    return new AdminUserNameSaveDTO(form_values);
  }

  bindToSave(): Database["public"]["Functions"]["admin_update_user_name"]["Args"] {
    const normalized_name = resolveNormalizedAdminUserName(this.form_values.name);

    if (!this.form_values.target_user_id) {
      throw new Error("Usuário inválido.");
    }

    if (normalized_name.length < 3) {
      throw new Error("Informe um nome com ao menos 3 caracteres.");
    }

    return {
      _target_user_id: this.form_values.target_user_id,
      _name: normalized_name,
    };
  }
}

export class AdminUserLoginIdentifierSaveDTO {
  private readonly form_values: AdminUserLoginIdentifierFormValues;

  constructor(form_values: AdminUserLoginIdentifierFormValues) {
    this.form_values = form_values;
  }

  static fromFormValues(form_values: AdminUserLoginIdentifierFormValues): AdminUserLoginIdentifierSaveDTO {
    return new AdminUserLoginIdentifierSaveDTO(form_values);
  }

  bindToSave(): Database["public"]["Functions"]["admin_update_user_login_identifier"]["Args"] {
    const normalized_login_identifier = resolveNormalizedLoginIdentifier(this.form_values.login_identifier);

    if (!this.form_values.target_user_id) {
      throw new Error("Usuário inválido.");
    }

    if (!normalized_login_identifier) {
      throw new Error("Informe um login válido.");
    }

    if (normalized_login_identifier.includes(" ")) {
      throw new Error("O login não pode conter espaços.");
    }

    return {
      _target_user_id: this.form_values.target_user_id,
      _login_identifier: normalized_login_identifier,
    };
  }
}

export class AdminUserPasswordSaveDTO {
  private readonly form_values: AdminUserPasswordFormValues;

  constructor(form_values: AdminUserPasswordFormValues) {
    this.form_values = form_values;
  }

  static fromFormValues(form_values: AdminUserPasswordFormValues): AdminUserPasswordSaveDTO {
    return new AdminUserPasswordSaveDTO(form_values);
  }

  bindToSave(): Database["public"]["Functions"]["admin_update_user_password"]["Args"] {
    const normalized_password = this.form_values.new_password.trim();

    if (!this.form_values.target_user_id) {
      throw new Error("Usuário inválido.");
    }

    if (normalized_password.length < 8) {
      throw new Error("A nova senha deve ter ao menos 8 caracteres.");
    }

    return {
      _target_user_id: this.form_values.target_user_id,
      _new_password: normalized_password,
    };
  }
}

export class AdminUserPasswordSetupDTO {
  private readonly form_values: AdminUserPasswordSetupFormValues;

  constructor(form_values: AdminUserPasswordSetupFormValues) {
    this.form_values = form_values;
  }

  static fromFormValues(form_values: AdminUserPasswordSetupFormValues): AdminUserPasswordSetupDTO {
    return new AdminUserPasswordSetupDTO(form_values);
  }

  bindToSave(): Database["public"]["Functions"]["complete_admin_user_password_setup"]["Args"] {
    const normalized_login_identifier = resolveNormalizedLoginIdentifier(this.form_values.login_identifier);
    const normalized_password = this.form_values.new_password.trim();
    const normalized_confirm_password = this.form_values.confirm_password.trim();

    if (!normalized_login_identifier) {
      throw new Error("Informe seu usuário.");
    }

    if (normalized_password.length < 8) {
      throw new Error("A senha deve ter ao menos 8 caracteres.");
    }

    if (normalized_password != normalized_confirm_password) {
      throw new Error("As senhas informadas não coincidem.");
    }

    return {
      _login_identifier: normalized_login_identifier,
      _new_password: normalized_password,
    };
  }
}
