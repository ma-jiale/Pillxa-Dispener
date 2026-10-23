import 'package:flutter/material.dart';

import '../widgets/app_menu.dart';
import '../widgets/profile_avatar.dart';

import '../models/demo_model.dart';
import '../theme/app_theme.dart';
import '../theme/app_page.dart';

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
                  final main = _currentMedicine(context);
                  if (area.maxWidth < 800) {
                    return Column(
                      children: [
                        main,
                        if (next != null) ...[
                          const SizedBox(height: 18),
                          _nextMedicine(context, next, horizontal: true),
                        ],
                      ],
                    );
                  }
                  return Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(child: main),
                      if (next != null) ...[
                        const SizedBox(width: 24),
                        SizedBox(
                          width: 224,
                          child: _nextMedicine(context, next),
                        ),
                      ],
                    ],
                  );
                },
              ),

              const SizedBox(height: 24),
              _actions(context),

              const SizedBox(height: 24),
              Text(
                '交互预览 · 虚构药品与演示进度 · 未连接机器',
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(fontSize: 11),
              ),
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
        const PageTitle('正在分药', key: ValueKey('page-title-dispensing')),
        const SizedBox(height: 8),
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
    return Surface(child: child);
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
    final progress = model.count / medicine.target;
    final accent = Theme.of(context).colorScheme.primary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          model.stage == DispenseStage.completed ? '演示完成' : '已摆',
          style: Theme.of(context).textTheme.bodySmall,
        ),
        const SizedBox(height: 8),
        Wrap(
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 7,
          children: [
            Text(
              '${model.count}',
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
            semanticsLabel: '演示摆药进度，已摆 ${model.count} 颗，共 ${medicine.target} 颗',
            semanticsValue: '${(value * 100).round()}',
          ),
        ),
        const SizedBox(height: 14),
        Text(model.stageLabel, style: TextStyle(fontSize: 12, color: accent)),
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
    final image = MedicinePhoto(medicine: medicine);
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
    return Surface(child: content);
  }

  Widget _actions(BuildContext context) {
    final (label, icon, action) = switch (model.stage) {
      DispenseStage.awaitingVerification => (
        '模拟识别药盒',
        Icons.qr_code_scanner_rounded,
        model.verifyBox,
      ),
      DispenseStage.ready => ('开始摆药', Icons.play_arrow_rounded, model.start),
      DispenseStage.running => ('暂停', Icons.pause_rounded, model.pause),
      DispenseStage.paused => ('继续摆药', Icons.play_arrow_rounded, model.start),
      DispenseStage.nextMedicine => (
        '开始下一药',
        Icons.play_arrow_rounded,
        model.start,
      ),
      DispenseStage.completed => (
        '重新体验',
        Icons.replay_rounded,
        model.resetDemo,
      ),
      DispenseStage.cancelled => (
        '重新体验',
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
            onPressed: action,
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
              '查看演示计划',
              () => _showPlan(context),
              icon: Icons.list_alt_rounded,
            ),
            if (model.stage != DispenseStage.cancelled &&
                model.stage != DispenseStage.completed)
              AppMenuAction(
                '结束本次演示',
                () => _cancel(context),
                icon: Icons.stop_circle_outlined,
              ),
          ],
        ),
      ],
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
                '演示设备刻度，数值越小开口越大。',
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
              const Text(
                '本次调整仅改变预览，不发送设备命令。',
                style: TextStyle(fontSize: 12, color: Color(0xff777777)),
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
      title: const Text('本次演示计划'),
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
                    Text('${medicine.target} 颗'),
                  ],
                ),
              ),
            ),
            const Divider(),
            const Text(
              '固定演示数量，用于体验界面；真实处方计划与覆盖日期尚未接入。',
              style: TextStyle(fontSize: 12, color: Color(0xff777777)),
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
        title: const Text('结束本次演示？'),
        content: const Text('当前进度会保留为已取消，不会显示为完成。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('继续当前任务'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('结束演示'),
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
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.medication_outlined, size: 44, color: Color(0xffa0a0a0)),
            SizedBox(height: 12),
            Text(
              '尚未添加药品图片',
              style: TextStyle(fontSize: 12, color: Color(0xff777777)),
            ),
          ],
        ),
      );
    }
    return Image.asset(
      asset,
      fit: BoxFit.contain,
      semanticLabel: '${medicine.name} 药品演示图',
    );
  }
}
