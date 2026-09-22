const cloudApi = require('../../utils/cloud');
const util = require('../../utils/util');

const CACHE_KEY_BOOK_ID = 'currentBookId';
const CACHE_KEY_REDIRECTED = 'hasRedirectedToBooks';
const PAGE_SIZE = 20;

Page({
  data: {
    loading: true,
    loadingMore: false,
    error: false,
    keyword: '',
    list: [],
    currentBookId: '',
    page: 1,
    hasMore: false
  },

  onLoad() {
    this.loadBooks(1, true);
  },

  onShow() {
    const currentBookId = wx.getStorageSync(CACHE_KEY_BOOK_ID) || '';
    if (currentBookId !== this.data.currentBookId) {
      this.setData({ currentBookId });
    }
  },

  /** 加载单词书列表 */
  async loadBooks(page, reset) {
    const keyword = this.data.keyword;
    try {
      const res = await cloudApi.getWordbooks({ keyword, page, pageSize: PAGE_SIZE });
      const rawList = res.list || [];
      const hasMore = res.hasMore || false;
      const list = this.normalizeList(rawList);

      if (reset) {
        this.setData({
          list,
          page,
          hasMore,
          loading: false,
          loadingMore: false,
          error: false,
          currentBookId: wx.getStorageSync(CACHE_KEY_BOOK_ID) || ''
        });
      } else {
        this.setData({
          list: this.data.list.concat(list),
          page,
          hasMore,
          loadingMore: false,
          error: false
        });
      }
    } catch (err) {
      console.error('[books] 加载单词书失败:', err);
      if (reset) {
        this.setData({ loading: false, error: true });
      } else {
        this.setData({ loadingMore: false });
        util.showToast('加载失败，请重试');
      }
    }
  },

  // ==================== 数据处理 ====================

  /** 加工列表数据：预计算进度百分比 */
  normalizeList(rawList) {
    return rawList.map(item => {
      const total = item.totalWords || 0;
      const progress = item.progress || {};
      const learned = progress.learned || 0;
      const percent = total > 0 ? (learned / total * 100).toFixed(0) : 0;
      return { ...item, progressPercent: percent };
    });
  },

  // ==================== 搜索 ====================

  /** 搜索输入 — 防抖 300ms */
  onSearchInput(e) {
    const keyword = e.detail.value;
    this.setData({ keyword });
    this.debouncedSearch();
  },

  /** 清空搜索 */
  onClearSearch() {
    this.setData({ keyword: '' });
    this.doSearch();
  },

  /** 防抖搜索 */
  debouncedSearch: util.debounce(function () {
    this.doSearch();
  }, 300),

  /** 执行搜索（重置第1页） */
  doSearch() {
    this.setData({ loading: true, list: [] });
    this.loadBooks(1, true);
  },

  // ==================== 分页 ====================

  /** 上拉加载更多 */
  onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    this.loadBooks(this.data.page + 1, false);
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    this.setData({ keyword: '', loading: true });
    this.loadBooks(1, true);
    wx.stopPullDownRefresh();
  },

  // ==================== 单词书选择 ====================

  /** 点击选择单词书 */
  onSelectBook(e) {
    const { id, name } = e.currentTarget.dataset;
    if (id === this.data.currentBookId) return;

    wx.showModal({
      title: '切换单词书',
      content: `是否将《${name}》设为当前学习单词书？`,
      success: (res) => {
        if (res.confirm) {
          this.confirmSelectBook(id, name);
        }
      }
    });
  },

  /** 确认选择单词书 */
  async confirmSelectBook(bookId, bookName) {
    wx.showLoading({ title: '设置中...', mask: true });
    try {
      // 初始化学习进度（幂等，已初始化不会重复创建）
      await cloudApi.initUserProgress(bookId);

      // 保存当前单词书 ID
      wx.setStorageSync(CACHE_KEY_BOOK_ID, bookId);
      // 清除首页重定向标记，使其正常展示
      wx.removeStorageSync(CACHE_KEY_REDIRECTED);

      this.setData({ currentBookId: bookId });

      wx.hideLoading();
      wx.showToast({ title: `已切换至《${bookName}》`, icon: 'none', duration: 2000 });

      // 切换至首页
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 1500);
    } catch (err) {
      wx.hideLoading();
      util.showToast('设置失败，请重试');
      console.error('[books] 选择单词书失败:', err);
    }
  }
});
