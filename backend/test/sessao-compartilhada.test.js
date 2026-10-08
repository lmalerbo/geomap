import { test } from "node:test";
import assert from "node:assert/strict";
import { criarSessaoCompartilhada } from "../src/lib/sessaoCompartilhada.js";

function loginFalso({ atraso = 20, falhar = false } = {}) {
  let chamadas = 0;
  const logar = async () => {
    chamadas++;
    const n = chamadas;
    await new Promise((r) => setTimeout(r, atraso));
    if (falhar) throw new Error("timeout");
    return { cookie: `c${n}` };
  };
  return { logar, chamadas: () => chamadas };
}

test("várias consultas ao mesmo tempo fazem um login só", async () => {
  const f = loginFalso();
  const s = criarSessaoCompartilhada(f.logar);
  const sessoes = await Promise.all(Array.from({ length: 8 }, () => s.obter()));
  assert.equal(f.chamadas(), 1);
  assert.ok(sessoes.every((x) => x === sessoes[0]));
});

test("sessão guardada é reaproveitada sem novo login", async () => {
  const f = loginFalso();
  const s = criarSessaoCompartilhada(f.logar);
  await s.obter();
  await s.obter();
  assert.equal(f.chamadas(), 1);
});

test("401 de uma sessão velha não derruba a sessão nova", async () => {
  const f = loginFalso();
  const s = criarSessaoCompartilhada(f.logar);
  const velha = await s.obter();
  s.invalidar(velha);
  const nova = await s.obter();
  s.invalidar(velha); // outra consulta que ainda usava a velha
  assert.equal(await s.obter(), nova);
  assert.equal(f.chamadas(), 2);
});

test("login que falha não fica preso: a próxima tentativa loga de novo", async () => {
  let falhar = true;
  let chamadas = 0;
  const s = criarSessaoCompartilhada(async () => {
    chamadas++;
    if (falhar) throw new Error("timeout");
    return { cookie: "ok" };
  });
  await assert.rejects(Promise.all([s.obter(), s.obter()]), /timeout/);
  assert.equal(chamadas, 1, "as duas esperaram o mesmo login");
  falhar = false;
  assert.equal((await s.obter()).cookie, "ok");
  assert.equal(chamadas, 2);
});
