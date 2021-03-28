import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import livereload from "rollup-plugin-livereload";
import commonjs from '@rollup/plugin-commonjs';
import css from 'rollup-plugin-css-only';
import serve from "rollup-plugin-serve";

export default {
  input: "main.js",
  output: {
    customElement: true,
    sourcemap: true,
    format: "iife",
    name: "app",
    dir: "public/bundle"
  },
  plugins: [
    svelte({
      compilerOptions: {
				// enable run-time checks when not in production
				dev: false
			},
      emitCss: !true,
      include: ['App.svelte', '../src/**/*.svelte']
    }),
    css({ output: 'bundle.css' }),
    resolve({
			browser: true,
			dedupe: ['svelte']
		}),
    commonjs(),
    serve("public"),
    livereload({ watch: "public" })
  ]
};
