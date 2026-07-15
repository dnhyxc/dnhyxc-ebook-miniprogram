<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { stopListen } from "@/hooks/useChapterListen";
import { applyPageChrome } from "@/hooks/useTheme";

onLaunch(() => {
  uni.hideTabBar({ animation: false });
  applyPageChrome();

  /**
   * 切后台 reason（基础库 3.5.7+）：
   * 0 退出小程序 · 1 进其他小程序 · 2 原生功能页 · 3 其他（含锁屏）
   * 用 wx.onAppHide 才能稳定拿到 reason；只在退出/切走时停听书。
   */
  const wxApi = (
    globalThis as typeof globalThis & {
      wx?: { onAppHide?: (fn: (opt: { reason?: number }) => void) => void };
    }
  ).wx;
  wxApi?.onAppHide?.((opt) => {
    const reason = opt?.reason;
    if (reason === 0 || reason === 1) stopListen();
  });
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
