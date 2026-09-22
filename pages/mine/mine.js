const cloudApi = require('../../utils/cloud');
const util = require('../../utils/util');

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    avatarChar: '词',
    statistics: {
      totalLearned: 0,
      streak: 0,
      todayLearned: 0
    },
    totalDuration: 0,
    formattedDuration: '0分钟',
    settings: {
      dailyNewWords: 20
    },
    // 关于
    showAbout: false,
    openid: ''
  },

  onShow() {
    this.loadUserInfo();
    this.loadOpenid();
    this.loadStatistics();
    this.loadSettings();
  },

  // ==================== 用户信息 ====================

  loadOpenid() {
    const app = getApp();
    const openid = app.globalData.openid || '';
    if (openid) {
      this.setData({ openid });
    } else {
      cloudApi.login().then(res => {
        if (res && res.openid) {
          app.globalData.openid = res.openid;
          this.setData({ openid: res.openid });
        }
      }).catch(() => {});
    }
  },

  loadUserInfo() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    if (userInfo) {
      this.setData({
        avatarUrl: userInfo.avatarUrl || '',
        nickname: userInfo.nickName || '',
        avatarChar: (userInfo.nickName || '词')[0]
      });
      return;
    }
    // 尝试从本地缓存获取
    try {
      const cache = wx.getStorageSync('userInfo');
      if (cache && cache.nickName) {
        this.setData({
          avatarUrl: cache.avatarUrl || '',
          nickname: cache.nickName,
          avatarChar: cache.nickName[0]
        });
        app.globalData.userInfo = cache;
        return;
      }
    } catch (e) { /* ignore */ }
  },

  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    this.setData({ avatarUrl });
    this.saveProfile();
  },

  onNicknameInput(e) {
    const nickname = e.detail.value;
    if (!nickname) return;
    this.setData({ nickname, avatarChar: nickname[0] });
    this.saveProfile();
  },

  saveProfile: util.debounce(function () {
    const { nickname, avatarUrl } = this.data;
    if (!nickname) return;
    const app = getApp();
    const profile = { nickName: nickname, avatarUrl };
    wx.setStorageSync('userInfo', profile);
    app.globalData.userInfo = profile;
  }, 500),

  // ==================== 学习统计 ====================

  async loadStatistics() {
    try {
      const stats = await cloudApi.getStatistics();
      if (stats) {
        const totalDuration = stats.totalDuration || 0;
        this.setData({
          statistics: {
            totalLearned: stats.totalLearned || 0,
            streak: stats.streak || 0,
            todayLearned: stats.todayLearned || 0
          },
          totalDuration,
          formattedDuration: this.formatDuration(totalDuration)
        });
      }
    } catch (err) {
      console.error('[mine] 加载统计失败:', err);
    }
  },

  formatDuration(seconds) {
    if (!seconds || seconds < 60) return '不到1分钟';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}小时${remainingMinutes}分钟` : `${hours}小时`;
  },

  // ==================== 设置 ====================

  async loadSettings() {
    try {
      const result = await cloudApi.getUserData();
      if (result && result.settings) {
        const s = result.settings;
        this.setData({
          settings: {
            dailyNewWords: s.dailyNewWords || 20
          }
        });
      }
    } catch (err) {
      console.error('[mine] 加载设置失败:', err);
    }
  },

  async saveSettings(updated) {
    const settings = { ...this.data.settings, ...updated };
    this.setData({ settings });
    try {
      const result = await cloudApi.syncUserSettings(settings);
      util.showToast('已保存', 'success');
      return result;
    } catch (err) {
      console.error('[mine] 保存设置失败:', err);
      util.showToast(err.message || '保存失败，请检查网络后重试');
    }
  },

  onNewWordTargetChange(e) {
    const delta = parseInt(e.currentTarget.dataset.delta);
    let val = (this.data.settings.dailyNewWords || 20) + delta;
    val = Math.max(10, Math.min(100, val));
    this.saveSettings({ dailyNewWords: val });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？不会影响学习数据。',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          const app = getApp();
          app.globalData.userInfo = null;
          this.setData({
            avatarUrl: '',
            nickname: '',
            avatarChar: '词',
            openid: app.globalData.openid || ''
          });
          util.showToast('已退出');
        }
      }
    });
  },

  onGoFeedback() {
    wx.navigateTo({ url: '/pages/feedback/feedback' });
  },

  onGoAbout() {
    this.setData({ showAbout: true });
  },

  onCloseAbout() {
    this.setData({ showAbout: false });
  }
});
