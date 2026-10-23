import 'package:flutter/material.dart';

import '../models/demo_model.dart';
import '../models/preparation_plan.dart';
import 'dispensing_page.dart';
import '../widgets/profile_avatar.dart';
import '../widgets/app_menu.dart';
import '../theme/app_page.dart';
import '../theme/app_theme.dart';

class PreparationPage extends StatefulWidget {
  const PreparationPage({super.key, required this.model});
  final DemoModel model;
  @override
  State<PreparationPage> createState() => _PreparationPageState();
}

class _PreparationPageState extends State<PreparationPage> {
  bool early = false;
  DateTime get today {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  DateTime start(Resident resident) {
    final coverage = widget.model.demoCoverage[resident.id];
    if (coverage != null && !coverage.isBefore(today)) {
      return DateTime(coverage.year, coverage.month, coverage.day + 1);
    }
    return today.add(Duration(days: widget.model.startTomorrow ? 1 : 0));
  }

  bool isEarly(Resident resident) =>
      (widget.model.demoCoverage[resident.id]?.difference(today).inDays ??
          -1) >=
      2;
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: widget.model,
    builder: (context, _) {
      if (widget.model.active) return DispensingPage(model: widget.model);
      final residents = widget.model.residents
          .where(
            (r) => PreparationPlan(
              r,
              start(r),
              7,
              bedtime: widget.model.bedtime,
            ).medicines.isNotEmpty,
          )
          .toList();
      final visible = residents.where((r) => isEarly(r) == early).toList();
      return Padding(
        padding: AppPage.insets(context),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              children: [
                for (final value in [false, true])
                  TextButton(
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xff232323),
                      backgroundColor: early == value
                          ? const Color(0xffefeff1)
                          : Colors.transparent,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    onPressed: () => setState(() => early = value),
                    child: Text(
                      '${value ? '提前准备' : '待准备'} ${residents.where((r) => isEarly(r) == value).length}',
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 16),
            Expanded(
              child: visible.isEmpty
                  ? const Center(child: Text('暂无需要准备的长者'))
                  : Align(
                      alignment: Alignment.topCenter,
                      child: Surface(
                        padding: const EdgeInsets.symmetric(horizontal: 24),
                        child: ListView.builder(
                          shrinkWrap: true,
                          padding: EdgeInsets.zero,
                          itemCount: visible.length,
                          itemBuilder: (context, index) {
                            final resident = visible[index];
                            final plan = PreparationPlan(
                              resident,
                              start(resident),
                              7,
                              bedtime: widget.model.bedtime,
                            );
                            return Container(
                              padding: const EdgeInsets.symmetric(vertical: 20),
                              decoration: BoxDecoration(
                                border: index < visible.length - 1
                                    ? const Border(
                                        bottom: BorderSide(
                                          color: Color(0xffe8e8e8),
                                        ),
                                      )
                                    : null,
                              ),
                              child: LayoutBuilder(
                                builder: (context, bounds) {
                                  final identity = ResidentIdentity(
                                    name: resident.name,
                                    bed: resident.bed,
                                    asset: resident.avatarAsset,
                                  );
                                  final details = Text(
                                    '${early ? '可提前准备下一周期' : '待准备'}\n${plan.medicines.length} 种药 · ${plan.dates}',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: Color(0xff737373),
                                    ),
                                  );
                                  final action = OutlinedButton(
                                    key: ValueKey('prepare-${resident.id}'),
                                    onPressed: () => showDialog<void>(
                                      context: context,
                                      barrierDismissible: false,
                                      builder: (_) => PreparationDialog(
                                        model: widget.model,
                                        resident: resident,
                                        start: plan.start,
                                      ),
                                    ),
                                    child: const Text('开始摆药'),
                                  );
                                  if (bounds.maxWidth < 470) {
                                    return Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        identity,
                                        const SizedBox(height: 8),
                                        details,
                                        const SizedBox(height: 12),
                                        action,
                                      ],
                                    );
                                  }
                                  return Row(
                                    children: [
                                      Expanded(child: identity),
                                      Expanded(child: details),
                                      action,
                                    ],
                                  );
                                },
                              ),
                            );
                          },
                        ),
                      ),
                    ),
            ),
          ],
        ),
      );
    },
  );
}

class PreparationDialog extends StatefulWidget {
  const PreparationDialog({
    super.key,
    required this.model,
    required this.resident,
    required this.start,
  });
  final DemoModel model;
  final Resident resident;
  final DateTime start;
  @override
  State<PreparationDialog> createState() => _PreparationDialogState();
}

class _PreparationDialogState extends State<PreparationDialog> {
  final _medicinesScroll = ScrollController();
  int days = 7;
  bool get opening => widget.model.boxFeedback.value == BoxFeedback.opening;
  String get feedback => widget.model.boxFeedback.value.name;
  late PreparationPlan plan;
  @override
  void dispose() {
    _medicinesScroll.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    rebuildPlan();
    widget.model.boxFeedback.value = BoxFeedback.disconnected;
  }

  void rebuildPlan() {
    plan = PreparationPlan(
      widget.resident,
      widget.start,
      days,
      bedtime: widget.model.bedtime,
    );
  }

  bool get matched => !opening && feedback == 'match';
  @override
  Widget build(BuildContext context) => ValueListenableBuilder<BoxFeedback>(
    valueListenable: widget.model.boxFeedback,
    builder: (context, _, _) => Dialog(
      insetPadding: const EdgeInsets.all(16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 640, maxHeight: 720),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                '确认摆药信息',
                style: TextStyle(fontSize: 19, fontWeight: FontWeight.w500),
              ),
              const SizedBox(height: 16),
              ResidentIdentity(
                name: widget.resident.name,
                bed: widget.resident.bed,
                asset: widget.resident.avatarAsset,
                size: 44,
                nameSize: 18,
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 20,
                runSpacing: 8,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text('覆盖日期  ${plan.dates}'),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('本次天数  '),
                      SizedBox(
                        width: 94,
                        child: AppSelect<int>(
                          key: const ValueKey('preparation-days'),
                          value: days,
                          label: '本次天数',
                          options: [
                            for (var i = 1; i <= 7; i++)
                              AppSelectOption(i, '$i 天'),
                          ],
                          onChanged: (value) => setState(() {
                            days = value;
                            rebuildPlan();
                          }),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
              const Divider(),
              Row(
                children: [
                  Expanded(child: Text('本次用药 · ${plan.medicines.length} 种')),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    key: const ValueKey('pattern-open'),
                    onPressed: () => showDialog<void>(
                      context: context,
                      builder: (_) => PatternDialog(plan: plan),
                    ),
                    icon: const Icon(Icons.grid_on_rounded, size: 18),
                    label: const Text('预览摆药图案'),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              Flexible(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    DefaultTextStyle.merge(
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xff737373),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 8, right: 8),
                        child: _drugRow([
                          Text('药物'),
                          Text('早'),
                          Text('午'),
                          Text('晚'),
                          if (widget.model.bedtime) const Text('睡前'),
                          Text('合计'),
                        ]),
                      ),
                    ),
                    Flexible(
                      child: Scrollbar(
                        controller: _medicinesScroll,
                        thumbVisibility: true,
                        child: ListView(
                          controller: _medicinesScroll,
                          padding: const EdgeInsets.only(right: 8),
                          key: const ValueKey('confirmation-medicines'),
                          children: [
                            for (final m in plan.medicines)
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                  vertical: 10,
                                ),
                                child: _drugRow([
                                  Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(m.name),
                                      Text(
                                        '${m.strength} · ${m.form}',
                                        style: const TextStyle(
                                          fontSize: 11,
                                          color: Colors.grey,
                                        ),
                                      ),
                                    ],
                                  ),
                                  for (final dose in m.doses.values.take(
                                    widget.model.bedtime ? 4 : 3,
                                  ))
                                    Text(dose == 0 ? '—' : formatDose(dose)),
                                  Text('${m.target}颗'),
                                ]),
                              ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              if (plan.issue != null)
                Text(
                  plan.issue!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xfff5f5f5),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      opening
                          ? '正在开仓…'
                          : switch (feedback) {
                              'match' => '药盒匹配，已确认 ${widget.resident.name}',
                              'other' => '请更换为${widget.resident.name}的药盒',
                              'failed' => '开仓失败，请检查设备连接',
                              'disconnected' => '摆药机未连接，请先连接设备',
                              _ => '请放入${widget.resident.name}的药盒',
                            },
                      style: TextStyle(
                        color: feedback == 'other'
                            ? Theme.of(context).colorScheme.error
                            : null,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('取消'),
                  ),
                  const SizedBox(width: 12),
                  FilledButton(
                    key: const ValueKey('confirm-dispense'),
                    onPressed:
                        matched &&
                            plan.medicines.isNotEmpty &&
                            plan.issue == null
                        ? () {
                            if (widget.model.startPreparedTask(
                              widget.resident,
                              plan.medicines,
                              end: plan.end,
                            )) {
                              Navigator.pop(context);
                            }
                          }
                        : null,
                    child: const Text('开始摆药'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    ),
  );
  Widget _drugRow(List<Widget> cells) => LayoutBuilder(
    builder: (context, bounds) => Row(
      children: [
        Expanded(child: cells.first),
        for (var i = 1; i < cells.length; i++)
          SizedBox(
            width: bounds.maxWidth < 440 ? 36 : 48,
            child: Align(
              alignment: i == cells.length - 1
                  ? Alignment.centerRight
                  : Alignment.center,
              child: cells[i],
            ),
          ),
      ],
    ),
  );
}

class PatternDialog extends StatefulWidget {
  const PatternDialog({super.key, required this.plan});
  final PreparationPlan plan;
  @override
  State<PatternDialog> createState() => _PatternDialogState();
}

class _PatternDialogState extends State<PatternDialog> {
  int? highlighted;
  String? detail;
  static const colors = [
    Color(0xff82b4e7),
    Color(0xffe6ae70),
    Color(0xff79b49a),
    Color(0xffbf7591),
    Color(0xff9681bf),
    Color(0xff50b4b1),
    Color(0xffa6805d),
    Color(0xffc8bd51),
    Color(0xff758399),
  ];
  Color color(int index) => colors[index % colors.length];
  @override
  Widget build(BuildContext context) {
    final p = widget.plan;
    final metadataStyle = DefaultTextStyle.of(context).style
        .merge(const TextStyle(color: Colors.grey, fontSize: 12));
    final separator = TextPainter(
      text: TextSpan(text: ' · ', style: metadataStyle),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
    )..layout();
    final separatorWidth = separator.width;
    separator.dispose();
    final legend = Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 0; i < p.medicines.length; i++)
          TextButton(
            onPressed: () =>
                setState(() => highlighted = highlighted == i ? null : i),
            style: TextButton.styleFrom(
              backgroundColor: highlighted == i
                  ? const Color(0xffeeeeee)
                  : null,
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(top: 5, right: 8),
                  child: dot(i),
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p.medicines[i].name),
                      Text(
                        '${p.medicines[i].strength} · ${p.medicines[i].form}\n${p.medicines[i].target}颗',
                        style: const TextStyle(
                          fontSize: 11,
                          color: Colors.grey,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
    final grid = SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: SizedBox(
        width: 560,
        child: Table(
          columnWidths: const {0: FixedColumnWidth(34)},
          defaultVerticalAlignment: TableCellVerticalAlignment.middle,
          children: [
            TableRow(
              children: [
                const SizedBox(),
                for (var day = 0; day < 7; day++)
                  Padding(
                    padding: const EdgeInsets.all(6),
                    child: Text(
                      day < p.days
                          ? PreparationPlan.date(
                              DateTime(
                                p.start.year,
                                p.start.month,
                                p.start.day + day,
                              ),
                            )
                          : '—',
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 12),
                    ),
                  ),
              ],
            ),
            for (var slot = 0; slot < (p.bedtime ? 4 : 3); slot++)
              TableRow(
                children: [
                  Text(['早', '午', '晚', '睡前'][slot]),
                  for (var day = 0; day < 7; day++) cell(day, slot),
                ],
              ),
          ],
        ),
      ),
    );
    return Dialog(
      insetPadding: const EdgeInsets.all(16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900, maxHeight: 740),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('摆药图案', style: TextStyle(fontSize: 20)),
              const SizedBox(height: 6),
              Text.rich(
                key: const ValueKey('pattern-metadata'),
                TextSpan(
                  children: [
                    TextSpan(text: p.resident.name),
                    WidgetSpan(child: SizedBox(width: separatorWidth)),
                    TextSpan(text: p.dates),
                  ],
                ),
                style: metadataStyle,
              ),
              const SizedBox(height: 18),
              Flexible(
                child: LayoutBuilder(
                  builder: (context, bounds) => SingleChildScrollView(
                    child: bounds.maxWidth > 740
                        ? Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(child: grid),
                              const SizedBox(width: 16),
                              SizedBox(width: 220, child: legend),
                            ],
                          )
                        : Column(
                            children: [
                              grid,
                              const SizedBox(height: 16),
                              legend,
                            ],
                          ),
                  ),
                ),
              ),
              if (detail != null)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Text(detail!, style: const TextStyle(fontSize: 12)),
                ),
              const SizedBox(height: 16),
              Row(
                children: [
                  const Spacer(),
                  FilledButton(
                    key: const ValueKey('pattern-close'),
                    onPressed: () => Navigator.pop(context),
                    child: const Text('关闭'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget dot(int index) => Container(
    width: 15,
    height: 15,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      color: color(index).withValues(
        alpha: highlighted == null || highlighted == index ? 1 : .15,
      ),
    ),
  );
  Widget cell(int day, int slot) {
    final p = widget.plan;
    final date = DateTime(p.start.year, p.start.month, p.start.day + day);
    final counts = [
      for (final m in p.medicines)
        day < p.days ? PreparationPlan.particles(m, slot, date) : 0,
    ];
    return Padding(
      padding: const EdgeInsets.all(3),
      child: InkWell(
        onTap: day >= p.days
            ? null
            : () => setState(
                () => detail =
                    '${PreparationPlan.date(date)} ${['早', '午', '晚', '睡前'][slot]}：${[for (var i = 0; i < counts.length; i++)
                      if (counts[i] > 0) '${p.medicines[i].name} ${counts[i]}颗'].join('，')}',
              ),
        child: Container(
          constraints: const BoxConstraints(minHeight: 92),
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: day < p.days ? Colors.white : const Color(0xfff0f0f0),
            border: Border.all(color: const Color(0xffe5e5e5)),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Wrap(
            spacing: 4,
            runSpacing: 5,
            alignment: WrapAlignment.center,
            children: [
              for (var i = 0; i < counts.length; i++)
                for (var n = 0; n < counts[i]; n++) dot(i),
            ],
          ),
        ),
      ),
    );
  }
}
