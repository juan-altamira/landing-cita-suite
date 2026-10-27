import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cita-suite.com.ar',
  output: 'static',
  build: {
    inlineStylesheets: 'always'
  },
  devToolbar: { enabled: false }
});
