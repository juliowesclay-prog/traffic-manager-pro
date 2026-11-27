/** Nomes amigáveis das ações registradas na auditoria. */
export const AUDIT_LABELS: Record<string, string> = {
  "staff.login_ok": "Equipe entrou no painel",
  "staff.password_ok": "Equipe: senha confirmada",
  "staff.mfa_ok": "Equipe entrou no painel",
  "staff.mfa_enrolled": "Equipe configurou o autenticador",
  "staff.mfa_failed": "Equipe errou o código do autenticador",
  "staff.login_failed": "Equipe errou a senha",
  "staff.login_locked": "Conta da equipe bloqueada por tentativas",
  "staff.login_blocked": "Tentativa em conta bloqueada",
  "user.logout": "Saiu do sistema",
  "user.password_changed": "Senha alterada",
  "user.password_created": "Senha criada",
  "user.bootstrap_admin": "Primeiro superadministrador criado",
  "staff.created": "Usuário da equipe criado",
  "staff.roles_changed": "Perfis de acesso alterados",
  "staff.blocked": "Usuário da equipe bloqueado",
  "staff.unblocked": "Usuário da equipe desbloqueado",
  "staff.mfa_reset": "Autenticador reiniciado",
  "staff.password_reset": "Senha provisória gerada",
};

export const auditLabel = (action: string) => AUDIT_LABELS[action] ?? action;

Object.assign(AUDIT_LABELS, {
});

Object.assign(AUDIT_LABELS, {
});

Object.assign(AUDIT_LABELS, {
});

Object.assign(AUDIT_LABELS, {
});

Object.assign(AUDIT_LABELS, {
});

Object.assign(AUDIT_LABELS, {
  "traffic.meta_connected": "Conexão com a Meta (anúncios) feita",
  "traffic.meta_disconnected": "Conexão com a Meta (anúncios) desfeita",
  "traffic.account_selected": "Conta de anúncios escolhida",
  "traffic.accounts_refreshed": "Lista de contas de anúncio atualizada",
  "traffic.sync_manual": "Anúncios atualizados manualmente",
  "traffic.sync_interval_changed": "Intervalo de atualização dos anúncios alterado",
  "traffic.ai_analysis": "Análise da IA pedida (anúncios)",
  "traffic.capi_settings": "API de Conversões da Meta configurada",
  "traffic.capi_sent": "Conversões enviadas à Meta (manual)",
  "traffic.actions_settings": "Teto e regras das ações nos anúncios alterados",
  "traffic.action_requested": "Ação nos anúncios pedida (aguarda aprovação)",
  "traffic.action_approved": "Ação nos anúncios aprovada",
  "traffic.action_rejected": "Ação nos anúncios recusada",
  "traffic.action_cancelled": "Pedido de ação nos anúncios cancelado",
  "traffic.action_executed": "Ação feita na Meta (anúncios)",
  "traffic.action_failed": "Ação nos anúncios não foi feita",
  "company.created": "Empresa cadastrada",
  "company.suspended": "Empresa suspensa",
  "company.reactivated": "Empresa reativada",
  "company.switched": "Empresa aberta no painel",
  "company.access_granted": "Acesso à empresa liberado",
  "company.access_revoked": "Acesso à empresa retirado",
  "apikey.created": "Chave da API criada",
  "apikey.revoked": "Chave da API revogada",
});
