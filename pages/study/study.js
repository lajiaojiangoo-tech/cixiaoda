const cloudApi = require('../../utils/cloud');
const util = require('../../utils/util');

const GROUP_SIZE = 10;

Page({
  data: {
    loading: true,
    mode: 'new',          // 'new' | 'review'
    words: [],
    currentIndex: 0,
    flipped: false,
    showCompleteModal: false,
    startTime: 0,         // 学习开始时间(ms)
    currentWord: null
  },

  onLoad(options) {
    const bookId = options.bookId || wx.getStorageSync('currentBookId') || '';
    const mode = options.mode || 'new';

    if (!bookId) {
      util.showToast('请先选择单词书');
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/books/books' });
      }, 1500);
      return;
    }

    this.bookId = bookId;
    this.setData({
      mode,
      loading: true,
      startTime: Date.now()
    });

    this.loadWords(bookId, mode);
  },

  onUnload() {
    this.destroyAudio();
  },

  // ==================== 数据加载 ====================

  /** 加载今日待学/待复习词 */
  async loadWords(bookId, mode) {
    try {
      const data = await cloudApi.getTodayStudyWords(bookId);
      const rawWords = mode === 'new' ? (data.newWords || []) : (data.reviewWords || []);
      // 取一组（最多 GROUP_SIZE 个）
      const words = rawWords.slice(0, GROUP_SIZE);

      this.setData({
        loading: false,
        words,
        currentIndex: 0,
        currentWord: words[0] || null
      });

      // 自动播放第一个词的发音
      if (words.length > 0) {
        this.playAudio(words[0]);
      }
    } catch (err) {
      console.error('[study] 加载失败:', err);
      util.showToast('加载学习内容失败');
      this.setData({ loading: false });
    }
  },

  // ==================== 卡片翻转 ====================

  /** 点击卡片翻转 */
  onFlipCard() {
    if (this.data.flipped) return;
    this.setData({ flipped: true });
  },

  // ==================== 操作按钮 ====================

  /** 点击「认识」 */
  async onKnow() {
    const { currentWord, currentIndex, words, mode } = this.data;
    if (!currentWord) return;

    try {
      const wordId = currentWord._id || currentWord.wordId;

      // 更新服务端状态：status=1(认识), 1天后复习
      await cloudApi.updateWordStatus(wordId, 1, this.bookId);

      // 记录学习时长到 study_records
      await this.recordStudyTime(currentWord, 1);

      this.advanceToNext();

    } catch (err) {
      console.error('[study] updateWordStatus 失败:', err);
      util.showToast('保存失败，请重试');
    }
  },

  /** 点击「不认识」 */
  async onNotKnow() {
    const { currentWord, currentIndex, words, mode } = this.data;
    if (!currentWord) return;

    try {
      const wordId = currentWord._id || currentWord.wordId;

      // 更新服务端状态：status=2(模糊), 4小时后复习
      await cloudApi.updateWordStatus(wordId, 2, this.bookId);

      // 自动加入生词本
      await cloudApi.addToVocabulary(wordId);

      // 记录学习时长
      await this.recordStudyTime(currentWord, 2);

      this.advanceToNext();

    } catch (err) {
      console.error('[study] onNotKnow 失败:', err);
      util.showToast('保存失败，请重试');
    }
  },

  // ==================== 学习进度管理 ====================

  /** 前进到下一个单词 */
  advanceToNext() {
    const { currentIndex, words } = this.data;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= words.length) {
      // 本组完成
      this.destroyAudio();
      this.setData({
        flipped: false,
        showCompleteModal: true
      });
      return;
    }

    const nextWord = words[nextIndex];
    this.setData({
      currentIndex: nextIndex,
      currentWord: nextWord,
      flipped: false
    });

    this.playAudio(nextWord);
  },

  /** 记录学习时长和当日学习进度 */
  async recordStudyTime(word, status) {
    try {
      await cloudApi.batchSyncProgress([{
        wordId: word._id || word.wordId,
        bookId: this.bookId,
        date: util.getTodayStr(),
        status
      }]);
    } catch (err) {
      // 静默处理，不影响学习流程
      console.warn('[study] 记录学习时长失败:', err);
    }
  },

  // ==================== 发音播放 ====================

  playAudio(word) {
    this.destroyAudio();

    if (!word || !word.word) return;

    const audioSrc = this.buildTtsUrl(word.word);
    if (!audioSrc) return;

    try {
      const innerAudioContext = wx.createInnerAudioContext();
      innerAudioContext.src = audioSrc;
      innerAudioContext.autoplay = true;
      innerAudioContext.onError(() => {
        console.warn('[study] 音频播放失败');
      });
      this.innerAudioContext = innerAudioContext;
    } catch (err) {
      console.warn('[study] 创建音频失败:', err);
    }
  },

  /** 点击喇叭图标主动播放 */
  onPlayAudio() {
    const word = this.data.currentWord;
    if (!word || !word.word) return;

    if (this.innerAudioContext) {
      this.innerAudioContext.stop();
      this.innerAudioContext.destroy();
    }

    this.playAudio(word);
  },

  /** 构造 TTS 音频地址 */
  buildTtsUrl(word) {
    if (!word) return '';
    // 使用有道词典 TTS（免费）
    return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=0`;
  },

  destroyAudio() {
    if (this.innerAudioContext) {
      this.innerAudioContext.stop();
      this.innerAudioContext.destroy();
      this.innerAudioContext = null;
    }
  },

  // ==================== 手势支持 ====================

  touchStartX: 0,
  touchStartY: 0,

  onTouchStart(e) {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  },

  onTouchEnd(e) {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = endX - this.touchStartX;
    const deltaY = endY - this.touchStartY;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    // 最小滑动距离 60px
    if (absX < 60 && absY < 60) return;

    if (absY > absX && deltaY < -60) {
      // 上滑 → 翻转卡片
      if (!this.data.flipped) {
        this.setData({ flipped: true });
      }
    }
  },

  // ==================== 页面跳转 ====================

  /** 跳转测试页 */
  goToTest() {
    const { words, mode } = this.data;
    const wordIds = words.map(w => w._id || w.wordId).join(',');

    if (!wordIds) {
      util.showToast('没有可测试的单词');
      return;
    }

    this.setData({ showCompleteModal: false });

    wx.navigateTo({
      url: `/pages/test/test?wordIds=${wordIds}&mode=${mode}&bookId=${this.bookId}`
    });
  },

  /** 返回首页 */
  goBack() {
    this.setData({ showCompleteModal: false });
    wx.switchTab({ url: '/pages/index/index' });
  }
});
