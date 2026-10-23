import 'package:flutter/material.dart';

import '../widgets/app_menu.dart';
import '../widgets/profile_avatar.dart';
import '../widgets/medicine_card_deck.dart';

import '../models/demo_model.dart';
import '../theme/app_page.dart';

enum _SkipChoice { current, prepared, remaining }

class DispensingPage extends StatelessWidget {
  const DispensingPage({super.key, required this.model});
  final DemoModel model;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: model,
    builder: (context, _) => LayoutBuilder(
      builder: (context, bounds) {
        final compact = bounds.maxWidth < 700;
        return SingleChildScrollView(
          padding: AppPage.insets(context),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _header(context, compact),
              const SizedBox(height: 38),
              LayoutBuilder(
                builder: (context, area) {
                  final next = model.nextMedicine;
                  final stacked = area.maxWidth < 800;
                  return MedicineCardDeck(
                    medicineId: model.currentMedicine.id,
                    nextMedicineId: next?.id,
                    current: _currentMedicine(context),
                    next: next == null
                        ? null
                        : _nextMedicine(context, next, horizontal: stacked),
                    stacked: stacked,
                  );
                },
              ),

              const SizedBox(height: 24),
              _actions(context),
            ],
          ),
        );
      },
    ),
  );

  Widget _header(BuildContext context, bool compact) {
    final heading = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ResidentIdentity(
          name: model.taskResidentName,
          bed: model.taskResidentBed,
          asset: model.taskResidentAvatar,
        ),
      ],
    );
    final stage = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 6,
          height: 6,
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 9),
        Text(
          model.stageLabel,
          style: const TextStyle(fontSize: 12, color: Color(0xff666666)),
        ),
      ],
    );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(child: heading),
        if (!compact) ...[const SizedBox(width: 24), stage],
      ],
    );
  }

  Widget _currentMedicine(BuildContext context) {
    final medicine = model.currentMedicine;
    final text = _medicineInformation(context, medicine);
    final photo = ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: ColoredBox(
        color: Colors.white,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: MedicinePhoto(medicine: medicine),
        ),
      ),
    );
    final child = LayoutBuilder(
      builder: (context, bounds) {
        final vertical = bounds.maxWidth < 510;
        if (vertical) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              SizedBox(height: 230, child: photo),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 24, 12, 12),
                child: text,
              ),
            ],
          );
        }
        return SizedBox(
          height: 410,
          child: Row(
            children: [
              Expanded(flex: 52, child: SizedBox.expand(child: photo)),
              const SizedBox(width: 28),
              Expanded(flex: 48, child: text),
            ],
          ),
        );
      },
    );
    return child;
  }

  Widget _medicineInformation(BuildContext context, Medicine medicine) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _medicineIdentity(context, medicine),
        const SizedBox(height: 54),
        _progressDetails(context, medicine),
      ],
    );
  }

  Widget _medicineIdentity(BuildContext context, Medicine medicine) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    mainAxisSize: MainAxisSize.min,
    children: [
      Text(
        '当前药物',
        style: Theme.of(context).textTheme.bodySmall
            ?.copyWith(fontSize: 11, letterSpacing: 1),
      ),
      const SizedBox(height: 12),
      Text(
        medicine.name,
        style: const TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.w600,
          letterSpacing: -.6,
        ),
      ),
      const SizedBox(height: 8),
      Text(
        '${medicine.form} · ${medicine.strength}',
        style: const TextStyle(fontSize: 14, color: Color(0xff777777)),
      ),
    ],
  );

  Widget _progressDetails(BuildContext context, Medicine medicine) {
    final count = model.count;
    final stageLabel = model.stageLabel;
    final completed = model.stage == DispenseStage.completed;
    final progress = count / medicine.target;
    final accent = Theme.of(context).colorScheme.primary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          completed ? (model.hasSkippedMedicines ? '本次已结束' : '本次已完成') : '已摆',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 7,
          children: [
            Text(
              '$count',
              style: const TextStyle(
                fontSize: 42,
                fontWeight: FontWeight.w500,
                height: 1.2,
              ),
            ),
            Text(
              '/ ${medicine.target}',
              style: const TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w400,
                color: Color(0xff9a9a9a),
              ),
            ),
            const Text(
              '颗',
              style: TextStyle(fontSize: 12, color: Color(0xff888888)),
            ),
          ],
        ),
        const SizedBox(height: 18),
        TweenAnimationBuilder<double>(
          tween: Tween(end: progress),
          duration: const Duration(milliseconds: 400),
          builder: (context, value, _) => LinearProgressIndicator(
            value: value,
            minHeight: 6,
            color: accent,
            backgroundColor: const Color(0xffe7e7e7),
            borderRadius: BorderRadius.circular(100),
            semanticsLabel: '摆药进度，已摆 $count 颗，共 ${medicine.target} 颗',
            semanticsValue: '${(value * 100).round()}',
          ),
        ),
        const SizedBox(height: 14),
        Text(stageLabel, style: TextStyle(fontSize: 12, color: accent)),
      ],
    );
  }

  Widget _nextMedicine(
    BuildContext context,
    Medicine medicine, {
    bool horizontal = false,
  }) {
    final details = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('下一药', style: Theme.of(context).textTheme.bodySmall),
        const SizedBox(height: 16),
        Text(
          medicine.name,
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w500),
        ),
        const SizedBox(height: 5),
        Text(
          '${medicine.form} · ${medicine.strength}',
          style: const TextStyle(fontSize: 12, color: Color(0xff777777)),
        ),
      ],
    );
    final image = ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: ColoredBox(
        color: Colors.white,
        child: Padding(
          padding: const EdgeInsets.all(8),
          child: MedicinePhoto(medicine: medicine),
        ),
      ),
    );
    final content = horizontal
        ? Row(
            children: [
              Expanded(child: details),
              SizedBox(width: 90, height: 90, child: image),
            ],
          )
        : Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              details,
              const SizedBox(height: 30),
              SizedBox(height: 210, child: image),
            ],
          );
    return content;
  }

  Widget _actions(BuildContext context) {
    final (label, icon, action) = switch (model.stage) {
      DispenseStage.awaitingVerification => (
        '等待药盒识别',
        Icons.qr_code_scanner_rounded,
        model.verifyBox,
      ),
      DispenseStage.ready => ('开始摆药', Icons.play_arrow_rounded, model.start),
      DispenseStage.running => ('暂停', Icons.pause_rounded, model.pause),
      DispenseStage.paused => ('继续摆药', Icons.play_arrow_rounded, model.start),
      DispenseStage.completed => (
        '重新准备',
        Icons.replay_rounded,
        model.resetDemo,
      ),
      DispenseStage.cancelled => (
        '重新准备',
        Icons.replay_rounded,
        model.resetDemo,
      ),
    };
    return Wrap(
      spacing: 12,
      runSpacing: 12,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        SizedBox(
          width: 210,
          child: FilledButton(
            key: const ValueKey('dispense-primary'),
            onPressed: model.stage == DispenseStage.awaitingVerification
                ? null
                : action,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 20),
                const SizedBox(width: 10),
                Flexible(child: Text(label)),
              ],
            ),
          ),
        ),
        OutlinedButton.icon(
          key: const ValueKey('skip-medicine'),
          onPressed: model.active ? () => _skip(context) : null,
          icon: const Icon(Icons.skip_next_rounded, size: 20),
          label: const Text('跳过'),
        ),
        OutlinedButton.icon(
          key: const ValueKey('adjust-opening'),
          onPressed:
              model.stage == DispenseStage.completed ||
                  model.stage == DispenseStage.cancelled
              ? null
              : () => _adjustOpening(context),
          icon: const Icon(Icons.tune_rounded, size: 18),
          label: const Text('调整开口'),
        ),
        AppActionMenu(
          tooltip: '更多操作',
          actions: [
            AppMenuAction(
              '查看本次计划',
              () => _showPlan(context),
              icon: Icons.list_alt_rounded,
            ),
            if (model.stage != DispenseStage.cancelled &&
                model.stage != DispenseStage.completed)
              AppMenuAction(
                '结束本次摆药',
                () => _cancel(context),
                icon: Icons.stop_circle_outlined,
              ),
          ],
        ),
      ],
    );
  }

  Future<void> _skip(BuildContext context) async {
    if (!model.active) return;
    final task = model.taskMedicines;
    final index = model.medicineIndex;
    final medicine = model.currentMedicine;
    final wasRunning = model.stage == DispenseStage.running;
    final remaining = task.length - index;
    final messenger = ScaffoldMessenger.of(context);
    model.pause();
    var markPrepared = false;
    final choice = await showDialog<_SkipChoice>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, update) => AlertDialog(
          scrollable: true,
          title: const Text('跳过当前药物？'),
          content: SizedBox(
            width: 420,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  '${model.taskResidentName}  ${model.taskResidentBed}',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xff737373),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  medicine.name,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${medicine.strength} · 已摆 ${model.count} / ${medicine.target} 颗',
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xff737373),
                  ),
                ),
                const SizedBox(height: 16),
                CheckboxListTile(
                  key: const ValueKey('skip-mark-prepared'),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  value: markPrepared,
                  onChanged: (value) =>
                      update(() => markPrepared = value ?? false),
                  title: const Text(
                    '将此药标记为已摆好',
                    style: TextStyle(fontSize: 14),
                  ),
                  subtitle: const Text(
                    '勾选表示已人工核对本次用量全部摆齐。',
                    style: TextStyle(fontSize: 12, color: Color(0xff737373)),
                  ),
                ),
                const SizedBox(height: 12),
                const Divider(height: 1),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  key: const ValueKey('skip-resident'),
                  onPressed: () =>
                      Navigator.pop(context, _SkipChoice.remaining),
                  icon: const Icon(Icons.fast_forward_rounded, size: 18),
                  label: const Text('跳过该长者所有剩余药物'),
                ),
                const SizedBox(height: 8),
                Text(
                  '包括当前药，共 $remaining 种；均记为跳过，不标记已摆好。',
                  style: const TextStyle(
                    fontSize: 12,
                    color: Color(0xff737373),
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('取消'),
            ),
            FilledButton(
              key: const ValueKey('skip-confirm'),
              onPressed: () => Navigator.pop(
                context,
                markPrepared ? _SkipChoice.prepared : _SkipChoice.current,
              ),
              child: Text(markPrepared ? '标记已摆好' : '确认跳过'),
            ),
          ],
        ),
      ),
    );
    // Do not apply a delayed decision to another medicine or a replaced task.
    if (!identical(task, model.taskMedicines) ||
        index != model.medicineIndex ||
        !model.active) {
      return;
    }
    if (choice == null) {
      if (wasRunning) model.start();
      return;
    }
    if (choice == _SkipChoice.remaining) {
      model.skipRemaining();
    } else {
      model.skipCurrent(
        markPrepared: choice == _SkipChoice.prepared,
        startNext: wasRunning,
      );
    }
    if (model.active) return;
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(switch (choice) {
            _SkipChoice.remaining => '已跳过该长者剩余 $remaining 种药物',
            _SkipChoice.prepared => '已将${medicine.name}标记为已摆好',
            _SkipChoice.current => '已跳过${medicine.name}',
          }),
        ),
      );
  }

  Future<void> _adjustOpening(BuildContext context) => showDialog<void>(
    context: context,
    builder: (context) => ListenableBuilder(
      listenable: model,
      builder: (context, _) => AlertDialog(
        title: Text(
          '调整开口 · ${model.currentMedicine.name}',
          style: const TextStyle(fontSize: 18),
        ),
        content: SizedBox(
          width: 380,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                '数值越小，开口越大。',
                style: TextStyle(fontSize: 13, color: Color(0xff777777)),
              ),
              const SizedBox(height: 24),
              Text(
                model.opening.toStringAsFixed(2),
                style: const TextStyle(fontSize: 36),
              ),
              Slider(
                value: model.opening,
                min: 0,
                max: 1,
                divisions: 100,
                label: model.opening.toStringAsFixed(2),
                onChanged: model.setOpening,
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('完成'),
          ),
        ],
      ),
    ),
  );

  Future<void> _showPlan(BuildContext context) => showDialog<void>(
    context: context,
    builder: (context) => AlertDialog(
      scrollable: true,
      title: const Text('本次摆药计划'),
      content: SizedBox(
        width: 420,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${model.taskResidentName} · ${model.taskResidentBed}'),
            const SizedBox(height: 18),
            ...model.taskMedicines.map(
              (medicine) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 10),
                child: Row(
                  children: [
                    Expanded(
                      child: Text('${medicine.name} · ${medicine.form}'),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text('${medicine.target} 颗'),
                        if (model.medicineResults[medicine.id]
                            case final result?)
                          Text(
                            result.label,
                            style: const TextStyle(
                              fontSize: 12,
                              color: Color(0xff737373),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('关闭'),
        ),
      ],
    ),
  );

  Future<void> _cancel(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('结束本次摆药？'),
        content: const Text('当前进度会保留为已取消，不会显示为完成。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('继续当前任务'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('结束摆药'),
          ),
        ],
      ),
    );
    if (confirmed == true) model.cancel();
  }
}

class MedicinePhoto extends StatelessWidget {
  const MedicinePhoto({super.key, required this.medicine});
  final Medicine medicine;
  @override
  Widget build(BuildContext context) {
    final asset = medicine.imageAsset;
    if (asset == null) {
      return Container(
        color: const Color(0xfff6f6f6),
        alignment: Alignment.center,
        child: LayoutBuilder(
          builder: (context, bounds) {
            const icon = Icon(
              Icons.medication_outlined,
              size: 44,
              color: Color(0xffa0a0a0),
            );
            if (bounds.maxHeight < 120 || bounds.maxWidth < 120) return icon;
            return const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                icon,
                SizedBox(height: 12),
                Text(
                  '尚未添加药品图片',
                  style: TextStyle(fontSize: 12, color: Color(0xff777777)),
                ),
              ],
            );
          },
        ),
      );
    }
    return Image.asset(
      asset,
      fit: BoxFit.contain,
      semanticLabel: '${medicine.name} 药品图片',
    );
  }
}
