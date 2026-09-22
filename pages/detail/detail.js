const cloudApi = require('../../utils/cloud');
const util = require('../../utils/util');

Page({
  data: {
    loading: true,
    word: {},
    currentTab: 0,
    meanings: [],
    examples: [],
    synonyms: [],
    hasExamples: false,
    hasSynonyms: false,
    inVocabulary: false,
    isMastered: false
  },

  onLoad(options) {
    const wordId = options.wordId || '';
    if (!wordId) {
      util.showToast('缺少单词ID');
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    this.wordId = wordId;
    this.bookId = options.bookId || wx.getStorageSync('currentBookId') || '';
    this.loadWordDetail(wordId);
  },

  onUnload() {
    this.destroyAudio();
  },

  // ==================== 数据加载 ====================

  async loadWordDetail(wordId) {
    try {
      const words = await cloudApi.getWordsByIds([wordId]);
      const word = (words && words[0]) || {};

      // 解析释义（支持结构化 meanings 和纯文本 meaning 两种格式）
      const meanings = Array.isArray(word.meanings) ? word.meanings : [];
      if (meanings.length === 0 && word.meaning) {
        // 尝试从 meaning 字符串解析 "n. 苹果" 格式
        const parts = (word.meaning || '').split(/[;；]/).filter(Boolean);
        parts.forEach(p => {
          const match = p.trim().match(/^([a-zA-Z]+\.?|v\.|adj\.|adv\.|pron\.|prep\.|conj\.|int\.|art\.)?\s*(.+)/);
          if (match) {
            meanings.push({ pos: match[1] || '', def: match[2] || match[0] });
          } else {
            meanings.push({ pos: '', def: p.trim() });
          }
        });
      }

      // 处理例句：兼容单字段 example/exampleTranslation 和数组 examples 格式
      let examples = Array.isArray(word.examples) ? word.examples : [];
      if (examples.length === 0 && word.example) {
        examples = [{ en: word.example, zh: word.exampleTranslation || '' }];
      }
      const synonyms = Array.isArray(word.synonyms) ? word.synonyms : [];

      this.setData({
        loading: false,
        word,
        meanings,
        examples,
        synonyms,
        hasExamples: examples.length > 0,
        hasSynonyms: synonyms.length > 0
      });

      // 检查生词本状态和掌握状态
      await this.checkWordStatus(wordId);

    } catch (err) {
      console.error('[detail] 加载单词失败:', err);
      util.showToast('加载单词失败');
      this.setData({ loading: false });
    }
  },

  async checkWordStatus(wordId) {
    try {
      const db = wx.cloud.database();

      // 检查是否在生词本（user_vocabulary 有 _openid，用户可读自己的记录）
      const vocRes = await db.collection('user_vocabulary')
        .where({ wordId })
        .count();

      // 检查学习进度（user_progress 有 _openid，用户可读自己的记录）
      const progQuery = { wordId, status: 3 };
      if (this.bookId) progQuery.bookId = this.bookId;
      const progRes = await db.collection('user_progress')
        .where(progQuery)
        .count();

      this.setData({
        inVocabulary: vocRes.total > 0,
        isMastered: progRes.total > 0
      });
    } catch (err) {
      console.warn('[detail] 检查状态失败:', err);
    }
  },

  // ==================== 标签页切换 ====================

  onSwitchTab(e) {
    const tab = parseInt(e.currentTarget.dataset.tab, 10);
    this.setData({ currentTab: tab });
  },

  // ==================== 发音播放 ====================

  playAudio(word) {
    this.destroyAudio();

    if (!word) return;

    const audioSrc = this.buildTtsUrl(word);
    if (!audioSrc) return;

    try {
      const innerAudioContext = wx.createInnerAudioContext();
      innerAudioContext.src = audioSrc;
      innerAudioContext.autoplay = true;
      innerAudioContext.onError(() => {
        console.warn('[detail] 音频播放失败');
      });
      this.innerAudioContext = innerAudioContext;
    } catch (err) {
      console.warn('[detail] 创建音频失败:', err);
    }
  },

  onPlayAudio() {
    const word = this.data.word.word;
    if (!word) return;
    // playAudio 内部已通过 destroyAudio 清理旧上下文
    this.playAudio(word);
  },

  buildTtsUrl(word) {
    if (!word) return '';
    return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=0`;
  },

  destroyAudio() {
    if (this.innerAudioContext) {
      this.innerAudioContext.stop();
      this.innerAudioContext.destroy();
      this.innerAudioContext = null;
    }
  },

  // ==================== 操作按钮 ====================

  async onToggleVocabulary() {
    const { wordId } = this;
    const { inVocabulary } = this.data;

    try {
      if (inVocabulary) {
        await cloudApi.removeFromVocabulary(wordId);
        this.setData({ inVocabulary: false });
        util.showToast('已移出生词本', 'success');
      } else {
        await cloudApi.addToVocabulary(wordId);
        this.setData({ inVocabulary: true });
        util.showToast('已加入生词本', 'success');
      }
    } catch (err) {
      console.error('[detail] 操作生词本失败:', err);
      util.showToast('操作失败，请重试');
    }
  },

  async onMarkMastered() {
    const { wordId, bookId } = this;

    try {
      // status=3 表示已掌握
      await cloudApi.updateWordStatus(wordId, 3, bookId);
      this.setData({ isMastered: true });
      util.showToast('已标记为已掌握', 'success');
    } catch (err) {
      console.error('[detail] 标记已掌握失败:', err);
      util.showToast('操作失败，请重试');
    }
  }
});
