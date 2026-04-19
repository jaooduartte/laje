-- Adiciona permissões de score_sheet_review e tie_breaks ao perfil Admin do sistema.
-- O perfil Admin é identificado por system_role = 'admin' na tabela admin_profiles.
-- Todos os outros perfis mantêm sem acesso por padrão (podem ser configurados manualmente).

INSERT INTO public.admin_profile_permissions (profile_id, admin_tab, access_level)
SELECT
  ap.id,
  tab.admin_tab::public.admin_panel_tab,
  'EDIT'::public.admin_panel_permission_level
FROM public.admin_profiles ap
CROSS JOIN (VALUES
  ('score_sheet_review'),
  ('tie_breaks')
) AS tab(admin_tab)
WHERE ap.system_role = 'admin'
ON CONFLICT (profile_id, admin_tab) DO UPDATE
  SET access_level = 'EDIT',
      updated_at   = now();
