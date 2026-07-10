<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { applyPageChrome } from "@/hooks/useTheme";

onLaunch(() => {
  uni.hideTabBar({ animation: false });
  applyPageChrome();
});
</script>

<style lang="scss">
@use "@wot-ui/ui/styles/theme/index.scss" as *;
@use "@/theme/variables.scss" as *;
</style>
