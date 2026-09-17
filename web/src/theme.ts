import type { ThemeConfig } from 'antd'

/**
 * antd 主题 Token：纯白质感 · 简约苹果风。
 *
 * 设计要点：
 *   · 底色纯白，靠「发丝级分隔线 + 极轻阴影 + 大留白」建立层级，不用色块
 *   · 主按钮用近黑（#1F2437），链接用苹果蓝（#0066CC），与 apple.com 一致
 *   · 侧边栏与顶栏用 #FBFBFD 与毛玻璃，区分「框架」与「内容」两层
 *   · 圆角统一 12-20px，控件高度放宽到 38-44px
 * 所有视觉参数集中在此文件，调整观感只需改这里。
 */
export const antdTheme: ThemeConfig = {
  token: {
    // 近黑主色：比默认科技蓝更克制，是"高级感"的关键
    colorPrimary: '#1F2437',
    colorInfo: '#1F2437',
    // 链接与可点击文本用苹果蓝
    colorLink: '#0066CC',
    colorLinkHover: '#0077ED',

    // 文本层级
    colorText: '#1D1D1F',
    colorTextSecondary: '#6E6E73',
    colorTextTertiary: '#86868B',
    colorTextQuaternary: '#AEAEB2',

    // 纯白底色
    colorBgLayout: '#FFFFFF',
    colorBgContainer: '#FFFFFF',
    colorBgElevated: '#FFFFFF',
    colorBgSpotlight: '#1D1D1F',

    // 发丝级分隔线，替代边框
    colorBorder: 'rgba(0, 0, 0, 0.08)',
    colorBorderSecondary: 'rgba(0, 0, 0, 0.05)',
    colorSplit: 'rgba(0, 0, 0, 0.06)',

    // 圆角
    borderRadius: 12,
    borderRadiusLG: 18,
    borderRadiusSM: 8,
    borderRadiusXS: 6,

    // 系统字体栈
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif',
    fontSize: 14,
    lineHeight: 1.5715,

    // 控件高度放宽，默认 32px 偏紧
    controlHeight: 38,
    controlHeightSM: 30,
    controlHeightLG: 46,

    // 阴影"薄而散"，不要重投影
    boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)',
    boxShadowSecondary: '0 2px 6px rgba(0,0,0,0.05), 0 16px 40px rgba(0,0,0,0.08)',

    // 语义色保持功能辨识度，不为好看牺牲可读性
    colorSuccess: '#1D9A4E',
    colorWarning: '#C77700',
    colorError: '#D70015',

    wireframe: false,
  },

  components: {
    Layout: {
      bodyBg: '#FFFFFF',
      headerBg: 'rgba(255,255,255,0.72)',
      headerHeight: 60,
      headerPadding: '0 28px',
      siderBg: '#FBFBFD',
      footerBg: 'transparent',
    },
    Menu: {
      itemBg: 'transparent',
      subMenuItemBg: 'transparent',
      itemSelectedBg: 'rgba(0,0,0,0.06)',
      itemSelectedColor: '#1D1D1F',
      itemHoverBg: 'rgba(0,0,0,0.035)',
      itemColor: '#6E6E73',
      itemBorderRadius: 10,
      itemHeight: 40,
      itemMarginInline: 10,
      itemMarginBlock: 3,
      iconSize: 17,
      iconMarginInlineEnd: 10,
      activeBarWidth: 0,
      activeBarBorderWidth: 0,
      fontSize: 14,
    },
    Card: {
      borderRadiusLG: 18,
      paddingLG: 24,
      colorBorderSecondary: 'rgba(0,0,0,0.06)',
      headerFontSize: 15,
      headerHeight: 52,
    },
    /*
      表格所有背景色都必须写成「不透明」值，不能给 transparent / rgba。
      原因：固定列是用 position: sticky 实现的，sticky 单元格需要自带不透明底色
      才能遮住横向滚动时从下面滑过的其他单元格；一旦透明，下层文字就会透上来，
      表现为表头文字重叠。
      下面这几个值在纯白卡片上的观感与原透明方案完全一致：
        #FFFFFF = 原来的 transparent
        #FAFAFA = 原来的 rgba(0,0,0,0.018) 叠在白底上的等效实色
    */
    Table: {
      headerBg: '#FFFFFF',
      headerColor: '#86868B',
      headerSplitColor: 'transparent',
      borderColor: 'rgba(0,0,0,0.05)',
      rowHoverBg: '#FAFAFA',
      rowSelectedBg: '#F5F6F8',
      rowSelectedHoverBg: '#EFF1F4',
      cellPaddingBlock: 14,
      cellPaddingInline: 16,
      headerBorderRadius: 0,
      footerBg: '#FFFFFF',
      expandIconBg: '#FFFFFF',
    },
    Button: {
      borderRadius: 980,
      borderRadiusLG: 980,
      borderRadiusSM: 8,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
      fontWeight: 500,
      paddingInline: 18,
    },
    Input: { borderRadius: 10, paddingBlock: 7, activeShadow: 'none' },
    InputNumber: { borderRadius: 10 },
    Select: { borderRadius: 10 },
    DatePicker: { borderRadius: 10 },
    Tag: {
      borderRadiusSM: 7,
      defaultBg: 'rgba(0,0,0,0.05)',
      defaultColor: '#6E6E73',
    },
    Segmented: {
      itemSelectedBg: '#FFFFFF',
      trackBg: 'rgba(0,0,0,0.045)',
      borderRadius: 12,
      itemSelectedColor: '#1D1D1F',
      itemColor: '#6E6E73',
    },
    Modal: { borderRadiusLG: 20, paddingContentHorizontalLG: 28 },
    Drawer: { paddingLG: 28 },
    Tabs: { horizontalItemPadding: '12px 0', titleFontSize: 14, inkBarColor: '#1D1D1F', itemSelectedColor: '#1D1D1F' },
    Statistic: { titleFontSize: 13, contentFontSize: 30 },
    Descriptions: { labelBg: 'transparent', itemPaddingBottom: 14 },
    Message: { borderRadiusLG: 12 },
    Tooltip: { borderRadius: 10 },
    Dropdown: { borderRadiusLG: 14 },
    Form: { verticalLabelPadding: '0 0 6px', labelFontSize: 13, labelColor: '#6E6E73' },
    Divider: { colorSplit: 'rgba(0,0,0,0.06)' },
    Empty: { colorTextDescription: '#AEAEB2' },
  },
}
