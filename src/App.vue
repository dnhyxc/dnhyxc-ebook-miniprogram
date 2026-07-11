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

/* ponytail: 固定 Tabbar 不占流，收窄 scroll-view，避免滚到 toolbar 下 */
.page-container.with-tabbar {
  height: 100vh;
  box-sizing: border-box;
  padding-bottom: var(--app-tabbar-inset);
  overflow: hidden;
}
</style>
