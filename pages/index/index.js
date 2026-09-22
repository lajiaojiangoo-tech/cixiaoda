const cloudApi = require('../../utils/cloud');
const util = require('../../utils/util');

const CACHE_KEY_BOOK_ID = 'currentBookId';
const CACHE_KEY_USER_INFO = 'userInfo';
const CACHE_KEY_REDIRECTED = 'hasRedirectedToBooks';

Page({
  data: {
    loading: true,
    hasBook: false,
    error: false,
    userInfo: {},
    avatarChar: '学',
    statistics: { totalLearned: 0, streak: 0 },
    todayData: { newCount: 0, reviewCount: 0 },
    todayLearned: 0,
    currentBookId: '',
    // 推荐轮播
    banners: [
      { tag: '学习', title: '每日新词推送', desc: '智能安排新词，每日进步一点点', demo: 'learn', bg: 'linear-gradient(135deg, #EEF4FB, #E1EEFA)' },
      { tag: '复习', title: '巩固已学单词', desc: '根据记忆曲线科学安排复习', demo: 'memory', bg: 'linear-gradient(135deg, #EEF8F1, #DCF0E3)' },
      { tag: '进度', title: '学习从不间断', desc: '连续打卡，见证你的成长', demo: 'streak', bg: 'linear-gradient(135deg, #FEF6ED, #FDECD6)' }
    ],
    // 日历
    calendarYear: 0,
    calendarMonth: 0,
    calendarDays: [],
    weekdays: ['日', '一', '二', '三', '四', '五', '六']
  },

  onLoad() {
    const now = new Date();
    this.setData({
      calendarYear: now.getFullYear(),
      calendarMonth: now.getMonth() + 1
    });
    this.buildCalendar();
    this.loadPageData();
  },

  onShow() {
    this.initUserInfo();
    this.loadPageData();
  },

  /** 初始化用户信息（从缓存快速加载，无缓存时重置） */
  initUserInfo() {
    const cached = wx.getStorageSync(CACHE_KEY_USER_INFO);
    if (cached && cached.nickName) {
      this.setData({
        userInfo: cached,
        avatarChar: cached.nickName[0]
      });
    } else {
      this.setData({
        userInfo: {},
        avatarChar: '词'
      });
    }
  },

  /** 加载首页数据 */
  async loadPageData() {
    const currentBookId = wx.getStorageSync(CACHE_KEY_BOOK_ID) || '';

    if (!currentBookId) {
      // 未选择单词书 — 首次进入自动跳转选择页（仅一次）
      const hasRedirected = wx.getStorageSync(CACHE_KEY_REDIRECTED);
      if (!hasRedirected) {
        wx.setStorageSync(CACHE_KEY_REDIRECTED, true);
        wx.navigateTo({ url: '/pages/books/books' });
      }
      this.setData({ loading: false, hasBook: false });
      return;
    }

    this.setData({ currentBookId, hasBook: true });

    try {
      wx.showNavigationBarLoading();

      // 并行加载各项数据
      const [todayData, statistics, userSettings] = await Promise.all([
        this.fetchTodayData(currentBookId),
        this.fetchStatistics(currentBookId),
        this.fetchUserSettings()
      ]);

      // 每日新词可用数 = 每日目标 − 今日已学（动态变化）
      const dailyNewWords = (userSettings && userSettings.dailyNewWords) || 20;
      const todayLearned = statistics.todayLearned || 0;
      const availableNew = Math.max(0, Math.min(dailyNewWords - todayLearned, todayData.newCount));
      // 复习词不设上限，SRS 到期该复习的都展示
      const availableReview = todayData.reviewCount;

      this.setData({
        loading: false,
        error: false,
        todayData: {
          newCount: availableNew,
          reviewCount: availableReview,
          newWords: todayData.newWords,
          reviewWords: todayData.reviewWords
        },
        statistics,
        todayLearned: statistics.todayLearned || 0
      });
    } catch (err) {
      console.error('[index] 加载首页数据失败:', err);
      this.setData({ loading: false, error: true });
    } finally {
      wx.hideNavigationBarLoading();
      wx.stopPullDownRefresh();
    }
  },

  /** 获取今日学习数据 */
  async fetchTodayData(bookId) {
    try {
      const data = await cloudApi.getTodayStudyWords(bookId);
      return {
        newCount: data.newCount || 0,
        reviewCount: data.reviewCount || 0,
        newWords: data.newWords || [],
        reviewWords: data.reviewWords || []
      };
    } catch {
      return { newCount: 0, reviewCount: 0, newWords: [], reviewWords: [] };
    }
  },

  /** 获取学习统计（支持按词书过滤） */
  async fetchStatistics(bookId) {
    try {
      const result = await cloudApi.getStatistics(bookId ? { bookId } : {});
      return {
        totalLearned: result.totalLearned || 0,
        streak: result.streak || 0,
        totalDuration: result.totalDuration || 0,
        todayLearned: result.todayLearned || 0
      };
    } catch {
      return { totalLearned: 0, streak: 0, totalDuration: 0, todayLearned: 0 };
    }
  },

  /** 获取用户每日学习目标设置 */
  async fetchUserSettings() {
    try {
      const result = await cloudApi.getUserData();
      return result && result.settings ? result.settings : null;
    } catch {
      return null;
    }
  },

  // ==================== 学习日历 ====================

  buildCalendar() {
    const { calendarYear, calendarMonth } = this.data;
    const firstDay = new Date(calendarYear, calendarMonth - 1, 1);
    const lastDay = new Date(calendarYear, calendarMonth, 0);
    const totalDays = lastDay.getDate();
    const startWeekday = firstDay.getDay();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const days = [];
    for (let i = 0; i < startWeekday; i++) {
      days.push({ day: '', date: '', isToday: false, isStudied: false });
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        day: d,
        date: dateStr,
        isToday: dateStr === todayStr,
        isStudied: false
      });
    }

    this.setData({ calendarDays: days });
    this.loadStudyRecords();
  },

  async loadStudyRecords() {
    const { calendarYear, calendarMonth } = this.data;
    try {
      const result = await cloudApi.getStudyRecords(calendarYear, calendarMonth);
      if (result && result.records) {
        const studiedDates = result.records;
        const days = this.data.calendarDays.map(item => {
          if (item.date && studiedDates[item.date]) {
            return { ...item, isStudied: true };
          }
          return item;
        });
        this.setData({ calendarDays: days });
      }
    } catch (err) {
      console.error('[index] 加载学习日历失败:', err);
    }
  },

  onPrevMonth() {
    let { calendarYear, calendarMonth } = this.data;
    if (calendarMonth === 1) {
      calendarYear--;
      calendarMonth = 12;
    } else {
      calendarMonth--;
    }
    this.setData({ calendarYear, calendarMonth });
    this.buildCalendar();
  },

  onNextMonth() {
    let { calendarYear, calendarMonth } = this.data;
    if (calendarMonth === 12) {
      calendarYear++;
      calendarMonth = 1;
    } else {
      calendarMonth++;
    }
    this.setData({ calendarYear, calendarMonth });
    this.buildCalendar();
  },

  // ==================== 事件处理 ====================

  /** 跳转学习页 */
  goToStudy(e) {
    const { mode } = e.currentTarget.dataset;
    const bookId = this.data.currentBookId;

    if (mode === 'review' && this.data.todayData.reviewCount === 0) {
      util.showToast('暂没有需要复习的单词');
      return;
    }
    if (mode === 'new' && this.data.todayData.newCount === 0) {
      util.showToast('今日新词已学完');
      return;
    }

    wx.navigateTo({
      url: `/pages/study/study?bookId=${bookId}&mode=${mode}`
    });
  },

  /** 跳转单词书列表 */
  goToBooks() {
    wx.navigateTo({ url: '/pages/books/books' });
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    this.loadPageData();
  }
});
