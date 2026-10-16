import { createClient } from "@supabase/supabase-js";

// Login único (2026-10): as contas são do Supabase do Hub Geotech. Hub e
// GeoMap ficam no mesmo endereço (lmalerbo.github.io), então a sessão salva
// é a mesma: quem já entrou no Hub entra direto aqui. Chave pública.
const URL_HUB = import.meta.env.VITE_HUB_SUPABASE_URL || "https://dpvsivypabmvmrrpgmhc.supabase.co";
const CHAVE_HUB = import.meta.env.VITE_HUB_SUPABASE_ANON_KEY || "sb_publishable_3xv0R1kmhSXkoUh3i4vN0A_Q5oLBbVL";
export const hub = createClient(URL_HUB, CHAVE_HUB);
