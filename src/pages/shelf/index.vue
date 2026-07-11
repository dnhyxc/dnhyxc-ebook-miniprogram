<template>
  <wd-config-provider :theme="theme" :theme-vars="themeVars" :custom-style="themeRootStyle">
    <view class="page-container with-tabbar" :style="pageShellStyle">
      <AppNavbar title="书架" />

      <ShelfCategoryRail
        v-if="showCategoryRail"
        :active-key="activeCategoryKey"
        :categories="categories"
        :uncategorized-count="uncategorizedCount"
        :public-book-total="publicBookTotal"
        :all-count="allCount"
        @select="onSelectCategory"
      />

      <scroll-view
        scroll-y
        class="page-scroll"
        refresher-enabled
        :refresher-triggered="refreshing"
        @refresherrefresh="onRefresh"
      >
        <view class="page">
          <view v-if="loading && !books.length" class="state">
            <wd-loading />
          </view>

          <view v-else-if="needLogin" class="state">
            <text class="state-text">登录后同步你的书架</text>
            <text class="state-hint">请前往「我的」完成微信登录与账号绑定</text>
            <wd-button type="primary" @click="goMine">去登录</wd-button>
          </view>

          <view v-else-if="error" class="state">
            <text class="state-text">{{ error }}</text>
            <wd-button type="primary" plain @click="loadShelf">重试</wd-button>
          </view>

          <view v-else-if="!books.length" class="state">
            <text class="state-text">{{ emptyText }}</text>
            <text v-if="activeCategoryKey.kind === 'all'" class="state-hint">
              请先在 Web 端上传 EPUB
            </text>
          </view>

          <view v-else class="grid">
            <view v-for="book in books" :key="book.id" class="grid-item" @click="openBook(book)">
              <view class="cover-wrap">
                <BookCover
                  :title="book.title"
                  :cover-url="book.coverUrl"
                  :percent="book.progress?.percent"
                />
              </view>
              <text class="book-title">{{ book.title }}</text>
              <text v-if="book.author" class="book-author">{{ book.author }}</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <AppTabbar />
    </view>
  </wd-config-provider>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { computed, ref } from "vue";
import { useTabbar } from "@/hooks/useTabbar";
import { useTheme } from "@/hooks/useTheme";
import { ensureToken } from "@/services/auth";
import { ApiError } from "@/services/http";
import { fetchCategoriesSummary, fetchShelf, fetchShelfByCategoryKey } from "@/services/ebook";
import type { EbookCategory, ShelfBook, ShelfCategoryKey } from "@/types/ebook";

const { theme, themeVars, pageShellStyle, themeRootStyle } = useTheme();
const { syncActive } = useTabbar();

const books = ref<ShelfBook[]>([]);
const categories = ref<EbookCategory[]>([]);
const uncategorizedCount = ref(0);
const totalBookCount = ref(0);
const publicBookTotal = ref(0);
const activeCategoryKey = ref<ShelfCategoryKey>({ kind: "all" });

const loading = ref(false);
const refreshing = ref(false);
const needLogin = ref(false);
const error = ref("");
const categorySummaryLoaded = ref(false);

const allCount = computed(() => totalBookCount.value + publicBookTotal.value);

const showCategoryRail = computed(() => !needLogin.value && categorySummaryLoaded.value);

const emptyText = computed(() => {
  if (activeCategoryKey.value.kind === "uncategorized") return "未分类暂无书籍";
  if (activeCategoryKey.value.kind === "public") return "暂无公开书籍";
  if (activeCategoryKey.value.kind === "category") return "该分类暂无书籍";
  return "书架空空如也";
});

async function loadCategories() {
  try {
    const [summary, pubRes] = await Promise.all([
      fetchCategoriesSummary(),
      fetchShelf({ scope: "public", pageNo: 1, pageSize: 1 }),
    ]);
    categories.value = summary.categories;
    uncategorizedCount.value = summary.uncategorizedCount;
    totalBookCount.value = summary.totalBookCount;
    publicBookTotal.value = pubRes.total;
  } catch {
    // 分类加载失败不阻塞书架
  } finally {
    categorySummaryLoaded.value = true;
  }
}

function isSameCategoryKey(a: ShelfCategoryKey, b: ShelfCategoryKey): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "category" && b.kind === "category") {
    return a.categoryId === b.categoryId;
  }
  return true;
}

async function loadBooks() {
  const res = await fetchShelfByCategoryKey(activeCategoryKey.value);
  books.value = res.books;
}

async function loadShelf() {
  loading.value = true;
  error.value = "";
  needLogin.value = false;

  try {
    const token = await ensureToken();
    if (!token) {
      needLogin.value = true;
      books.value = [];
      categories.value = [];
      categorySummaryLoaded.value = false;
      return;
    }

    await Promise.all([loadCategories(), loadBooks()]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      needLogin.value = true;
      books.value = [];
    } else {
      error.value = err instanceof Error ? err.message : "加载失败";
    }
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

async function onSelectCategory(key: ShelfCategoryKey) {
  if (isSameCategoryKey(activeCategoryKey.value, key)) return;

  activeCategoryKey.value = key;
  loading.value = true;
  error.value = "";
  try {
    await loadBooks();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "加载失败";
  } finally {
    loading.value = false;
  }
}

function goMine() {
  uni.switchTab({ url: "/pages/mine/index" });
}

async function onRefresh() {
  refreshing.value = true;
  await loadShelf();
}

function openBook(book: ShelfBook) {
  if (book.fmt === "pdf") {
    uni.showToast({ title: "PDF 请前往 Web 阅读", icon: "none" });
    return;
  }
  uni.navigateTo({ url: `/pages/reader/index?bookId=${book.id}` });
}

onShow(() => {
  syncActive();
  void loadShelf();
});
</script>

<style scoped>
.page-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.page-scroll {
  flex: 1;
  height: 0;
}

.page {
  min-height: 100%;
  padding: 16rpx 32rpx 32rpx;
  box-sizing: border-box;
}

/* ponytail: 小程序对 grid 支持不稳，用 flex 双列更可靠 */
.grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  row-gap: 32rpx;
}

.grid-item {
  width: calc((100% - 24rpx) / 2);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  min-width: 0;
}

.cover-wrap {
  width: 100%;
}

.book-title {
  font-size: 26rpx;
  line-height: 1.4;
  color: var(--wot-text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  min-height: 72rpx;
}

.book-author {
  font-size: 22rpx;
  color: var(--wot-text-auxiliary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
  padding: 120rpx 48rpx;
}

.state-text {
  font-size: 30rpx;
  color: var(--wot-text-main);
}

.state-hint {
  font-size: 26rpx;
  color: var(--wot-text-auxiliary);
  text-align: center;
}
</style>
