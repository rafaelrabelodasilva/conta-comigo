import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// AD-1: módulos proibidos no núcleo. A mesma lista vale para `import`,
// `import()` dinâmico e `require()`. `\x2F` é a barra: o seletor do
// no-restricted-syntax não aceita `/` literal dentro da regex.
const PROIBIDOS = [
  "@\\x2F", // alias @/
  "(\\.\\x2F)?(\\.\\.\\x2F)+(data|ui|app|features|server)($|\\x2F)",
  "(.*\\x2F)?src\\x2F(data|ui|app|features|server)($|\\x2F)",
  "next($|[-\\x2F])",
  "@next\\x2F",
  "react($|[-\\x2F])",
  "@supabase\\x2F",
];
const REGEX_PROIBIDOS = `/^(${PROIBIDOS.join("|")})/`;
const MENSAGEM_NUCLEO =
  "src/domain é puro: só imports relativos do próprio núcleo; nada de @/, outras camadas, Next, React ou Supabase. Veja AD-1.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // AD-1: o núcleo (src/domain) é puro. Só imports relativos dentro do núcleo;
  // nada de alias `@/`, outras camadas, Next, React ou Supabase.
  {
    files: ["src/domain/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^@/",
              message:
                "src/domain usa só imports relativos (sem alias @/). Veja AD-1.",
            },
            {
              regex: "^(\\./)?(\\.\\./)+(data|ui|app|features|server)(/|$)",
              message:
                "src/domain não pode importar outras camadas (data, ui, app, features, server). Veja AD-1.",
            },
            {
              regex: "(^|/)src/(data|ui|app|features|server)(/|$)",
              message:
                "src/domain não pode importar outras camadas (data, ui, app, features, server). Veja AD-1.",
            },
            {
              regex: "^(next($|[-/])|@next/)",
              message: "src/domain não pode depender do Next.js. Veja AD-1.",
            },
            {
              regex: "^react($|[-/])",
              message: "src/domain não pode depender do React. Veja AD-1.",
            },
            {
              regex: "^@supabase/",
              message: "src/domain não pode depender do Supabase. Veja AD-1.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: `ImportExpression[source.value=${REGEX_PROIBIDOS}]`,
          message: MENSAGEM_NUCLEO,
        },
        {
          selector: `CallExpression[callee.name='require'][arguments.0.value=${REGEX_PROIBIDOS}]`,
          message: MENSAGEM_NUCLEO,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gerados/externos:
    "coverage/**",
    ".vercel/**",
    "supabase/.temp/**",
    "supabase/.branches/**",
    "_bmad/**",
    "_bmad-output/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
