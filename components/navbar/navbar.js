Component({
  properties: {
    title: {
      type: String,
      value: '词小达'
    },
    showBack: {
      type: Boolean,
      value: true
    }
  },

  data: {
    statusBarHeight: 44
  },

  lifetimes: {
    attached() {
      this.getStatusBarHeight();
    }
  },

  methods: {
    getStatusBarHeight() {
      const systemInfo = wx.getSystemInfoSync();
      const statusBarHeight = systemInfo.statusBarHeight || 44;
      this.setData({ statusBarHeight });
    },

    onBack() {
      if (this.properties.showBack) {
        wx.navigateBack({ delta: 1 });
      }
    }
  }
});
