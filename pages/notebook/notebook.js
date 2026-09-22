const cloudApi = require('../../utils/cloud');
const util = require('../../utils/util');

Page({
  data: {
    loading: true,
    keyword: '',
    sortBy: 'time',
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    swipedItemId: '',
    showCheckbox: false,
    selectedIds: [],
    selectedCount: 0,
    allSelected: false
  },

  touchStartX: 0,
  touchStartY: 0,
  debouncedSearch: null,

  onLoad() {
    this.debouncedSearch = util.debounce((keyword) => {
      this.setData({ keyword, page: 1, list: [] });
      this.loadList();
    }, 300);
  },

  onShow() {
    this.loadList();
  },

  // ==================== 数据加载 ====================

  async loadList() {
    const { keyword, sortBy, page, pageSize } = this.data;

    try {
      this.setData({ loading: true });

      const result = await cloudApi.getVocabularyList({ keyword, sortBy, page, pageSize });

      let newList = [];
      let total = 0;

      if (Array.isArray(result)) {
        newList = result;
        total = result.length;
      } else if (result && result.list) {
        newList = result.list || [];
        total = result.total || newList.length;
      } else {
        newList = [];
        total = 0;
      }

      // 保留选中状态
      const selectedIds = this.data.selectedIds || [];
      newList = newList.map(item => ({
        ...item,
        checked: selectedIds.includes(item._id),
        // 格式化时间
        createdAt: item.addedAt ? this.formatTime(item.addedAt) : ''
      }));

      const list = page === 1 ? newList : [...this.data.list, ...newList];

      this.setData({
        loading: false,
        list,
        total,
        hasMore: list.length < total && newList.length === pageSize,
        page
      });

    } catch (err) {
      console.error('[notebook] 加载生词本失败:', err);
      util.showToast('加载失败，请重试');
      this.setData({ loading: false });
    }
  },

  formatTime(time) {
    if (!time) return '';
    const d = typeof time === 'number' ? new Date(time)
      : time instanceof Date ? time
      : new Date(time);
    if (isNaN(d.getTime())) return String(time).slice(0, 10);
    return util.formatDate(d, 'MM-dd HH:mm');
  },

  onLoadMore() {
    if (!this.data.hasMore) return;
    this.setData({ page: this.data.page + 1 });
    this.loadList();
  },

  // ==================== 搜索与排序 ====================

  onSearchInput(e) {
    const keyword = e.detail.value.trim();
    this.debouncedSearch(keyword);
  },

  onClearSearch() {
    this.setData({ keyword: '', page: 1, list: [] });
    this.loadList();
  },

  onToggleSort() {
    const sortBy = this.data.sortBy === 'time' ? 'alpha' : 'time';
    this.setData({ sortBy, page: 1, list: [], swipedItemId: '' });
    this.loadList();
  },

  // ==================== 左滑删除 ====================

  onTouchStart(e) {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  },

  onTouchEnd(e) {
    const deltaX = e.changedTouches[0].clientX - this.touchStartX;
    const deltaY = e.changedTouches[0].clientY - this.touchStartY;

    // 垂直滑动忽略
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;

    const itemId = e.currentTarget.dataset.id;
    const isSwiped = this.data.swipedItemId === itemId;

    if (deltaX < -50) {
      // 左滑超过阈值，显示删除按钮
      this.setData({ swipedItemId: itemId });
    } else if (deltaX > 30) {
      // 右滑关闭
      this.setData({ swipedItemId: '' });
    } else if (isSwiped) {
      // 再次点关闭
      this.setData({ swipedItemId: '' });
    }
  },

  // ==================== 单选删除 ====================

  async onRemoveItem(e) {
    const wordId = e.currentTarget.dataset.id;
    if (!wordId) return;

    try {
      await cloudApi.removeFromVocabulary(wordId);
      util.showToast('已移除', 'success');

      const list = this.data.list.filter(item => item._id !== wordId);
      this.setData({ list, swipedItemId: '', total: this.data.total - 1 });
    } catch (err) {
      console.error('[notebook] 移除失败:', err);
      util.showToast('移除失败，请重试');
    }
  },

  // ==================== 多选与批量操作 ====================

  onSelectItem(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.swipedItemId === id) {
      // 点击已左滑的同一项：关闭删除按钮，不进详情
      this.setData({ swipedItemId: '' });
      return;
    }
    // 点击其他项：清除滑动状态并进入详情
    this.setData({ swipedItemId: '' });
    wx.navigateTo({ url: `/pages/detail/detail?wordId=${id}&bookId=${wx.getStorageSync('currentBookId') || ''}` });
  },

  onToggleCheck(e) {
    const idx = e.currentTarget.dataset.index;
    const list = [...this.data.list];
    const item = list[idx];
    if (!item) return;

    item.checked = !item.checked;

    const selectedIds = list.filter(i => i.checked).map(i => i._id);
    const allSelected = list.length > 0 && selectedIds.length === list.length;

    this.setData({
      list,
      selectedIds,
      allSelected,
      selectedCount: selectedIds.length,
      showCheckbox: selectedIds.length > 0
    });
  },

  onToggleSelectAll() {
    const list = this.data.list;
    const allSelected = !this.data.allSelected;

    const updated = list.map(item => ({ ...item, checked: allSelected }));
    const selectedIds = allSelected ? list.map(i => i._id) : [];

    this.setData({
      list: updated,
      allSelected,
      selectedIds,
      selectedCount: selectedIds.length,
      showCheckbox: selectedIds.length > 0
    });
  },

  async onBatchRemove() {
    const ids = this.data.selectedIds;
    if (ids.length === 0) return;

    try {
      await cloudApi.batchRemoveFromVocabulary(ids);
      util.showToast(`已移除 ${ids.length} 个单词`, 'success');

      const list = this.data.list.filter(item => !ids.includes(item._id));
      this.setData({
        list,
        selectedIds: [],
        allSelected: false,
        selectedCount: 0,
        showCheckbox: false,
        total: this.data.total - ids.length
      });
    } catch (err) {
      console.error('[notebook] 批量移除失败:', err);
      util.showToast('批量移除失败，请重试');
    }
  },

  // ==================== 生词测验 ====================

  onStartQuiz() {
    const allIds = this.data.list.map(item => item._id);
    // URL 长度限制，最多传 100 个单词 ID
    const MAX_IDS = 100;
    const wordIds = allIds.slice(0, MAX_IDS);

    if (allIds.length > MAX_IDS) {
      util.showToast(`随机选取前 ${MAX_IDS} 个词进行测验`);
    }

    wx.navigateTo({
      url: `/pages/test/test?mode=vocabulary&wordIds=${wordIds.join(',')}&bookId=${wx.getStorageSync('currentBookId') || ''}`
    });
  }
});
