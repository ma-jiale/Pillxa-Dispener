import 'package:flutter/material.dart';

import '../models/demo_model.dart';
import '../theme/app_theme.dart';
import '../widgets/app_menu.dart';

enum _Category {
  general('通用', Icons.tune_rounded, '摆药的准备周期与药盒布局'),
  appearance('外观', Icons.palette_outlined, '让界面更符合你的使用习惯'),
  device('本机设备', Icons.bluetooth_rounded, '查看这台终端的设备连接'),
  about('演示与关于', Icons.info_outline_rounded, '演示体验与应用信息');

  const _Category(this.label, this.icon, this.description);
  final String label;
  final IconData icon;
  final String description;
}

class SettingsPage extends StatefulWidget {
  const SettingsPage({
    super.key,
    required this.model,
    required this.accent,
    required this.onAccentChanged,
  });
  final DemoModel model;
  final Color accent;
  final ValueChanged<Color> onAccentChanged;

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  static const _accents = [
    (name: '墨黑', color: Color(0xff191919)),
    (name: '海蓝', color: Color(0xff2867bd)),
    (name: '松绿', color: Color(0xff287663)),
    (name: '雾紫', color: Color(0xff7660a8)),
    (name: '暖橙', color: Color(0xffbd5b32)),
  ];
  static const _searchBorder = OutlineInputBorder(
    borderRadius: BorderRadius.all(Radius.circular(99)),
    borderSide: BorderSide.none,
  );
  final _search = TextEditingController();
  late final _hexController = TextEditingController(text: _hex(widget.accent));
  _Category _category = _Category.general;
  String? _colorError;

  String _hex(Color color) =>
      '#${(color.toARGB32() & 0xffffff).toRadixString(16).padLeft(6, '0').toUpperCase()}';

  @override
  void didUpdateWidget(covariant SettingsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.accent != widget.accent) {
      _hexController.text = _hex(widget.accent);
      _colorError = null;
    }
  }

  @override
  void dispose() {
    _search.dispose();
    _hexController.dispose();
    super.dispose();
  }

  void _selectCategory(_Category category) => setState(() {
    _category = category;
    _search.clear();
  });

  void _applyCustomColor() {
    final value = _hexController.text.trim().replaceFirst(RegExp(r'^#'), '');
    if (!RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(value)) {
      setState(() => _colorError = '请输入 6 位颜色代码，如 #2867BD');
      return;
    }
    setState(() => _colorError = null);
    widget.onAccentChanged(Color(0xff000000 | int.parse(value, radix: 16)));
  }

  void _saveRules({int? days, bool? split, bool? night, bool? tomorrow}) =>
      widget.model.saveSettings(
        days: days ?? widget.model.preparationDays,
        split: split ?? widget.model.splitMeals,
        night: night ?? widget.model.bedtime,
        tomorrow: tomorrow ?? widget.model.startTomorrow,
      );

  Future<void> _resetDispensing() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('重置摆药演示？'),
        content: const Text('当前演示进度将清空。处方与设置会保留；此操作不会连接或控制设备。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('保留当前进度'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('确认重置'),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    widget.model.resetDemo();
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('摆药演示已重置')));
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.model,
    builder: (context, _) => LayoutBuilder(
      builder: (context, bounds) {
        if (bounds.maxWidth < 720) {
          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('设置', style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 20),
                _searchField(),
                const SizedBox(height: 12),
                AppSelect<_Category>(
                  key: ValueKey(_category),
                  value: _category,
                  label: '设置分类',
                  showLabel: true,
                  options: [
                    for (final category in _Category.values)
                      AppSelectOption(category, category.label),
                  ],
                  onChanged: _selectCategory,
                ),
                const SizedBox(height: 30),
                _content(context),
              ],
            ),
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SizedBox(
              width: 204,
              child: ColoredBox(
                color: const Color(0xfff6f6f6),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(16, 40, 16, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 12),
                        child: Text(
                          '设置',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      _searchField(),
                      _navigationGroup('偏好设置', [
                        _Category.general,
                        _Category.appearance,
                      ]),
                      _navigationGroup('设备与应用', [
                        _Category.device,
                        _Category.about,
                      ]),
                    ],
                  ),
                ),
              ),
            ),
            Expanded(
              child: ColoredBox(
                color: Colors.white,
                child: SingleChildScrollView(
                  key: ValueKey(_category),
                  padding: EdgeInsets.fromLTRB(
                    bounds.maxWidth > 1000 ? 48 : 32,
                    48,
                    bounds.maxWidth > 1000 ? 48 : 32,
                    32,
                  ),
                  child: Align(
                    alignment: Alignment.topCenter,
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 880),
                      child: _content(context),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    ),
  );

  Widget _searchField() => TextField(
    key: const ValueKey('settings-search'),
    controller: _search,
    onChanged: (_) => setState(() {}),
    style: const TextStyle(fontSize: 13),
    decoration: InputDecoration(
      hintText: '搜索设置',
      fillColor: const Color(0xffebebeb),
      border: _searchBorder,
      enabledBorder: _searchBorder,
      focusedBorder: _searchBorder.copyWith(
        borderSide: const BorderSide(color: Color(0xffd5d5d5)),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      prefixIcon: const Icon(Icons.search_rounded, size: 19),
      suffixIcon: _search.text.isEmpty
          ? null
          : IconButton(
              tooltip: '清空设置搜索',
              icon: const Icon(Icons.close_rounded, size: 17),
              onPressed: () => setState(_search.clear),
            ),
    ),
  );

  Widget _navigationGroup(String label, List<_Category> categories) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(12, 28, 12, 10),
        child: Text(
          label,
          style: const TextStyle(fontSize: 12, color: Color(0xff858585)),
        ),
      ),
      for (final category in categories)
        Padding(
          padding: const EdgeInsets.only(bottom: 5),
          child: Semantics(
            selected: _search.text.isEmpty && _category == category,
            child: Material(
              color: _search.text.isEmpty && _category == category
                  ? const Color(0xffe9e9eb)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(
                key: ValueKey('settings-${category.name}'),
                borderRadius: BorderRadius.circular(12),
                onTap: () => _selectCategory(category),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 14,
                  ),
                  child: Row(
                    children: [
                      Icon(
                        category.icon,
                        size: 19,
                        color: const Color(0xff555555),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          category.label,
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
    ],
  );

  Widget _content(BuildContext context) {
    final query = _search.text.trim().toLowerCase();
    final items = _items(context)
        .where(
          (item) => query.isEmpty
              ? item.category == _category
              : '${item.category.label} ${item.group} ${item.title} ${item.description}'
                    .toLowerCase()
                    .contains(query),
        )
        .toList();
    final groups = items.map((item) => item.group).toSet();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          query.isEmpty ? _category.label : '搜索结果',
          style: Theme.of(context).textTheme.headlineMedium,
        ),
        const SizedBox(height: 8),
        Text(
          query.isEmpty ? _category.description : '找到 ${items.length} 项设置',
          style: const TextStyle(fontSize: 13, color: Color(0xff777777)),
        ),
        const SizedBox(height: 40),
        if (items.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 40),
            child: Text(
              '没有找到相关设置，请换个关键词。',
              textAlign: TextAlign.center,
              style: TextStyle(color: Color(0xff777777)),
            ),
          ),
        for (final group in groups) ...[
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(
              group,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ),
          _groupCard(items.where((item) => item.group == group).toList()),
          const SizedBox(height: 36),
        ],
        const Text(
          '界面预览 · 设置仅保留在本次会话中',
          style: TextStyle(fontSize: 11, color: Color(0xff929292)),
        ),
      ],
    );
  }

  List<_SettingItem> _items(BuildContext context) => [
    _SettingItem(
      _Category.general,
      '准备周期',
      '准备天数',
      '每次准备 1–7 天的用药。',
      SizedBox(
        width: 108,
        child: AppSelect<int>(
          key: const ValueKey('preparation-days'),
          value: widget.model.preparationDays,
          label: '准备天数',
          options: [
            for (var day = 1; day <= 7; day++) AppSelectOption(day, '$day 天'),
          ],
          onChanged: (value) {
            _saveRules(days: value);
          },
        ),
      ),
    ),
    _SettingItem(
      _Category.general,
      '准备周期',
      '从次日开始',
      '关闭时，从当天开始准备。',
      Switch(
        value: widget.model.startTomorrow,
        onChanged: (value) => _saveRules(tomorrow: value),
      ),
    ),
    _SettingItem(
      _Category.general,
      '药盒布局',
      '餐食分盘',
      '饭前单独一盘，其余餐食关系共用另一盘。',
      Switch(
        value: widget.model.splitMeals,
        onChanged: (value) => _saveRules(split: value),
      ),
    ),
    _SettingItem(
      _Category.general,
      '药盒布局',
      '启用睡前时段',
      '在药盒布局中增加睡前格。',
      Switch(
        value: widget.model.bedtime,
        onChanged: (value) => _saveRules(night: value),
      ),
    ),
    _SettingItem(
      _Category.appearance,
      '界面颜色',
      '强调色',
      '主要操作使用强调色，导航选中保持浅灰。',
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final option in _accents)
            _colorOption(context, option.name, option.color),
        ],
      ),
      wideControl: true,
    ),
    _SettingItem(
      _Category.appearance,
      '界面颜色',
      '自定义颜色',
      '输入 HEX 颜色代码，即时应用。',
      SizedBox(
        width: 280,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                key: const ValueKey('custom-accent-input'),
                controller: _hexController,
                textCapitalization: TextCapitalization.characters,
                maxLength: 7,
                onSubmitted: (_) => _applyCustomColor(),
                decoration: InputDecoration(
                  hintText: '#191919',
                  counterText: '',
                  errorText: _colorError,
                  errorMaxLines: 3,
                ),
              ),
            ),
            const SizedBox(width: 10),
            TextButton(onPressed: _applyCustomColor, child: const Text('应用')),
          ],
        ),
      ),
      wideControl: true,
    ),
    const _SettingItem(
      _Category.appearance,
      '图片显示',
      '药品图片',
      '保持原本色彩，不跟随界面强调色变化。',
      Text('原色', style: TextStyle(fontSize: 13, color: Color(0xff737373))),
    ),
    const _SettingItem(
      _Category.device,
      '设备连接',
      '摆药机',
      'HC-06 · 预览尚未接入真实设备。',
      Text('未连接', style: TextStyle(fontSize: 13, color: Color(0xff737373))),
    ),
    const _SettingItem(
      _Category.device,
      '设备连接',
      '连接方式',
      'Android 平板通过蓝牙直连，通常一台终端固定一台机器。',
      Text('蓝牙', style: TextStyle(fontSize: 13, color: Color(0xff737373))),
    ),
    _SettingItem(
      _Category.about,
      '演示体验',
      '重置摆药演示',
      '清空演示进度，保留处方和设置。',
      OutlinedButton(onPressed: _resetDispensing, child: const Text('重置')),
    ),
    const _SettingItem(
      _Category.about,
      '应用信息',
      'Pillxai',
      '客户端交互预览',
      Text(
        '0.1.0 Preview',
        style: TextStyle(fontSize: 13, color: Color(0xff737373)),
      ),
    ),
  ];

  Widget _groupCard(List<_SettingItem> items) => Surface(
    padding: const EdgeInsets.symmetric(horizontal: 20),
    child: Column(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const Divider(height: 1),
          _settingRow(items[i]),
        ],
      ],
    ),
  );

  Widget _settingRow(_SettingItem item) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 22),
    child: LayoutBuilder(
      builder: (context, bounds) {
        final label = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              item.title,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 5),
            Text(
              item.description,
              style: const TextStyle(
                fontSize: 12,
                height: 1.55,
                color: Color(0xff7c7c7c),
              ),
            ),
          ],
        );
        if (bounds.maxWidth < 360 ||
            (item.wideControl && bounds.maxWidth < 600)) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              label,
              const SizedBox(height: 16),
              Align(alignment: Alignment.centerLeft, child: item.control),
            ],
          );
        }
        return Row(
          children: [
            Expanded(child: label),
            const SizedBox(width: 24),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 280),
              child: item.control,
            ),
          ],
        );
      },
    ),
  );

  Widget _colorOption(BuildContext context, String label, Color color) {
    final selected = widget.accent.toARGB32() == color.toARGB32();
    return Semantics(
      button: true,
      selected: selected,
      label: '$label强调色',
      child: InkWell(
        onTap: () => widget.onAccentChanged(color),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 40,
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: selected ? color : Colors.transparent,
                    width: 1.5,
                  ),
                ),
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                  ),
                  child: selected
                      ? Icon(
                          Icons.check_rounded,
                          size: 17,
                          color: color.computeLuminance() > .5
                              ? Colors.black
                              : Colors.white,
                        )
                      : null,
                ),
              ),
              const SizedBox(height: 5),
              Text(label, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      ),
    );
  }
}

class _SettingItem {
  const _SettingItem(
    this.category,
    this.group,
    this.title,
    this.description,
    this.control, {
    this.wideControl = false,
  });
  final _Category category;
  final String group;
  final String title;
  final String description;
  final Widget control;
  final bool wideControl;
}
