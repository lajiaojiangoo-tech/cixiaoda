const cloudApi = require('../../utils/cloud');
const util = require('../../utils/util');

/** 洗牌 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

Page({
  data: {
    loading: true,
    showResult: false,

    currentIndex: 0,
    totalCount: 0,
    questions: [],
    currentQuestion: null,

    answered: false,
    selectedOption: -1,
    spellingValue: '',
    spellingResult: null,
    feedbackType: '',
    correctAnswerText: '',

    correctCount: 0,
    accuracy: 0,
    resultDetails: [],
    wrongWordIds: [],

    bookId: '',
    startTime: 0
  },

  onLoad(options) {
    const bookId = options.bookId || wx.getStorageSync('currentBookId') || '';
    const wordIdsStr = options.wordIds || '';
    const mode = options.mode || 'review';

    this.bookId = bookId;
    this.startTime = Date.now();

    if (wordIdsStr) {
      this.loadWordsByIds(wordIdsStr);
    } else {
      this.loadReviewWords(bookId);
    }
  },

  onUnload() {
    this.clearAutoTimer();
  },

  // ==================== 数据加载 ====================

  /** 从 wordIds 加载单词详情（通过云函数而非直连数据库） */
  async loadWordsByIds(wordIdsStr) {
    try {
      const ids = wordIdsStr.split(',').filter(Boolean);
      if (ids.length === 0) {
        util.showToast('没有可测试的单词');
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      const words = await cloudApi.getWordsByIds(ids);
      this.initTest(words || []);
    } catch (err) {
      console.error('[test] loadWordsByIds 失败:', err);
      util.showToast('加载单词失败');
      this.setData({ loading: false });
    }
  },

  /** 加载复习单词 */
  async loadReviewWords(bookId) {
    try {
      const data = await cloudApi.getTodayStudyWords(bookId);
      const words = data.reviewWords || [];
      if (words.length === 0) {
        util.showToast('暂无待复习单词');
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      this.initTest(words);
    } catch (err) {
      console.error('[test] loadReviewWords 失败:', err);
      util.showToast('加载复习单词失败');
      this.setData({ loading: false });
    }
  },

  /** 初始化测试：生成题目 */
  initTest(words) {
    if (words.length === 0) {
      util.showToast('没有可测试的单词');
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    const questions = this.generateQuestions(words);

    this.setData({
      loading: false,
      questions,
      totalCount: questions.length,
      currentIndex: 0,
      currentQuestion: questions[0] || null,
      startTime: Date.now()
    });
  },

  /** 生成题目：7:3 混合选择题和拼写题 */
  generateQuestions(words) {
    const shuffled = shuffle(words);
    const total = shuffled.length;
    const choiceCount = Math.max(1, Math.round(total * 0.7));
    const questions = [];

    shuffled.forEach((word, index) => {
      if (index < choiceCount) {
        // 选择题
        const distractors = shuffled
          .filter(w => w._id !== word._id && w.meaning)
          .sort(() => Math.random() - 0.5)
          .slice(0, 3)
          .map(w => ({ text: w.meaning, isCorrect: false }));

        while (distractors.length < 3) {
          distractors.push({ text: '未知', isCorrect: false });
        }

        const options = shuffle([
          { text: word.meaning, isCorrect: true },
          ...distractors.slice(0, 3)
        ]);

        questions.push({
          type: 'choice',
          wordId: word._id || word.wordId,
          word: word.word,
          meaning: word.meaning,
          phonetic: word.phonetic || '',
          options,
          correctMeaning: word.meaning
        });
      } else {
        // 拼写题
        questions.push({
          type: 'spelling',
          wordId: word._id || word.wordId,
          word: word.word,
          meaning: word.meaning,
          correctAnswer: word.word
        });
      }
    });

    return shuffle(questions);
  },

  // ==================== 选择题交互 ====================

  onSelectOption(e) {
    if (this.data.answered) return;

    const { index } = e.currentTarget.dataset;
    const question = this.data.questions[this.data.currentIndex];
    const selectedOpt = question.options[index];
    const isCorrect = selectedOpt.isCorrect;

    this.setData({
      answered: true,
      selectedOption: index,
      feedbackType: isCorrect ? 'correct' : 'wrong',
      correctAnswerText: isCorrect ? '' : question.correctMeaning
    });

    this.recordAnswer(question.wordId, isCorrect, question);
    this.startAutoTimer();
  },

  // ==================== 拼写题交互 ====================

  onSpellingInput(e) {
    this.setData({ spellingValue: e.detail.value });
  },

  onSubmitSpelling(e) {
    if (this.data.answered) return;

    const value = (e.detail.value.spelling || '').trim();
    if (!value) {
      util.showToast('请输入答案');
      return;
    }

    const question = this.data.questions[this.data.currentIndex];
    const isCorrect = value.toLowerCase() === question.correctAnswer.toLowerCase();

    this.setData({
      answered: true,
      spellingResult: isCorrect,
      feedbackType: isCorrect ? 'correct' : 'wrong',
      correctAnswerText: isCorrect ? '' : question.correctAnswer
    });

    this.recordAnswer(question.wordId, isCorrect, question);
    this.startAutoTimer();
  },

  // ==================== 答题记录 ====================

  recordAnswer(wordId, isCorrect, question) {
    if (!this.answers) this.answers = [];
    this.answers.push({
      wordId,
      word: question.word || question.correctAnswer,
      meaning: question.meaning || '',
      isCorrect,
      correctAnswer: question.correctAnswer || question.correctMeaning || ''
    });

    if (!isCorrect) {
      if (!this.wrongIds) this.wrongIds = [];
      this.wrongIds.push(wordId);

      // 错词自动加入生词本（静默处理）
      cloudApi.addToVocabulary(wordId).catch(() => {});
    }
  },

  // ==================== 题目跳转 ====================

  startAutoTimer() {
    this.clearAutoTimer();
    this.autoTimer = setTimeout(() => {
      this.advanceToNext();
    }, 2000);
  },

  clearAutoTimer() {
    if (this.autoTimer) {
      clearTimeout(this.autoTimer);
      this.autoTimer = null;
    }
  },

  advanceToNext() {
    const nextIndex = this.data.currentIndex + 1;

    if (nextIndex >= this.data.questions.length) {
      this.finishTest();
      return;
    }

    this.setData({
      currentIndex: nextIndex,
      currentQuestion: this.data.questions[nextIndex],
      answered: false,
      selectedOption: -1,
      spellingValue: '',
      spellingResult: null,
      feedbackType: '',
      correctAnswerText: ''
    });
  },

  // ==================== 完成测试 ====================

  async finishTest() {
    const answers = this.answers || [];
    const total = answers.length;
    const correct = answers.filter(a => a.isCorrect).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const wrongItems = answers.filter(a => !a.isCorrect);

    this.setData({
      correctCount: correct,
      totalCount: total,
      accuracy,
      resultDetails: answers,
      wrongWordIds: wrongItems.map(a => a.wordId),
      showResult: true
    });

    // 提交测试结果到云端
    try {
      const now = Date.now();
      const duration = Math.round((now - (this.startTime || now)) / 1000);
      await cloudApi.submitTestResult({
        results: answers.map(a => ({
          wordId: a.wordId,
          isCorrect: a.isCorrect
        })),
        bookId: this.bookId || wx.getStorageSync('currentBookId') || '',
        duration: Math.min(duration, 600)
      });
    } catch (err) {
      console.warn('[test] submitTestResult 失败:', err);
    }
  },

  // ==================== 按钮事件 ====================

  onRetryWrong() {
    const wrongIds = this.data.wrongWordIds;
    if (wrongIds.length === 0) {
      util.showToast('没有错词');
      return;
    }

    this.answers = [];
    this.wrongIds = [];

    this.setData({
      showResult: false,
      loading: true,
      currentIndex: 0,
      totalCount: 0,
      currentQuestion: null,
      answered: false,
      selectedOption: -1,
      spellingValue: '',
      spellingResult: null,
      feedbackType: '',
      correctAnswerText: '',
      correctCount: 0,
      accuracy: 0,
      resultDetails: [],
      wrongWordIds: []
    });

    this.loadWordsByIds(wrongIds.join(','));
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
