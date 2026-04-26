import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      "functions/lib/**",
      "node_modules/**"
    ]
  }
];

export default eslintConfig;
