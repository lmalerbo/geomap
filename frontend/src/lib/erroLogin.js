// Mensagem da tela de login para um erro do Supabase do Hub. Só acusa a senha quando o
// Supabase diz que as credenciais estão erradas; o resto (rede, limite, corrida com a
// entrada automática) pede para tentar de novo.
export function mensagemErroLogin(error) {
  const texto = String(error?.message || "");
  if (error?.code === "user_banned" || /banned/i.test(texto)) return "Acesso bloqueado. Fale com o administrador do Hub.";
  if (error?.code === "invalid_credentials" || /invalid login credentials/i.test(texto)) return "E-mail ou senha incorretos.";
  return "Não foi possível entrar agora. Tente de novo.";
}
