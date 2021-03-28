import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import livereload from "rollup-plugin-livereload";
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
      include: ['App.svelte', '../src/**/*.svelte'],
    }),
    resolve(),
    serve("public"),
    livereload({ watch: "public" })
  ]
};
