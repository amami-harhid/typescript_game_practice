"use strict";
import tseslint from "typescript-eslint";

const build_eslint_config = [
    {
        ignores: ["**/*.d.ts", "./src/lib/**/*.ts", "./vitePlugins/**/*.ts", "node_modules/**/*", "./*.js"],
    },
    {
        files: ["./src/test/**/*.ts","./src/testV2/**/*.ts"],
    },
    ...tseslint.configs.recommended,
    {
        rules: {
            "@typescript-eslint/no-this-alias": "off"
        }
    }
];
export default build_eslint_config;
