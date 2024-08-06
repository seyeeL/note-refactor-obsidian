import typescript from '@rollup/plugin-typescript'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import copy from 'rollup-plugin-copy'
import del from 'rollup-plugin-delete'
const TEST_VAULT = 'test-vault/.obsidian/plugins/note-refactor-obsidian'

export default {
  input: 'src/main.ts',
  output: {
    dir: './',
    sourcemap: 'inline',
    format: 'cjs',
    exports: 'default'
  },
  external: ['obsidian'],
  plugins: [
    del({ targets: `${TEST_VAULT}/*` }),
    typescript(),
    nodeResolve({ browser: true }),
    commonjs(),
    copy({
      targets: [
        { src: 'main.js', dest: TEST_VAULT },
        { src: ['manifest.json', 'styles.css'], dest: TEST_VAULT }
      ],
      flatten: true
    })
  ]
}
