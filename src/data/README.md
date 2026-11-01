# src/data — acesso a dados

Cliente Supabase, repositórios, gerenciador único de Realtime (`realtime.ts`), detector de conexão (`conexao.ts`) e tipos gerados (`database.types.ts`). As telas leem dados só pelos hooks daqui, nunca com `supabase.from()`.
