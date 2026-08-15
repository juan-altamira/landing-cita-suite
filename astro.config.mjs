import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cita-suite.vercel.app',
  output: 'static',
  build: {
    inlineStylesheets: 'always'
  },
  devToolbar: { enabled: false }
});
