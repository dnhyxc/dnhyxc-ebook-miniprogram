# 听书页：播放状态机深度修复（实现思路）

> **状态**：已采纳  
> **关联文件**：`src/services/tts-player.ts`、`src/hooks/useChapterListen.ts`、`src/pages/listen/index.vue`  
> **前置文档**：[reader-listen-play-waiting-loading-impl.md](./reader-listen-play-waiting-loading-impl.md)（等待出声 loading 效果首轮实现）  
> **来源提交**：`1878e4d`、`2e893c4`、`3a882dc`（播放进度切换、状态 bug 修复）

---

## 1. 背景与目标

### 1.1 遗留问题

在首轮「等待出声 loading」实现之后，播放按钮状态仍存在以下严重问题：

| #   | 现象                                             | 根因                                                                                                        |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1   | **进度条拖拽后按钮一直 loading，但音频仍在播放** | `playCurrent` 无条件调 `onWaiting`，即使目标音频已有缓存，导致 UI 卡在 loading；而音频实际已在播放          |
| 2   | **进度条滑动无法快进到目标位置**                 | `seekTo`/`seekBy` 使用串行队列（`enqueueSeek`），连拖时中间请求排队但不生效，且同段 seek 判断用估算时长不准 |
| 3   | **暂停后状态不同步**                             | `pause()`/`resume()` 未通过回调驱动状态，而是手动设置 `status.value`，与 BGM 事件时序打架                   |
| 4   | **BGM 事件在缓冲期间污染 UI**                    | `onEnded`/`onPause`/`onTimeUpdate` 在缓冲或挂 src 过程中仍触发 `markPlaying` 或 `onPause`，导致状态错乱     |
| 5   | **音频文件无限堆积**                             | `writeTempMp3` 用时间戳+随机名，重复合成不覆盖，USER_DATA_PATH 很快爆满                                     |

### 1.2 成功标准

- 进度条拖拽：按钮在有缓存时不进 loading，无缓存时短暂 loading 后立即恢复
- 同段 seek：直接 `bgm.seek()` 不重合成、不 loading
- 跨段 seek：loading 仅持续到新 src 挂上，出声后立刻 playing
- 暂停/恢复：状态始终由回调驱动，不手动猜测
- 磁盘管理：缓存文件数量可控，重复键覆盖写

---

## 2. 改动范围

- `src/services/tts-player.ts` — 状态机核心重构（新增 50+ 行，删除 28 行）
- `src/hooks/useChapterListen.ts` — pause/resume/seek 状态同步修正
- `src/pages/listen/index.vue` — 模板微调

---

## 3. 核心思路

### 3.1 播放状态机三要素

引入三个关键状态标记来精确控制「什么时候该显示 playing」：

| 标记                      | 含义                    | 为 true 时                                                      |
| ------------------------- | ----------------------- | --------------------------------------------------------------- |
| `intent: "run" \| "hold"` | 播放意图                | `"run"` 表示要出声（合成中/播放中），`"hold"` 表示用户/系统暂停 |
| `buffering`               | 正在等 timed/写盘       | BGM 事件不得切 playing，UI 保持 loading                         |
| `expectingPlayback`       | 已挂上新 src、等 onPlay | BGM 事件可以认作出声，允许切 playing                            |
| `outputActive`            | 当前是否有可听输出      | `isAudible()` 供外部查询：有输出时禁止把按钮打成 loading        |

### 3.2 状态转移图

```
                    ┌─────────────────────┐
                    │     beginBuffering  │
                    │ intent="run"        │
                    │ buffering=true      │
                    │ onWaiting()→loading │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │   prepareFile 完成   │
                    │ expectingPlayback=T │
                    │ buffering=False     │
                    │ 挂 bgm.src          │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
     BGM.onPlay      BGM.onTimeUpdate   watchdog 800ms
     (if expecting)   (if expecting)     (兜底 markPlaying)
              │               │               │
              └───────┬───────┘               │
                      │                       │
              ┌───────▼────────┐               │
              │  markPlaying   │◄──────────────┘
              │ playedGen=gen  │
              │ outputActive=T │
              │ onPlay→playing │
              └───────────────┘
```

### 3.3 关键设计决策

1. **`markPlaying` 三重守卫**：`gen === playGen` + `intent === "run"` + `!buffering`，确保只有真正的「出声意图+非缓冲」才能切 playing
2. **`beginBuffering` 统一入口**：所有需要等待合成的路径都走此方法，避免各路径自行猜状态
3. **缓存命中短路**：`playCurrent` 先查 `fileCache`/`speechCache`，命中时只走 `onWaiting`（暂停后 seek 场景）或直接续播（已在播放场景）
4. **seek 连拖合并**：用 `pendingSeekMs` + `drainSeeks` 替代串行队列，连拖时只合成最终目标
5. **同段 seek 用 `bgm.duration`**：不用估算时长（`durationAt`），避免估算偏大导致误判同段

---

## 4. 关键代码对比与注释

### 4.1 播放器状态标记：`markPlaying` + 新增字段

**对比范围**：`markPlaying` 方法全函数 + 类字段声明区新增的 4 个字段。

**改动前** · `src/services/tts-player.ts`（基线 `fe1692c`，约 L344–L365）

```typescript
// 标记为正在播放（真正出声后调用）
private markPlaying(gen: number): void {
    // 代次不匹配则忽略（旧音频的延迟事件）
    if (gen !== this.playGen) return;
    // 已标记过则跳过
    if (this.playedGen === gen) return;
    // 记录已处理的代次
    this.playedGen = gen;
    // 清除等待播放标记
    this.expectingPlayback = false;
    // 清除看门狗定时器
    this.clearPlayWatchdog();
    // 启动高亮时钟（重置起点）
    this.startHighlightTick(true);
    // 通知 UI：真正开始播放
    this.onPlay?.();
    // 首句真正出声后再预取，避免起播/切章/改倍速连打两次 timed
    this.schedulePrefetch(this.sentenceIndex);
}
```

**改动后** · `src/services/tts-player.ts`（当前，约 L375–L398）

```typescript
// 标记为正在播放（真正出声后调用）
private markPlaying(gen: number): void {
    // 代次不匹配则忽略（旧音频的延迟事件）
    if (gen !== this.playGen) return;
    // 新增守卫 1：播放意图必须为 "run"（排除用户暂停状态下的残留事件）
    if (this.intent !== "run") return;
    // 新增守卫 2：正在缓冲/写盘时绝不能切 playing（微信 stop 后仍可能冒出 onPlay/timeUpdate）
    if (this.buffering) return;
    // 已标记过则跳过
    if (this.playedGen === gen) return;
    // 记录已处理的代次
    this.playedGen = gen;
    // 清除等待播放标记
    this.expectingPlayback = false;
    // 标记当前有可听输出
    this.outputActive = true;
    // 清除看门狗定时器
    this.clearPlayWatchdog();
    // 启动高亮时钟（重置起点）
    this.startHighlightTick(true);
    // 通知 UI：真正开始播放
    this.onPlay?.();
    // 首句真正出声后再预取，避免起播/切章/改倍速连打两次 timed
    this.schedulePrefetch(this.sentenceIndex);
}
```

**变更摘要**：新增 `intent` 和 `buffering` 双重守卫，防止缓冲期间或暂停状态下 BGM 残留事件误切 playing；新增 `outputActive` 标记供 `isAudible()` 查询。

---

### 4.2 新增 `beginBuffering` 方法

**对比范围**：新增的 `beginBuffering` 方法（改动前不存在）。

**改动前** · `src/services/tts-player.ts`（基线 `fe1692c`）

> 不存在 `beginBuffering` 方法。各调用路径自行处理缓冲状态，导致不一致。

**改动后** · `src/services/tts-player.ts`（当前，约 L403–420）

```typescript
/** 需要等合成：loading + 停掉旧声。用 stop 而非 pause，避免微信异步 onPause 污染 UI */
private beginBuffering(): void {
    // 设置播放意图为 "run"（告诉 BGM 事件处理逻辑：这是用户想听的）
    this.intent = "run";
    // 标记正在缓冲（合成/写盘中）
    this.buffering = true;
    // 清除等待播放标记（缓冲完成后会重新设为 true）
    this.expectingPlayback = false;
    // 标记当前无输出（缓冲期间无音频在播）
    this.outputActive = false;
    // 清除看门狗（缓冲期间不需要兜底）
    this.clearPlayWatchdog();
    // 暂停高亮时钟（缓冲期间不推进高亮）
    this.pauseHighlightTick();
    // 通知 UI：进入 loading 状态（按钮转圈+禁用）
    this.onWaiting?.();
    // 防止旧音频 onEnded 误切下一句（代次不匹配会被忽略）
    this.srcGen = -1;
    // 停掉旧音频（用 stop 而非 pause，避免微信异步 onPause 回调污染 UI）
    if (this.bgm) {
        try {
            this.bgm.stop();
        } catch {
            // 部分机型 stop 可能抛错，忽略即可
        }
    }
}
```

**变更摘要**：统一所有进入缓冲状态的逻辑。关键决策是用 `stop()` 而非 `pause()` 停旧声，因为微信 `onPause` 回调是异步的，可能在缓冲完成后才到达，导致误报暂停。

---

### 4.3 BGM 事件防护

**对比范围**：`ensureBgm` 方法内的 `onEnded`/`onPlay`/`onPause`/`onStop`/`onTimeUpdate` 五个事件回调。

**改动前** · `src/services/tts-player.ts`（基线 `fe1692c`，约 L412–L450）

```typescript
// BGM 播放结束回调
bgm.onEnded(() => {
  // 停止高亮时钟
  this.stopHighlightTick();
  // 忽略解锁静音 / stop 后旧音频尾巴，避免切章时 playNext 跳过句首
  if (this.srcGen !== this.playGen || !this.lastTempPath) return;
  void this.playNext();
});

// BGM 开始播放回调
bgm.onPlay(() => {
  // 等待播放标记为 true 时，标记为正在播放
  if (this.expectingPlayback) this.markPlaying(this.playGen);
  // 否则如果有当前句且高亮时钟未启动，启动高亮
  else if (this.sentences[this.sentenceIndex] && this.highlightTimer == null) {
    this.startHighlightTick(false);
  }
});

// BGM 暂停回调
bgm.onPause(() => {
  // 清除等待播放标记
  this.expectingPlayback = false;
  // 清除看门狗
  this.clearPlayWatchdog();
  // 暂停高亮时钟
  this.pauseHighlightTick();
  // 通知 UI：暂停
  this.onPause?.();
});

// BGM 停止回调
bgm.onStop(() => {
  // 清除等待播放标记
  this.expectingPlayback = false;
  // 清除看门狗
  this.clearPlayWatchdog();
  // 停止高亮时钟
  this.stopHighlightTick();
});

// BGM 时间更新回调
bgm.onTimeUpdate(() => {
  // 仅驱动高亮（不用作切 playing 的依据）
  this.tickHighlight();
});
```

**改动后** · `src/services/tts-player.ts`（当前，约 L426–L480）

```typescript
// BGM 播放结束回调
bgm.onEnded(() => {
  // 停止高亮时钟
  this.stopHighlightTick();
  // 标记当前无输出（音频已结束）
  this.outputActive = false;
  // 新增：如果意图不是 "run"，不自动 playNext（用户暂停状态下不跳句）
  if (this.intent !== "run") return;
  // 新增：缓冲/挂 src 过程中的 onEnded 一律忽略（旧音频的延迟事件）
  if (this.buffering || this.expectingPlayback) return;
  // 忽略解锁静音 / stop 后旧音频尾巴，避免切章时 playNext 跳过句首
  if (this.srcGen !== this.playGen || !this.lastTempPath) return;
  void this.playNext();
});

// BGM 开始播放回调
bgm.onPlay(() => {
  // 新增：意图不是 "run" 时忽略（用户暂停状态下的残留 onPlay）
  if (this.intent !== "run") return;
  // 新增：只有已挂上目标 src 后才认作出声；buffering 期间的 play 事件一律忽略
  if (this.expectingPlayback) {
    // 等待播放标记为 true 时，标记为正在播放
    this.markPlaying(this.playGen);
  } else if (
    // 新增：不在缓冲状态
    !this.buffering &&
    this.sentences[this.sentenceIndex] &&
    this.highlightTimer == null
  ) {
    // 否则如果有当前句且高亮时钟未启动，启动高亮
    this.startHighlightTick(false);
  }
});

// BGM 暂停回调
bgm.onPause(() => {
  // 新增：缓冲 / 挂 src 过程中的 pause/stop 副作用：一律忽略
  if (this.buffering || this.expectingPlayback) return;
  // 标记当前无输出
  this.outputActive = false;
  // 暂停高亮时钟
  this.pauseHighlightTick();
  // 清除看门狗
  this.clearPlayWatchdog();
  // 新增：用户 pause() 已发过 onPause；此处只处理系统播控条打断
  if (this.intent === "hold") return;
  // 意图改为暂停
  this.intent = "hold";
  // 通知 UI：暂停
  this.onPause?.();
});

// BGM 停止回调
bgm.onStop(() => {
  // 新增：stop 用于缓冲清旧声，不驱动 UI
  if (this.buffering || this.expectingPlayback) return;
  // 清除等待播放标记
  this.expectingPlayback = false;
  // 标记当前无输出
  this.outputActive = false;
  // 清除看门狗
  this.clearPlayWatchdog();
  // 停止高亮时钟
  this.stopHighlightTick();
});

// BGM 时间更新回调
bgm.onTimeUpdate(() => {
  // 新增：仅「已换源、等出声」时用进度兜底；buffering 时旧进度绝不能变成 playing
  if (this.expectingPlayback) {
    this.markPlaying(this.playGen);
  }
  // 驱动高亮
  this.tickHighlight();
});
```

**变更摘要**：五个事件回调全部增加 `buffering`/`expectingPlayback`/`intent` 守卫。核心变化：

- `onEnded`：缓冲期间不自动 playNext
- `onPlay`：缓冲期间的 play 事件被忽略；只有 `expectingPlayback` 时才 markPlaying
- `onPause`：缓冲/挂 src 期间的 pause 被忽略；只处理系统播控条打断
- `onStop`：缓冲期间不驱动 UI
- `onTimeUpdate`：缓冲期间不触发 markPlaying（这是之前「按钮一直 loading 但音频在播」的根因之一）

---

### 4.4 `playCurrent` 重构：缓存命中短路

**对比范围**：`playCurrent` 方法内缓存检查与 onWaiting 触发逻辑。

**改动前** · `src/services/tts-player.ts`（基线 `fe1692c`，约 L1080–L1100）

```typescript
private async playCurrent(): Promise<void> {
    // 推进播放代次
    const gen = ++this.playGen;
    // 停高亮时钟
    this.stopHighlightTick();
    // 取当前单元
    const sentence = this.sentences[this.sentenceIndex];
    if (!sentence) {
        this.onChapterEnd?.();
        return;
    }
    // 无条件通知进入 loading（即使目标音频已有缓存！）
    this.onWaiting?.();
    // ... 后续解析 targetText、prepareFile、挂 src 等
}
```

**改动后** · `src/services/tts-player.ts`（当前，约 L1268–L1360）

```typescript
private async playCurrent(): Promise<void> {
    // 新增：检查当前是否仍有可听输出（用于区分「暂停后 seek」vs「已在播放中 seek」）
    const stillAudible = this.isAudible();
    // 推进播放代次
    const gen = ++this.playGen;
    // 新增：设置播放意图为 "run"
    this.intent = "run";
    // 停高亮时钟
    this.stopHighlightTick();
    // 取当前单元
    const sentence = this.sentences[this.sentenceIndex];
    if (!sentence) {
        this.onChapterEnd?.();
        return;
    }

    // ... 解析 targetText、计算缓存命中状态 ...

    // 检查目标音频是否已有本地缓存（fileCache 或 speechCache）
    const targetKey = this.cacheKey(targetText);
    // 仅 file/speech 算可播；jobs 里进行中仍要 loading
    const hasLocal = this.fileCache.has(targetKey) || this.speechCache.has(targetKey);

    if (!hasLocal) {
        // 无缓存：进入缓冲状态（loading + 停旧声）
        this.beginBuffering();
    } else {
        // 有缓存：不需要完整缓冲
        this.buffering = false;
        if (!stillAudible) {
            // 有缓存但当前没在出声（暂停后 seek 等场景）：短暂 loading，出声后再 playing
            this.expectingPlayback = false;
            this.onWaiting?.();
        }
        // 已在播放中 seek：不触发 loading，直接续播
    }

    // ... 设置 clipKind/clipPartIndex/boundaryUnit 等 ...

    // 新增：缓存命中时不清除 expectingPlayback 和看门狗（保持已有的播放状态）
    const bgm = this.ensureBgm();
    if (!this.buffering) {
        // 仅在非缓冲状态下清除（避免 beginBuffering 设好的状态被覆盖）
        this.expectingPlayback = false;
        this.clearPlayWatchdog();
    }

    // ... prepareFile、挂 src 等后续逻辑 ...
}
```

**变更摘要**：核心修复——不再无条件调用 `onWaiting`。改为先检查缓存命中状态：

- **无缓存** → `beginBuffering()` 进入 loading（正确）
- **有缓存 + 已在播放** → 不触发 loading（修复「按钮一直 loading 但音频在播」问题）
- **有缓存 + 暂停后 seek** → 短暂 `onWaiting`（给用户视觉反馈）

---

### 4.5 `seekTo`/`seekBy` 重写：连拖合并

**对比范围**：`seekTo`、`seekBy`、`drainSeeks`、`seekToUnlocked` 方法全函数。

**改动前** · `src/services/tts-player.ts`（基线 `fe1692c`，约 L575–L630）

```typescript
/** ±毫秒快进/快退（跨句）；连点排队，用最新进度累加 */
seekBy(deltaMs: number): void {
    // 将操作推入串行队列
    void this.enqueueSeek(async () => {
        // 获取当前进度
        const { positionMs } = this.getProgress();
        // 在当前进度基础上加偏移量
        await this.seekToUnlocked(positionMs + deltaMs);
    });
}

/** 跳到章内绝对时间 */
seekTo(positionMs: number): Promise<void> {
    // 将操作推入串行队列
    return this.enqueueSeek(() => this.seekToUnlocked(positionMs));
}

/** 串行化 seek 操作，避免连点打断合成后误报失败 */
private enqueueSeek(task: () => Promise<void>): Promise<void> {
    // 基于前一个 seek 的 Promise 串联执行
    const run = this.seekQueue.then(task, task);
    // 更新队列引用
    this.seekQueue = run.then(
        () => undefined,
        () => undefined,
    );
    return run;
}

private async seekToUnlocked(positionMs: number): Promise<void> {
    if (!this.sentences.length) return;
    // ... 计算目标句索引和偏移 ...

    // 同长片段内优先 bgm.seek，避免重合成
    if (sameClip && this.clipKind === "unit" && this.bgm && this.lastTempPath) {
        const clipDur = Math.max(this.durationAt(index), 1);
        // 用估算时长判断是否在同段内
        if (offsetMs < clipDur - 80) {
            try {
                this.bgm.seek(offsetMs / 1000);
                // ... 设置时钟 ...
                return;
            } catch {
                // fall through：部分机型 seek 失败则重开播
            }
        }
    }
    // 跨段：重合成
    this.sentenceIndex = index;
    this.pendingStartMs = offsetMs;
    await this.playCurrent();
}
```

**改动后** · `src/services/tts-player.ts`（当前，约 L584–L660）

```typescript
/** ±毫秒快进/快退（跨句）；连点合并到最新目标 */
seekBy(deltaMs: number): Promise<void> {
    // 基于最新目标计算（而非当前进度累加，避免连点时中间请求排队）
    const base = this.pendingSeekMs ?? this.getProgress().positionMs;
    return this.seekTo(base + deltaMs);
}

/** 跳到章内绝对时间；loading 中再次拖动会立刻取消上一次 timed，只合成最新点 */
seekTo(positionMs: number): Promise<void> {
    // 记录最新 seek 目标（连拖时覆盖旧值）
    this.pendingSeekMs = positionMs;
    // 立刻作废当前 playCurrent / timed，不等上一段跑完
    this.playGen += 1;
    this.clearPrefetchTimer();
    this.clearPlayWatchdog();
    this.expectingPlayback = false;
    // 取消所有进行中的合成请求
    for (const job of this.jobs.values()) {
        job.req.abort();
    }
    this.jobs.clear();

    // 如果没有正在进行的 drain，则启动一个
    if (!this.seekDrain) {
        this.seekDrain = this.drainSeeks().finally(() => {
            this.seekDrain = null;
        });
    }
    return this.seekDrain;
}

/** 消耗 pendingSeekMs：不断取出最新目标执行，直到没有新的 seek 请求 */
private async drainSeeks(): Promise<void> {
    while (this.pendingSeekMs != null) {
        const ms = this.pendingSeekMs;
        this.pendingSeekMs = null;
        await this.seekToUnlocked(ms);
    }
}

private async seekToUnlocked(positionMs: number): Promise<void> {
    if (!this.sentences.length) return;
    // 新增：设置播放意图为 "run"
    this.intent = "run";
    // ... 计算目标句索引和偏移 ...

    // 同段且落在真实音频长度内：直接 seek，不停播、不 loading
    // ponytail: 只用 bgm.duration，不用估算 clipDur（估算偏大时会误判同段）
    if (sameClip && this.clipKind === "unit" && this.bgm && this.lastTempPath) {
        // 用 BGM 实际时长（而非估算值）判断
        const mediaMs = Math.round((Number(this.bgm.duration) || 0) * 1000);
        if (mediaMs > 0 && offsetMs < mediaMs - 50) {
            try {
                this.bgm.seek(offsetMs / 1000);
                this.clipOriginMs = offsetMs;
                this.highlightStartedAt = Date.now() - offsetMs;
                this.highlightPausedMs = 0;
                this.highlightPauseAt = 0;
                // 新增：标记非缓冲状态
                this.buffering = false;
                this.emitHighlight(offsetMs);
                // 新增：如果当前没有可听输出，恢复播放
                if (!this.isAudible()) {
                    this.outputActive = true;
                    try {
                        this.bgm.play();
                    } catch {
                        // 部分机型 play 可能抛错
                    }
                }
                // 直接触发 onPlay（同段 seek 不需要等 onPlay 事件）
                this.onPlay?.();
                return;
            } catch {
                // fall through
            }
        }
    }
    // 跨段：重合成（走 playCurrent → 缓冲状态）
    this.sentenceIndex = index;
    this.pendingStartMs = offsetMs;
    this.pendingPartIndex = null;
    await this.playCurrent();
}
```

**变更摘要**：

1. **seek 连拖合并**：用 `pendingSeekMs` 覆盖式记录最新目标，`drainSeeks` 循环消费，避免中间请求排队
2. **立即取消旧合成**：`seekTo` 开头就 `playGen++` + 取消所有进行中的 timed，确保只有最新目标会被合成
3. **同段 seek 改用 `bgm.duration`**：不用估算值 `durationAt`，避免估算偏大导致误判跨段
4. **同段 seek 直接触发 `onPlay`**：不走 `markPlaying`（因为 gen 没变），直接通知 UI 状态
5. **同段 seek 恢复暂停状态的播放**：如果 `!isAudible()`（暂停后 seek），自动 `bgm.play()`

---

### 4.6 `pause`/`resume`/`stop` 重构

**对比范围**：`pause`、`resume`、`stop` 三个方法全函数。

**改动前** · `src/services/tts-player.ts`（基线 `fe1692c`，约 L655–L700）

```typescript
// 暂停播放
pause(): void {
    // 暂停高亮时钟
    this.pauseHighlightTick();
    // 调用 BGM 暂停
    try {
        this.ensureBgm().pause();
    } catch {
        // ignore
    }
}

// 恢复播放
resume(): void {
    // 标记期望播放
    try {
        this.expectingPlayback = true;
        this.ensureBgm().play();
        this.startHighlightTick(false);
    } catch {
        // ignore
    }
}

// 停止播放（切章/退出听书）
stop(): void {
    // 推进代次（使旧事件失效）
    this.playGen += 1;
    this.srcGen = -1;
    // 取消所有合成
    this.abortAllSpeech();
    // 清除状态
    this.expectingPlayback = false;
    this.clearPlayWatchdog();
    this.clearPrefetchTimer();
    this.stopHighlightTick();
    this.activeBoundaries = [];
    // ... 重置所有字段 ...
}
```

**改动后** · `src/services/tts-player.ts`（当前，约 L747–L810）

```typescript
// 暂停播放
pause(): void {
    // 新增：设置播放意图为 "hold"（告诉所有事件处理：这是用户主动暂停）
    this.intent = "hold";
    // 新增：清除缓冲状态
    this.buffering = false;
    // 新增：清除等待播放标记
    this.expectingPlayback = false;
    // 新增：标记无输出
    this.outputActive = false;
    // 新增：清除看门狗
    this.clearPlayWatchdog();
    // 暂停高亮时钟
    this.pauseHighlightTick();
    // 新增：主动通知 UI 暂停（不等 BGM onPause 事件）
    this.onPause?.();
    // 调用 BGM 暂停
    try {
        this.ensureBgm().pause();
    } catch {
        // ignore
    }
}

// 恢复播放
resume(): void {
    // 新增：设置播放意图为 "run"
    this.intent = "run";
    // 新增：清除缓冲状态
    this.buffering = false;
    // 新增：标记期望播放（等 BGM onPlay）
    this.expectingPlayback = true;
    // 新增：标记有输出
    this.outputActive = true;
    // 新增：主动通知 UI 正在播放（不等 BGM onPlay 事件）
    this.onPlay?.();
    try {
        this.ensureBgm().play();
        this.startHighlightTick(false);
    } catch {
        // ignore
    }
}

// 停止播放（切章/退出听书）
stop(): void {
    // 推进代次（使旧事件失效）
    this.playGen += 1;
    this.srcGen = -1;
    // 取消所有合成
    this.abortAllSpeech();
    // 新增：设置播放意图为 "hold"
    this.intent = "hold";
    // 新增：清除缓冲状态
    this.buffering = false;
    this.expectingPlayback = false;
    // 新增：标记无输出
    this.outputActive = false;
    // ... 其余重置逻辑不变 ...
}
```

**变更摘要**：三个方法现在都主动管理 `intent`/`buffering`/`outputActive` 状态，并**主动通知 UI**（不等 BGM 事件回调）。这解决了 BGM 异步事件延迟导致的状态不一致问题。

---

### 4.7 `useChapterListen`：状态同步修正

**对比范围**：`pauseListen`、`resumeListen`、`onPause`/`onPlay` 回调。

**改动前** · `src/hooks/useChapterListen.ts`（基线 `fe1692c`，约 L293–L310）

```typescript
// onPause 回调（播放器触发）
onPause: () => {
    if (gen !== sessionGen) return;
    // 旧版：idle 状态也强制切 paused
    if (status.value === "playing" || status.value === "loading") {
        status.value = "paused";
    }
    syncListenProgress();
},

// 暂停
export function pauseListen(): void {
    // 旧版：只允许 playing 状态暂停
    if (status.value !== "playing") return;
    ttsPlayer.pause();
    // 旧版：手动设置状态（与 BGM 事件竞争）
    status.value = "paused";
}

// 恢复
export function resumeListen(): void {
    if (status.value !== "paused") return;
    ttsPlayer.resume();
    // 旧版：手动设置状态（与 BGM 事件竞争）
    status.value = "playing";
}
```

**改动后** · `src/hooks/useChapterListen.ts`（当前，约 L207–L310）

```typescript
// onPause 回调（播放器触发）
onPause: () => {
    if (gen !== sessionGen) return;
    // 新版：idle 状态不响应 pause 事件
    if (status.value === "idle") return;
    status.value = "paused";
    syncListenProgress();
},

// 暂停
export function pauseListen(): void {
    // 新版：playing 和 loading 都允许暂停（loading 中暂停可取消等待）
    if (status.value !== "playing" && status.value !== "loading") return;
    ttsPlayer.pause();
    // 新版：不再手动设置状态，由 onPause 回调驱动
}

// 恢复
export function resumeListen(): void {
    if (status.value !== "paused") return;
    ttsPlayer.resume();
    // 新版：不再手动设置状态，由 onPlay 回调驱动
}
```

**变更摘要**：

1. `pauseListen` 支持 loading 状态暂停（用户等待合成时可取消）
2. `pauseListen`/`resumeListen` 不再手动设置 `status.value`，完全由播放器回调驱动
3. `onPause` 回调增加 `idle` 守卫

---

### 4.8 `isAudible` + 存储管理优化

**对比范围**：`isAudible` 方法（新增）、`writeTempMp3` 重写、`sweepOrphanTtsFiles`/`reclaimTtsDisk`/`evictFileCacheExcept`（新增）。

#### `isAudible` 方法

**改动后** · `src/services/tts-player.ts`（当前，约 L579–L581）

```typescript
/** 当前是否仍有可听输出（用于：预取中勿把播放钮打成 loading） */
isAudible(): boolean {
    // 三个条件全满足才算有输出：
    // 1. outputActive 标记为 true（markPlaying 后设为 true）
    // 2. lastTempPath 不为空（有音频文件）
    // 3. highlightPauseAt <= 0（高亮时钟未暂停，说明音频在播放中）
    return this.outputActive && !!this.lastTempPath && this.highlightPauseAt <= 0;
}
```

#### `writeTempMp3` 重写

**改动前** · `src/services/tts-player.ts`（基线 `fe1692c`，约 L1045–L1050）

```typescript
// 写临时 mp3 文件（旧版：随机文件名，重复合成会堆积）
private writeTempMp3(buf: ArrayBuffer): string {
    const base = userDataPath();
    if (!base) throw new Error("无可用本地路径");
    // 用时间戳+随机名，同一文本重复合成会产生多个文件
    const filePath = `${base}/tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    uni.getFileSystemManager().writeFileSync(filePath, buf);
    return filePath;
}
```

**改动后** · `src/services/tts-player.ts`（当前，约 L1229–L1251）

```typescript
// 写临时 mp3 文件（新版：稳定哈希文件名，重复键覆盖写）
private writeTempMp3(buf: ArrayBuffer, key: string): string {
    const base = userDataPath();
    if (!base) throw new Error("无可用本地路径");
    // 用 key 的哈希生成稳定文件名（同一文本+音色+倍速 → 同一文件）
    const filePath = `${base}/${ttsFileNameForKey(key)}`;
    const fs = uni.getFileSystemManager();
    // 写入函数（支持重试）
    const write = () => fs.writeFileSync(filePath, buf);
    try {
        // 先淘汰旧文件，腾出空间
        this.evictFileCacheExcept(key);
        write();
    } catch (err) {
        // 如果是存储满错误，清理磁盘后重试
        if (!isStorageFullError(err)) throw err;
        this.reclaimTtsDisk();
        try {
            write();
        } catch (retryErr) {
            if (isStorageFullError(retryErr)) {
                throw new Error("本地缓存已满，请清理微信小程序缓存后重试");
            }
            throw retryErr;
        }
    }
    return filePath;
}
```

**变更摘要**：

1. 文件名改为稳定哈希（`ttsFileNameForKey`），相同合成键覆盖写，不堆积
2. 新增磁盘管理：`evictFileCacheExcept`（淘汰旧文件，保留当前 key）、`reclaimTtsDisk`（紧急清理）、`sweepOrphanTtsFiles`（扫描孤儿文件）
3. 错误提示：存储满时给出用户可操作的提示

---

## 5. 兼容性与影响

### 5.1 行为变化

| #   | 场景                 | 改前行为                         | 改后行为                            |
| --- | -------------------- | -------------------------------- | ----------------------------------- |
| 1   | 进度条拖到已缓存位置 | 按钮 loading + 音频重新合成      | 不 loading，直接 `bgm.seek()`，秒切 |
| 2   | 进度条拖到未缓存位置 | 按钮 loading，合成完成后 playing | 同，但 `stillAudible` 检查更精确    |
| 3   | 同段内快进/快退      | 估算时长判断，偶尔误判跨段       | 用 `bgm.duration` 精确判断          |
| 4   | loading 中点击暂停   | 无反应（仅 playing 可暂停）      | 可暂停，取消等待                    |
| 5   | 暂停后拖拽进度条     | 按钮 loading                     | 短暂 loading → 自动恢复播放         |
| 6   | 连续拖拽进度条       | 请求排队，最终可能跳到旧位置     | 连拖合并，只落地最终位置            |

### 5.2 风险与回归

| #   | 测试路径          | 风险等级 | 说明                                                                                       |
| --- | ----------------- | -------- | ------------------------------------------------------------------------------------------ |
| 1   | 有缓存音频的 seek | 低       | `bgm.duration` 可能在部分机型返回 0，会 fallback 到重合成                                  |
| 2   | loading 中暂停    | 中       | 新增的 `pauseListen` 支持 loading 状态，需验证 `ttsPlayer.pause()` 在 buffering 期间的行为 |
| 3   | 系统播控条打断    | 中       | `onPause` 事件现在区分 `intent==="hold"` vs 系统打断，需验证微信锁屏场景                   |
| 4   | 连拖高频次        | 低       | `drainSeeks` 循环消费，极端情况下可能造成多次合成                                          |
| 5   | 存储满错误处理    | 低       | 新增的磁盘管理逻辑需要在存储满时验证用户提示                                               |

### 5.3 兼容性说明

- **迷你条**：共享 `status` 单例，所有状态修复自动适用于迷你条
- **阅读页听书入口**：`onListenTap` → `startListen` → `loadAndPlayChapter` 路径不变
- **后台播放**：`intent`/`buffering` 状态机兼容 `BackgroundAudioManager` 的系统播控条

---

## 6. 验证清单

- [ ] 起播：有缓存时不进 loading，无缓存时短暂 loading
- [ ] 进度条拖拽（有缓存段）：秒切、无 loading、按钮保持 playing
- [ ] 进度条拖拽（跨段）：loading → playing 正常切换
- [ ] 进度条连续拖拽：最终落到最后一次位置
- [ ] 同段快进/快退（±15s）：不 loading、音频无明显断点
- [ ] 暂停 → 拖拽 → 恢复：状态正确、音频连续
- [ ] loading 中点击暂停：可取消等待
- [ ] 锁屏/系统播控条暂停 → 恢复：UI 与音频同步
- [ ] 切句（上一句/下一句）：loading 状态正确
- [ ] 倍速变更：loading → playing 正常
- [ ] 合成失败：按钮回到 paused，可重试
- [ ] 存储满：提示「本地缓存已满，请清理微信小程序缓存后重试」

---

## 7. 相关源码路径

| 说明                                                       | 路径                            |
| ---------------------------------------------------------- | ------------------------------- |
| 状态机核心：`beginBuffering`/`markPlaying`/`playCurrent`   | `src/services/tts-player.ts`    |
| seek 逻辑：`seekTo`/`seekBy`/`drainSeeks`/`seekToUnlocked` | `src/services/tts-player.ts`    |
| BGM 事件处理：`ensureBgm` 内的五个回调                     | `src/services/tts-player.ts`    |
| 会话层：`pauseListen`/`resumeListen`/`onPause`/`onPlay`    | `src/hooks/useChapterListen.ts` |
| 听书页播放按钮模板                                         | `src/pages/listen/index.vue`    |

---

（若与仓库最新源码不一致，以源码为准）
