import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**', 'test/dist/**', 'node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    // 浏览器里的代码
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    // node 里的代码：测试、构建脚本
    files: ['test/**/*.ts', 'test/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    rules: {
      // 测试与构建脚本里要打日志
      'no-console': 'off',
      // 空的 catch 也要说明为什么可以忽略（架构评审 F10：静默吞异常）
      'no-empty': ['error', { allowEmptyCatch: false }],
      // 未使用的变量由 TypeScript 兜底（noUnusedLocals 已开）
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      // 模板的换行风格由项目自己把握，不跟 lint 较劲
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },
)
