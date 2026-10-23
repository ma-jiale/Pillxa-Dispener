import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/main.dart';
import 'package:pillxai_client/models/demo_model.dart';

void main() {
  DemoModel task() {
    final model = DemoModel(autoTick: false);
    final resident = model.residents.first;
    model.startPreparedTask(resident, [
      for (final medicine in resident.medicines.take(3))
        medicine.copyWith(target: 2),
    ], end: DateTime(2026, 10, 29));
    return model;
  }

  test('跳过当前药保留已有计数，后续完成不把缺药记为全部覆盖', () {
    final model = task();
    addTearDown(model.dispose);
    model.advance();
    final first = model.currentMedicine.id;
    model.skipCurrent();
    expect(model.medicineResults[first]!.outcome, MedicineOutcome.skipped);
    expect(model.medicineResults[first]!.countedParticles, 1);
    expect(model.medicineResults[first]!.confirmedParticles, isNull);
    expect(model.medicineIndex, 1);
    expect(model.count, 0);
    expect(model.stage, DispenseStage.running);
    for (var i = 0; i < 4; i++) {
      model.advance();
    }
    expect(model.stage, DispenseStage.completed);
    expect(model.demoCoverage['r1'], isNull);
    expect(model.stageLabel, contains('有跳过药物'));
  });

  test('人工标记只确认本药目标，不伪造计数，其余完成后允许更新覆盖', () {
    final model = task();
    addTearDown(model.dispose);
    final first = model.currentMedicine.id;
    model.advance();
    model.skipCurrent(markPrepared: true);
    final result = model.medicineResults[first]!;
    expect(result.outcome, MedicineOutcome.confirmedPrepared);
    expect(result.countedParticles, 1);
    expect(result.confirmedParticles, 2);
    for (var i = 0; i < 4; i++) {
      model.advance();
    }
    expect(model.demoCoverage['r1'], DateTime(2026, 10, 29));
    model.skipCurrent();
    expect(model.medicineResults[first], same(result));
  });

  test('批量跳过只处理当前及剩余药，保留已完成结果且不产生覆盖', () {
    final model = task();
    addTearDown(model.dispose);
    final first = model.currentMedicine.id;
    model.advance();
    model.advance();
    model.advance();
    final second = model.currentMedicine.id;
    model.skipRemaining();
    expect(model.medicineResults[first]!.outcome, MedicineOutcome.completed);
    expect(model.medicineResults[second]!.countedParticles, 1);
    expect(
      model.medicineResults.values
          .where((r) => r.outcome == MedicineOutcome.skipped)
          .length,
      2,
    );
    expect(model.active, isFalse);
    expect(model.demoCoverage['r1'], isNull);
    model.advance();
    model.skipRemaining();
    expect(model.medicineResults.length, 3);
    expect(model.count, 1);
  });

  test('暂停时跳过保持下一药暂停，开始新任务清除上一任务结果', () {
    final model = task();
    addTearDown(model.dispose);
    model.pause();
    model.skipCurrent(startNext: false);
    expect(model.stage, DispenseStage.paused);
    model.advance();
    expect(model.count, 0);
    model.skipRemaining();
    model.prepareTask(model.residents[1]);
    expect(model.medicineResults, isEmpty);
    model.skipCurrent();
    expect(model.medicineResults, isEmpty);
  });

  setUpAll(() async {
    await (FontLoader('NotoSansSC')
          ..addFont(rootBundle.load('assets/fonts/NotoSansCJKsc-Regular.otf')))
        .load();
  });

  for (final size in [
    const Size(1280, 800),
    const Size(1024, 600),
    const Size(390, 844),
  ]) {
    testWidgets('跳过弹窗取消、人工确认与整位长者跳过 $size', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final model = task();
      addTearDown(model.dispose);
      final first = model.currentMedicine.id;
      await tester.pumpWidget(
        PillxaiApp(model: model, initiallySignedIn: true),
      );
      await tester.pumpAndSettle();
      Future<void> openSkip() async {
        final skip = find.byKey(const ValueKey('skip-medicine'));
        await tester.ensureVisible(skip);
        await tester.tap(skip);
        await tester.pumpAndSettle();
      }

      await openSkip();
      expect(model.stage, DispenseStage.paused);
      model.advance();
      expect(model.count, 0);
      final checkbox = find.byKey(const ValueKey('skip-mark-prepared'));
      expect(tester.widget<CheckboxListTile>(checkbox).value, isFalse);
      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();
      expect(model.stage, DispenseStage.running);
      expect(model.medicineResults, isEmpty);
      await openSkip();
      await tester.tap(checkbox);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('skip-confirm')));
      await tester.pumpAndSettle();
      expect(
        model.medicineResults[first]!.outcome,
        MedicineOutcome.confirmedPrepared,
      );
      expect(model.medicineResults[first]!.countedParticles, 0);
      expect(model.medicineIndex, 1);
      expect(model.stage, DispenseStage.running);
      await openSkip();
      expect(tester.widget<CheckboxListTile>(checkbox).value, isFalse);
      await tester.tap(checkbox);
      await tester.pumpAndSettle();
      final all = find.byKey(const ValueKey('skip-resident'));
      await tester.ensureVisible(all);
      await tester.tap(all);
      await tester.pumpAndSettle();
      expect(model.active, isFalse);
      expect(
        model.medicineResults[first]!.outcome,
        MedicineOutcome.confirmedPrepared,
      );
      expect(
        model.medicineResults.values
            .where((r) => r.outcome == MedicineOutcome.skipped)
            .length,
        2,
      );
      expect(model.demoCoverage['r1'], isNull);
      expect(find.byKey(const ValueKey('prepare-r1')), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
