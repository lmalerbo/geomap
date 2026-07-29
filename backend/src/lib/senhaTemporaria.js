// Senha temporária fixa usada pra criar usuário e redefinir senha — o
// admin nunca mais escolhe a senha em si, só decide QUANDO redefinir. O
// usuário troca por uma senha própria na tela de definir senha (obrigatória
// enquanto usuarios.precisa_trocar_senha for true), tanto no 1º login
// quanto depois de um reset feito pelo admin.
export const SENHA_TEMPORARIA_PADRAO = "usina123";
