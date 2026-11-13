import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginPageView } from "@/pages/login/LoginPageView";
import { AdminLoginStage } from "@/lib/enums";

vi.mock("@/components/Header", () => ({
  Header: () => null,
}));

const noAction = () => undefined;

const defaultProps = {
  isLoading: false,
  isUnauthorized: false,
  loginStage: AdminLoginStage.LOGIN_IDENTIFIER,
  loginIdentifier: "",
  password: "",
  newPassword: "",
  confirmPassword: "",
  error: "",
  submitting: false,
  onLoginIdentifierChange: noAction,
  onPasswordChange: noAction,
  onNewPasswordChange: noAction,
  onConfirmPasswordChange: noAction,
  onResetLoginFlow: noAction,
  onSubmit: noAction,
  onSignOut: noAction,
};

describe("LAJE-90 acessibilidade do login administrativo", () => {
  it("identifica o campo de usuário com nome acessível", () => {
    render(<LoginPageView {...defaultProps} />);
    expect(screen.getByRole("textbox", { name: "Usuário" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
  });

  it("identifica o campo de senha e anuncia erros do login", () => {
    render(
      <LoginPageView
        {...defaultProps}
        loginStage={AdminLoginStage.PASSWORD}
        error="Credenciais inválidas."
      />,
    );

    expect(screen.getByLabelText("Senha")).toHaveAttribute("type", "password");
    expect(screen.getByRole("alert")).toHaveTextContent("Credenciais inválidas.");
  });

  it("identifica a nova senha e a confirmação no primeiro acesso", () => {
    render(<LoginPageView {...defaultProps} loginStage={AdminLoginStage.PASSWORD_SETUP} />);
    expect(screen.getByLabelText("Nova senha")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Confirmar nova senha")).toHaveAttribute("type", "password");
  });

  it("mantém um nome acessível no botão desabilitado durante o envio", () => {
    render(
      <LoginPageView
        {...defaultProps}
        loginStage={AdminLoginStage.PASSWORD}
        submitting
      />,
    );
    expect(screen.getByRole("button", { name: "Enviando..." })).toBeDisabled();
  });
});
