import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      "GUIDE/**",
      "functions/lib/**",
      "node_modules/**"
    ]
  }
];

export default eslintConfig;
