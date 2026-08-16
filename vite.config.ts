import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __BUILD_STAMP__: JSON.stringify(Date.now().toString(36)),
  },
});
