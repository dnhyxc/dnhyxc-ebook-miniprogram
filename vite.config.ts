import uni from "@dcloudio/vite-plugin-uni";
import Components from "@uni-helper/vite-plugin-uni-components";
import { defineConfig } from "vite";
import { WotResolver } from "./src/resolvers/wot-ui-resolver";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    Components({
      resolvers: [WotResolver()],
      dts: "src/components.d.ts",
    }),
    uni(),
  ],
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
        silenceDeprecations: ["legacy-js-api"],
      },
    },
  },
});
